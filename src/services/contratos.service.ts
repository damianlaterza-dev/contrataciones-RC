import { ContratosFilters } from "@/@types/filters";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Valida que un nuevo tramo de contrato_proyectos para un proyecto no se solape
 * con tramos existentes (sin importar el contrato). Dos tramos solapan si:
 *   t1.inicio <= t2.fin && t2.inicio <= t1.fin
 *
 * Why: con la transferencia de proyecto entre proveedores (Fase 4) un mismo
 * proyecto puede tener varios tramos consecutivos, pero nunca pueden vivir en
 * paralelo en distintos contratos.
 *
 * Pasale `tx` cuando estés dentro de una transacción Prisma; sino usa el
 * `prisma` global.
 */
export async function validarSolapeTramoProyecto(params: {
  tx?: Prisma.TransactionClient;
  proyecto_id: number;
  fecha_inicio: Date;
  fecha_fin: Date;
  excludeContratoProyectoId?: number;
}): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const { proyecto_id, fecha_inicio, fecha_fin, excludeContratoProyectoId } =
    params;
  const db = params.tx ?? prisma;
  const tramos = await db.contrato_proyectos.findMany({
    where: {
      proyecto_id,
      ...(excludeContratoProyectoId
        ? { NOT: { id: excludeContratoProyectoId } }
        : {}),
    },
    select: {
      id: true,
      fecha_inicio_vinculo: true,
      fecha_fin_vinculo: true,
      contratos: { select: { numero_expediente: true } },
    },
  });
  const conflictos = tramos.filter(
    (t) =>
      t.fecha_inicio_vinculo <= fecha_fin &&
      fecha_inicio <= t.fecha_fin_vinculo,
  );
  if (conflictos.length > 0) {
    const refs = conflictos
      .map((c) => c.contratos.numero_expediente)
      .join(", ");
    return {
      ok: false,
      mensaje: `El tramo se solapa con tramos ya existentes del mismo proyecto en otros contratos (${refs}). Cortá esos tramos antes de crear uno nuevo.`,
    };
  }
  return { ok: true };
}

export async function getAllContratosForSelect() {
  const data = await prisma.contratos.findMany({
    select: {
      id: true,
      nombre: true,
      numero_expediente: true,
      proveedor_id: true,
      cantidad_horas: true,
      fecha_inicio: true,
      fecha_fin: true,
      incrementos: {
        select: { horas_extra: true },
        orderBy: { created_at: "asc" },
      },
      proyectos: {
        select: { horas_proyectadas: true },
      },
      prorrogas: {
        select: { fecha_fin: true },
      },
    },
    orderBy: { numero_expediente: "asc" },
  });

  return data.map((c) => {
    const horasExtra = c.incrementos.reduce(
      (sum, inc) => sum + inc.horas_extra,
      0,
    );
    const horasTotales =
      c.cantidad_horas != null ? c.cantidad_horas + horasExtra : null;
    const horasAsignadas = c.proyectos.reduce(
      (sum, p) => sum + p.horas_proyectadas,
      0,
    );
    return {
      id: c.id,
      nombre: c.nombre,
      numero_expediente: c.numero_expediente,
      proveedor_id: c.proveedor_id,
      fecha_inicio: c.fecha_inicio,
      fecha_fin: c.fecha_fin,
      horas_disponibles:
        horasTotales != null ? Math.max(horasTotales - horasAsignadas, 0) : null,
      prorrogas: c.prorrogas.map((p) => ({ fecha_fin: p.fecha_fin })),
    };
  });
}

export async function getContratosPrincipalesForSelect() {
  return await prisma.contratos.findMany({
    where: {
      OR: [{ es_accesoridad: false }, { es_accesoridad: null }],
    },
    select: {
      id: true,
      nombre: true,
      numero_expediente: true,
    },
    orderBy: { numero_expediente: "asc" },
  });
}

export async function getContratos(filters: ContratosFilters) {
  const { page, limit } = filters;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.contratos.findMany({
      skip,
      take: limit,
      include: {
        prorrogas: { orderBy: { created_at: "asc" } },
        incrementos: { orderBy: { created_at: "asc" } },
        accesorios: { select: { id: true } },
        proyectos: {
          select: {
            proyecto_id: true,
            horas_proyectadas: true,
          },
        },
      },
    }),
    prisma.contratos.count(),
  ]);

  const serialized = data.map((contrato) => {
    const ultimaProrroga = contrato.prorrogas.at(-1);
    const horasExtraTotal = contrato.incrementos.reduce(
      (sum, inc) => sum + inc.horas_extra,
      0,
    );
    const horasAsignadas = contrato.proyectos.reduce(
      (sum, proyecto) => sum + proyecto.horas_proyectadas,
      0,
    );
    const horasTotales =
      contrato.cantidad_horas != null
        ? contrato.cantidad_horas + horasExtraTotal
        : null;

    return {
      id: contrato.id,
      nombre: contrato.nombre,
      numero_expediente: contrato.numero_expediente,
      proveedor_id: contrato.proveedor_id,
      fecha_inicio: contrato.fecha_inicio,
      fecha_fin: contrato.fecha_fin,
      cantidad_horas: contrato.cantidad_horas,
      valor_hora: contrato.valor_hora?.toNumber() ?? null,
      es_accesoridad: contrato.es_accesoridad,
      contrato_principal_id: contrato.contrato_principal_id,
      observaciones: contrato.observaciones,
      fecha_fin_vigente: ultimaProrroga?.fecha_fin ?? contrato.fecha_fin,
      horas_totales: horasTotales,
      horas_asignadas: horasAsignadas,
      horas_disponibles:
        horasTotales != null ? Math.max(horasTotales - horasAsignadas, 0) : null,
      proyecto_ids: contrato.proyectos.map((proyecto) => proyecto.proyecto_id),
      valor_hora_vigente: contrato.valor_hora?.toNumber() ?? null,
      prorrogas: contrato.prorrogas.map((prorroga) => ({
        id: prorroga.id,
        numero_expediente: prorroga.numero_expediente ?? null,
        fecha_fin: prorroga.fecha_fin,
        observacion: prorroga.observacion,
        created_at: prorroga.created_at,
      })),
      incrementos: contrato.incrementos.map((inc) => ({
        id: inc.id,
        horas_extra: inc.horas_extra,
        numero_expediente: inc.numero_expediente ?? null,
        observacion: inc.observacion,
        created_at: inc.created_at,
      })),
      accesorios_count: contrato.accesorios.length,
    };
  });

  return { data: serialized, total };
}
