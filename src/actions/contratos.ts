"use server";

import {
  contratoWizardSchema,
  prorrogaSchema,
  incrementoSchema,
  PROVEEDOR_MINISTERIO_ID,
  type ContratoWizardData,
  type ProrrogaData,
  type IncrementoData,
} from "@/schemas/contratoWizardSchema";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { validarSolapeTramoProyecto } from "@/services/contratos.service";
import { materializarMesesTramo } from "@/services/usoMensual.service";

export async function createContratoCompleto(data: ContratoWizardData) {
  const result = contratoWizardSchema.safeParse(data);

  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    result.error.issues.forEach((issue) => {
      if (issue.path.length > 0) {
        const key = issue.path[0].toString();
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
    });
    return { success: false, message: "Datos inválidos", errors: fieldErrors };
  }

  const {
    nombre,
    numero_expediente,
    proveedor_id,
    fecha_inicio,
    fecha_fin,
    renglones,
    es_accesoridad,
    contrato_principal_id,
    observaciones,
  } = result.data;

  const existing = await prisma.contratos.findFirst({
    where: { numero_expediente: { equals: numero_expediente } },
  });

  if (existing) {
    return {
      success: false,
      message: "Ya existe un contrato con ese número de expediente",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const contrato = await tx.contratos.create({
        data: {
          nombre,
          numero_expediente,
          proveedor_id,
          fecha_inicio: new Date(fecha_inicio),
          fecha_fin: fecha_fin ? new Date(fecha_fin) : null,
          es_accesoridad: es_accesoridad ?? null,
          contrato_principal_id: contrato_principal_id ?? null,
          observaciones: observaciones ?? null,
        },
      });

      if (proveedor_id === PROVEEDOR_MINISTERIO_ID) {
        await tx.contrato_renglones.create({
          data: { contrato_id: contrato.id, numero: 1, cantidad_horas: null, valor_hora: null },
        });
      } else if (renglones && renglones.length > 0) {
        await tx.contrato_renglones.createMany({
          data: renglones.map((r, i) => ({
            contrato_id: contrato.id,
            numero: i + 1,
            cantidad_horas: r.cantidad_horas,
            valor_hora: r.valor_hora ?? null,
          })),
        });
      }
    });

    revalidatePath("/contratos");

    return {
      success: true,
      message: "El contrato ha sido creado correctamente",
    };
  } catch (error) {
    console.error("Error creating contrato:", error);
    return {
      success: false,
      message: "Ha ocurrido un error al crear el contrato",
    };
  }
}

