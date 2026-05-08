"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
  proyectoSchema,
  editProyectoSchema,
  type ProyectoData,
  type EditProyectoData,
} from "@/schemas/proyectoSchema";
import {
  contratoTieneProrroga,
  getFechaFinVigente,
} from "@/lib/fechas";
import { transferirProyecto } from "@/services/proyectos.service";
import { materializarMesesTramo } from "@/services/usoMensual.service";

// estado_id 5 = sin_asignar (default estado proyecto)
// estado_contratacion_id 1 = en_proceso (default estado contratacion)
const DEFAULT_ESTADO_PROYECTO_ID = 5;
const DEFAULT_ESTADO_CONTRATACION_ID = 1;

export async function createProyecto(data: ProyectoData) {
  const result = proyectoSchema.safeParse(data);
  if (!result.success) {
    return { success: false, message: "Datos inválidos" };
  }

  const {
    nombre,
    fecha_inicio,
    fecha_fin,
    area_id,
    contrato_id,
    horas_proyectadas,
    uso_mensual,
  } = result.data;

  const fechaInicioProyecto = new Date(fecha_inicio);
  const fechaFinProyecto = new Date(fecha_fin);

  try {
    await prisma.$transaction(async (tx) => {
      const proyecto = await tx.proyectos.create({
        data: {
          nombre,
          fecha_inicio: fechaInicioProyecto,
          fecha_fin: fechaFinProyecto,
          area_id,
          estado_id: DEFAULT_ESTADO_PROYECTO_ID,
          estado_contratacion_id: DEFAULT_ESTADO_CONTRATACION_ID,
        },
      });

      if (contrato_id && horas_proyectadas != null) {
        const contrato = await tx.contratos.findUnique({
          where: { id: contrato_id },
          select: {
            cantidad_horas: true,
            fecha_fin: true,
            incrementos: { select: { horas_extra: true } },
            proyectos: { select: { horas_proyectadas: true } },
            prorrogas: { select: { fecha_fin: true } },
          },
        });

        if (!contrato) {
          throw new Error("Contrato no encontrado");
        }

        // Si el contrato tiene prórroga, el proyecto NO puede exceder la fecha
        // fin vigente. Sin prórroga, puede exceder libremente (queda en rojo
        // visualmente — fase 5).
        if (contratoTieneProrroga(contrato)) {
          const fechaFinVigente = getFechaFinVigente(contrato);
          if (fechaFinVigente && fechaFinProyecto > fechaFinVigente) {
            throw new Error(
              "La fecha fin del proyecto no puede exceder la fecha fin vigente del contrato porque el contrato tiene prórroga",
            );
          }
        }

        const horasExtra = contrato.incrementos.reduce(
          (sum: number, inc: { horas_extra: number }) => sum + inc.horas_extra,
          0,
        );
        const horasTotales =
          contrato.cantidad_horas != null
            ? contrato.cantidad_horas + horasExtra
            : null;
        const horasAsignadas = contrato.proyectos.reduce(
          (sum, p) => sum + p.horas_proyectadas,
          0,
        );

        if (horasTotales != null) {
          const horasDisponibles = Math.max(horasTotales - horasAsignadas, 0);
          if (horas_proyectadas > horasDisponibles) {
            throw new Error(
              `Las horas proyectadas superan las horas disponibles del contrato (${horasDisponibles} hs)`,
            );
          }
        }

        const cp = await tx.contrato_proyectos.create({
          data: {
            contrato_id,
            proyecto_id: proyecto.id,
            horas_proyectadas,
            // Por defecto el tramo cubre todo el rango del proyecto.
            // Cuando se transfiera (Fase 4) se cierra este tramo y se crea
            // otro bajo el contrato destino.
            fecha_inicio_vinculo: fechaInicioProyecto,
            fecha_fin_vinculo: fechaFinProyecto,
          },
        });

        const registrosMensuales = (uso_mensual ?? []).filter(
          (u) => u.horas_estimadas != null,
        );
        if (registrosMensuales.length > 0) {
          // Primero los meses con valor del wizard. Luego materializamos el
          // resto del rango con default 0 (skipDuplicates respeta lo ya creado).
          await tx.uso_mensual.createMany({
            data: registrosMensuales.map((u) => ({
              contrato_proyecto_id: cp.id,
              anio: u.anio,
              mes: u.mes,
              horas_estimadas: u.horas_estimadas!,
            })),
          });
        }
        await materializarMesesTramo({
          tx,
          contrato_proyecto_id: cp.id,
          fecha_inicio: fechaInicioProyecto,
          fecha_fin: fechaFinProyecto,
        });
      }
    });

    revalidatePath("/proyectos");
    return { success: true, message: "Proyecto creado correctamente" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al crear el proyecto";
    return { success: false, message };
  }
}

export async function updateProyecto(id: number, data: EditProyectoData) {
  const result = editProyectoSchema.safeParse(data);
  if (!result.success) return { success: false, message: "Datos inválidos" };

  const { nombre, fecha_inicio, fecha_fin, area_id, estado_id, estado_contratacion_id } =
    result.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.proyectos.update({
        where: { id },
        data: {
          nombre,
          fecha_inicio: new Date(fecha_inicio),
          fecha_fin: new Date(fecha_fin),
          area_id,
          estado_id,
          estado_contratacion_id,
        },
      });

      // Si el proyecto nunca fue transferido (un solo tramo), sincronizar fechas del tramo.
      const tramos = await tx.contrato_proyectos.findMany({
        where: { proyecto_id: id },
      });
      if (tramos.length === 1) {
        await tx.contrato_proyectos.update({
          where: { id: tramos[0].id },
          data: {
            fecha_inicio_vinculo: new Date(fecha_inicio),
            fecha_fin_vinculo: new Date(fecha_fin),
          },
        });
      }
    });

    revalidatePath("/proyectos");
    return { success: true, message: "Proyecto actualizado correctamente" };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Error al actualizar el proyecto",
    };
  }
}

export async function transferirProyectoAction(input: {
  proyecto_id: number;
  contrato_origen_id: number;
  contrato_destino_id: number;
  fecha_corte: string;
  horas_destino: number;
}) {
  if (
    !Number.isInteger(input.proyecto_id) ||
    !Number.isInteger(input.contrato_origen_id) ||
    !Number.isInteger(input.contrato_destino_id) ||
    !Number.isInteger(input.horas_destino) ||
    input.horas_destino < 0 ||
    !input.fecha_corte
  ) {
    return { success: false, message: "Datos inválidos para la transferencia" };
  }

  try {
    await transferirProyecto({
      proyecto_id: input.proyecto_id,
      contrato_origen_id: input.contrato_origen_id,
      contrato_destino_id: input.contrato_destino_id,
      fecha_corte: new Date(input.fecha_corte),
      horas_destino: input.horas_destino,
    });
    revalidatePath("/proyectos");
    revalidatePath("/proveedores");
    revalidatePath("/contratos");
    return { success: true, message: "Proyecto transferido correctamente" };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Error al transferir proyecto",
    };
  }
}
