import { prisma } from "@/lib/prisma";
import { validarSolapeTramoProyecto } from "@/services/contratos.service";
import { materializarMesesTramo } from "@/services/usoMensual.service";

export type ProyectosFilters = {
  page: number;
  limit: number;
  nombre?: string;
  estado_id?: string;
  area_id?: string;
};

/**
 * Transfiere un proyecto desde un contrato origen a un contrato destino a partir
 * de una fecha de corte. Cierra el tramo activo del origen en `fecha_corte` y
 * crea un nuevo tramo bajo el contrato destino desde `fecha_corte + 1 día`
 * hasta `proyecto.fecha_fin`.
 *
 * Why: cuando se le retira un proyecto a un proveedor a mitad de período y pasa
 * a otro proveedor (o al Ministerio, id=1), necesitamos saber qué meses fueron
 * de cada uno para reportar pagos correctamente. La auditoría es la propia
 * secuencia de tramos (no hay tabla de eventos separada).
 */
export async function transferirProyecto(input: {
  proyecto_id: number;
  contrato_origen_id: number;
  contrato_destino_id: number;
  fecha_corte: Date;
  horas_destino: number;
}) {
  const {
    proyecto_id,
    contrato_origen_id,
    contrato_destino_id,
    fecha_corte,
    horas_destino,
  } = input;

  if (contrato_origen_id === contrato_destino_id) {
    throw new Error("El contrato destino debe ser distinto al origen");
  }

  return await prisma.$transaction(async (tx) => {
    // Tramo activo en el contrato origen para esta fecha
    const tramoOrigen = await tx.contrato_proyectos.findFirst({
      where: {
        contrato_id: contrato_origen_id,
        proyecto_id,
        fecha_inicio_vinculo: { lte: fecha_corte },
        fecha_fin_vinculo: { gte: fecha_corte },
      },
    });
    if (!tramoOrigen) {
      throw new Error(
        "No se encontró un tramo activo del proyecto en el contrato origen para la fecha de corte indicada",
      );
    }

    const proyecto = await tx.proyectos.findUnique({
      where: { id: proyecto_id },
      select: { fecha_fin: true },
    });
    if (!proyecto) {
      throw new Error("Proyecto no encontrado");
    }

    // El nuevo tramo arranca al día siguiente del corte
    const fechaInicioNuevo = new Date(fecha_corte);
    fechaInicioNuevo.setDate(fechaInicioNuevo.getDate() + 1);
    if (fechaInicioNuevo > proyecto.fecha_fin) {
      throw new Error(
        "La fecha de corte no deja días restantes para un nuevo tramo (es igual o posterior al fin del proyecto)",
      );
    }

    // Horas disponibles del contrato destino
    const contratoDestino = await tx.contratos.findUnique({
      where: { id: contrato_destino_id },
      include: {
        incrementos: { select: { horas_extra: true } },
        proyectos: { select: { horas_proyectadas: true } },
      },
    });
    if (!contratoDestino) {
      throw new Error("Contrato destino no encontrado");
    }
    const horasExtra = contratoDestino.incrementos.reduce(
      (sum, inc) => sum + inc.horas_extra,
      0,
    );
    const horasTotales =
      contratoDestino.cantidad_horas != null
        ? contratoDestino.cantidad_horas + horasExtra
        : null;
    const horasAsignadas = contratoDestino.proyectos.reduce(
      (sum, p) => sum + p.horas_proyectadas,
      0,
    );
    if (horasTotales != null) {
      const disponibles = Math.max(horasTotales - horasAsignadas, 0);
      if (horas_destino > disponibles) {
        throw new Error(
          `Las horas del nuevo tramo (${horas_destino}) superan las disponibles del contrato destino (${disponibles})`,
        );
      }
    }

    // Cerrar tramo origen
    await tx.contrato_proyectos.update({
      where: { id: tramoOrigen.id },
      data: { fecha_fin_vinculo: fecha_corte },
    });

    // Validar que el nuevo tramo no se solape con otros tramos preexistentes
    // (excluyendo el tramo origen ya recortado).
    const solape = await validarSolapeTramoProyecto({
      tx,
      proyecto_id,
      fecha_inicio: fechaInicioNuevo,
      fecha_fin: proyecto.fecha_fin,
      excludeContratoProyectoId: tramoOrigen.id,
    });
    if (!solape.ok) {
      throw new Error(solape.mensaje);
    }

    const nuevoTramo = await tx.contrato_proyectos.create({
      data: {
        contrato_id: contrato_destino_id,
        proyecto_id,
        horas_proyectadas: horas_destino,
        fecha_inicio_vinculo: fechaInicioNuevo,
        fecha_fin_vinculo: proyecto.fecha_fin,
      },
    });

    await materializarMesesTramo({
      tx,
      contrato_proyecto_id: nuevoTramo.id,
      fecha_inicio: fechaInicioNuevo,
      fecha_fin: proyecto.fecha_fin,
    });

    // Traspaso de meses estimados: las filas uso_mensual del tramo origen con
    // (anio, mes) estrictamente posteriores al mes de corte caen fuera del
    // nuevo rango del tramo origen → se aplican al nuevo tramo y se borran
    // del origen. El mes del corte queda en el origen sin tocar.
    const cutYear = fecha_corte.getFullYear();
    const cutMonth = fecha_corte.getMonth() + 1;

    const huerfanas = await tx.uso_mensual.findMany({
      where: {
        contrato_proyecto_id: tramoOrigen.id,
        OR: [
          { anio: { gt: cutYear } },
          { anio: cutYear, mes: { gt: cutMonth } },
        ],
      },
      select: {
        anio: true,
        mes: true,
        horas_estimadas: true,
        horas_reales: true,
      },
    });

    for (const fila of huerfanas) {
      await tx.uso_mensual.update({
        where: {
          contrato_proyecto_id_anio_mes: {
            contrato_proyecto_id: nuevoTramo.id,
            anio: fila.anio,
            mes: fila.mes,
          },
        },
        data: {
          horas_estimadas: fila.horas_estimadas,
          horas_reales: fila.horas_reales,
        },
      });
    }

    await tx.uso_mensual.deleteMany({
      where: {
        contrato_proyecto_id: tramoOrigen.id,
        OR: [
          { anio: { gt: cutYear } },
          { anio: cutYear, mes: { gt: cutMonth } },
        ],
      },
    });
  });
}