export async function assignProyectoToContrato(data: {
  contrato_id: number;
  proyecto_id: number;
  horas_proyectadas: number;
  fecha_inicio_vinculo?: string;
  fecha_fin_vinculo?: string;
}) {
  const {
    contrato_id,
    proyecto_id,
    horas_proyectadas,
    fecha_inicio_vinculo,
    fecha_fin_vinculo,
  } = data;

  if (
    !Number.isInteger(contrato_id) ||
    !Number.isInteger(proyecto_id) ||
    !Number.isInteger(horas_proyectadas) ||
    contrato_id <= 0 ||
    proyecto_id <= 0 ||
    horas_proyectadas < 0
  ) {
    return {
      success: false,
      message: "Datos inválidos para asignar proyecto",
    };
  }

  try {
    const contrato = await prisma.contratos.findUnique({
      where: { id: contrato_id },
      include: {
        renglones: { select: { cantidad_horas: true } },
        incrementos: { select: { horas_extra: true } },
        proyectos: {
          select: {
            proyecto_id: true,
            horas_proyectadas: true,
          },
        },
      },
    });

    if (!contrato) {
      return { success: false, message: "Contrato no encontrado" };
    }

    const proyecto = await prisma.proyectos.findUnique({
      where: { id: proyecto_id },
      select: { id: true, fecha_inicio: true, fecha_fin: true },
    });

    if (!proyecto) {
      return { success: false, message: "Proyecto no encontrado" };
    }

    const horasRenglones = contrato.renglones.reduce(
      (sum, r) => sum + (r.cantidad_horas ?? 0),
      0,
    );
    const horasExtra = contrato.incrementos.reduce(
      (sum, inc) => sum + inc.horas_extra,
      0,
    );
    const horasTotales = horasRenglones > 0 ? horasRenglones + horasExtra : null;
    const horasAsignadas = contrato.proyectos.reduce(
      (sum, item) => sum + item.horas_proyectadas,
      0,
    );

    if (horasTotales != null) {
      const horasDisponibles = horasTotales - horasAsignadas;
      if (horas_proyectadas > horasDisponibles) {
        return {
          success: false,
          message: `Las horas proyectadas no pueden superar las horas disponibles (${horasDisponibles})`,
        };
      }
    }

    const fechaInicioTramo = fecha_inicio_vinculo
      ? new Date(fecha_inicio_vinculo)
      : proyecto.fecha_inicio;
    const fechaFinTramo = fecha_fin_vinculo
      ? new Date(fecha_fin_vinculo)
      : proyecto.fecha_fin;

    if (fechaFinTramo <= fechaInicioTramo) {
      return {
        success: false,
        message: "La fecha fin del tramo debe ser posterior a la fecha inicio",
      };
    }

    const solape = await validarSolapeTramoProyecto({
      proyecto_id,
      fecha_inicio: fechaInicioTramo,
      fecha_fin: fechaFinTramo,
    });
    if (!solape.ok) {
      return { success: false, message: solape.mensaje };
    }

    const cp = await prisma.contrato_proyectos.create({
      data: {
        contrato_id,
        proyecto_id,
        horas_proyectadas,
        fecha_inicio_vinculo: fechaInicioTramo,
        fecha_fin_vinculo: fechaFinTramo,
      },
    });

    await materializarMesesTramo({
      contrato_proyecto_id: cp.id,
      fecha_inicio: fechaInicioTramo,
      fecha_fin: fechaFinTramo,
    });

    revalidatePath("/contratos");
    revalidatePath("/proveedores");

    return {
      success: true,
      message: "El proyecto ha sido asignado al contrato",
    };
  } catch (error) {
    console.error("Error assigning proyecto to contrato:", error);
    return {
      success: false,
      message: "Ha ocurrido un error al asignar el proyecto",
    };
  }
}

export async function addProrroga(data: ProrrogaData) {
  const result = prorrogaSchema.safeParse(data);
  if (!result.success) {
    return { success: false, message: "Datos inválidos" };
  }
  const { contrato_id, renglon_id, numero_expediente, fecha_fin, observacion } = result.data;
  try {
    const contrato = await prisma.contratos.findUnique({
      where: { id: contrato_id },
      select: { fecha_fin: true },
    });
    if (!contrato) {
      return { success: false, message: "Contrato no encontrado" };
    }
    if (!contrato.fecha_fin) {
      return {
        success: false,
        message:
          "No se puede prorrogar un contrato sin fecha de fin (Ministerio).",
      };
    }

    const renglon = await prisma.contrato_renglones.findFirst({
      where: { id: renglon_id, contrato_id },
    });
    if (!renglon) {
      return { success: false, message: "Renglón no encontrado para este contrato" };
    }

    const proyectosExtendidos = await prisma.proyectos.findMany({
      where: {
        contrato_proyectos: { some: { contrato_id } },
        fecha_fin: { gt: contrato.fecha_fin },
      },
      select: { nombre: true },
    });
    if (proyectosExtendidos.length > 0) {
      const nombres = proyectosExtendidos.map((p) => p.nombre).join(", ");
      return {
        success: false,
        message: `No se puede prorrogar: hay proyectos con fecha extendida más allá del contrato (${nombres}). Ajustá esas fechas primero.`,
      };
    }

    await prisma.contrato_prorrogas.create({
      data: {
        contrato_id,
        renglon_id,
        numero_expediente: numero_expediente ?? null,
        fecha_fin: new Date(fecha_fin),
        observacion: observacion ?? null,
      },
    });
    revalidatePath("/contratos");
    return { success: true, message: "Prórroga agregada correctamente" };
  } catch (error) {
    console.error("Error adding prorroga:", error);
    return {
      success: false,
      message: "Ha ocurrido un error al agregar la prórroga",
    };
  }
}

