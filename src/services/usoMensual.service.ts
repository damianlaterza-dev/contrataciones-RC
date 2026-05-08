import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Crea filas en uso_mensual con horas_estimadas=0 para todos los (anio, mes)
 * cubiertos por el rango del tramo. Idempotente vía skipDuplicates: si un mes
 * ya tiene fila (ej. cargada por el wizard), no la pisa.
 *
 * Why: que los meses arranquen visibles en 0 desde la creación del tramo, sin
 * requerir intervención manual. También es lo que permite mostrar meses post-
 * fecha-fin-vigente del contrato como celdas en rojo (Fase 5) — operan sobre
 * filas materializadas reales.
 *
 * Pasale `tx` cuando estés dentro de una transacción Prisma.
 */
export async function materializarMesesTramo(params: {
  tx?: Prisma.TransactionClient;
  contrato_proyecto_id: number;
  fecha_inicio: Date;
  fecha_fin: Date;
}) {
  const { contrato_proyecto_id, fecha_inicio, fecha_fin } = params;
  const db = params.tx ?? prisma;

  const meses: {
    contrato_proyecto_id: number;
    anio: number;
    mes: number;
    horas_estimadas: number;
  }[] = [];
  const cursor = new Date(
    fecha_inicio.getFullYear(),
    fecha_inicio.getMonth(),
    1,
  );
  const end = new Date(fecha_fin.getFullYear(), fecha_fin.getMonth(), 1);
  while (cursor <= end) {
    meses.push({
      contrato_proyecto_id,
      anio: cursor.getFullYear(),
      mes: cursor.getMonth() + 1,
      horas_estimadas: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (meses.length === 0) return;

  await db.uso_mensual.createMany({
    data: meses,
    skipDuplicates: true,
  });
}