export async function getProyectosWithFilters(filters: ProyectosFilters) {
  const { page, limit, nombre, estado_id, area_id } = filters;

  const skip = (page - 1) * limit;

  const where = {
    ...(nombre && { nombre: { contains: nombre } }),
    ...(estado_id && { estado_id: parseInt(estado_id) }),
    ...(area_id && { area_id: parseInt(area_id) }),
  };

  const rawData = await prisma.proyectos.findMany({
    skip,
    take: limit,
    where,
    orderBy: { id: "desc" },
    include: {
      areas: true,
      contrato_proyectos: {
        include: {
          contratos: {
            select: {
              id: true,
              nombre: true,
              numero_expediente: true,
              fecha_inicio: true,
              fecha_fin: true,
              cantidad_horas: true,
              valor_hora: true,
              es_accesoridad: true,
              contrato_principal_id: true,
              observaciones: true,
              proveedores: { select: { id: true, label: true } },
              prorrogas: { select: { fecha_fin: true } },
            },
          },
        },
      },
    },
  });

  const total = await prisma.proyectos.count({ where });

  const data = rawData.map((proyecto) => ({
    ...proyecto,
    contrato_proyectos: proyecto.contrato_proyectos.map((cp) => ({
      ...cp,
      contratos: {
        ...cp.contratos,
        valor_hora: cp.contratos.valor_hora?.toNumber() ?? null,
      },
    })),
  }));

  return { data, total };
}