export async function updateContratoFechas(
  contrato_id: number,
  data: {
    fecha_inicio: string;
    fecha_fin: string | null;
    fecha_fin_extendida: string | null;
  },
) {
  if (!Number.isInteger(contrato_id) || contrato_id <= 0) {
    return { success: false, message: "ID de contrato inválido" };
  }

  const { fecha_inicio, fecha_fin, fecha_fin_extendida } = data;

  if (!fecha_inicio) {
    return { success: false, message: "La fecha de inicio es requerida" };
  }

  const session = await auth();
  const editorEmail = session?.user?.email ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.contratos.update({
        where: { id: contrato_id },
        data: {
          fecha_inicio: new Date(fecha_inicio),
          fecha_fin: fecha_fin ? new Date(fecha_fin) : null,
          fechas_updated_by: editorEmail,
          fechas_updated_at: new Date(),
        },
      });

      if (fecha_fin_extendida) {
        const ultimaProrroga = await tx.contrato_prorrogas.findFirst({
          where: { contrato_id },
          orderBy: { created_at: "desc" },
        });
        if (ultimaProrroga) {
          await tx.contrato_prorrogas.update({
            where: { id: ultimaProrroga.id },
            data: { fecha_fin: new Date(fecha_fin_extendida) },
          });
        }
      }
    });

    revalidatePath("/contratos");
    return { success: true, message: "Fechas actualizadas correctamente" };
  } catch (error) {
    console.error("Error updating contrato fechas:", error);
    return {
      success: false,
      message: "Ha ocurrido un error al actualizar las fechas",
    };
  }
}

export async function addIncremento(data: IncrementoData) {
  const result = incrementoSchema.safeParse(data);
  if (!result.success) {
    return { success: false, message: "Datos inválidos" };
  }
  const { contrato_id, renglon_id, horas_extra, numero_expediente, observacion } = result.data;
  try {
    const contrato = await prisma.contratos.findUnique({
      where: { id: contrato_id },
      select: { proveedor_id: true },
    });
    if (!contrato) {
      return { success: false, message: "Contrato no encontrado" };
    }
    if (contrato.proveedor_id === PROVEEDOR_MINISTERIO_ID) {
      return {
        success: false,
        message:
          "No se puede incrementar horas a un contrato del Ministerio (no tiene tope).",
      };
    }

    const renglon = await prisma.contrato_renglones.findFirst({
      where: { id: renglon_id, contrato_id },
    });
    if (!renglon) {
      return { success: false, message: "Renglón no encontrado para este contrato" };
    }

    const cantidadTramos = await prisma.contrato_proyectos.count({
      where: { contrato_id },
    });
    if (cantidadTramos === 0) {
      return {
        success: false,
        message:
          "No se puede incrementar horas: el contrato no tiene proyectos asignados.",
      };
    }

    await prisma.contrato_incrementos.create({
      data: {
        contrato_id,
        renglon_id,
        horas_extra,
        numero_expediente: numero_expediente ?? null,
        observacion: observacion ?? null,
      },
    });
    revalidatePath("/contratos");
    return {
      success: true,
      message: "Incremento de horas agregado correctamente",
    };
  } catch (error) {
    console.error("Error adding incremento:", error);
    return {
      success: false,
      message: "Ha ocurrido un error al agregar el incremento",
    };
  }
}
