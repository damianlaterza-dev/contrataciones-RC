import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

type Payload = {
  contrato_proyecto_id: number;
  anio: number;
  mes: number;
  horas_reales: number | null;
  horas_estimadas?: number | null;
};

const MAX_HORAS = 999999;

function isValidNullableHours(value: unknown) {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= MAX_HORAS)
  );
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Partial<Payload>;

  if (
    !Number.isInteger(body.contrato_proyecto_id) ||
    !Number.isInteger(body.anio) ||
    !Number.isInteger(body.mes) ||
    !isValidNullableHours(body.horas_reales)
  ) {
    return NextResponse.json(
      { message: "Datos inválidos para uso mensual" },
      { status: 400 },
    );
  }

  // horas_estimadas es opcional; si viene, debe ser null o entero válido.
  const estimadasProvided = Object.prototype.hasOwnProperty.call(
    body,
    "horas_estimadas",
  );
  if (estimadasProvided && !isValidNullableHours(body.horas_estimadas)) {
    return NextResponse.json(
      { message: "Datos inválidos para uso mensual" },
      { status: 400 },
    );
  }

  const contratoProyectoId = body.contrato_proyecto_id as number;
  const anio = body.anio as number;
  const mes = body.mes as number;
  const horasReales = body.horas_reales;
  const horasEstimadas = body.horas_estimadas;

  if (contratoProyectoId <= 0 || anio <= 0 || mes < 1 || mes > 12) {
    return NextResponse.json(
      { message: "Datos inválidos para uso mensual" },
      { status: 400 },
    );
  }

  try {
    const contratoProyecto = await prisma.contrato_proyectos.findUnique({
      where: { id: contratoProyectoId },
      select: {
        id: true,
        proyecto_id: true,
        fecha_inicio_vinculo: true,
        proyectos: { select: { fecha_inicio: true } },
      },
    });

    if (!contratoProyecto) {
      return NextResponse.json(
        { message: "No existe el contrato/proyecto indicado" },
        { status: 404 },
      );
    }

    // Solo el tramo destino de una transferencia permite editar estimadas.
    // El tramo origen (el primero del proyecto) tiene
    // fecha_inicio_vinculo == proyecto.fecha_inicio y es histórico/auditoría.
    if (estimadasProvided) {
      const esTramoDestino =
        contratoProyecto.fecha_inicio_vinculo >
        contratoProyecto.proyectos.fecha_inicio;
      if (!esTramoDestino) {
        return NextResponse.json(
          {
            message:
              "Las horas estimadas solo se pueden editar en el tramo destino de una transferencia",
          },
          { status: 400 },
        );
      }
    }

    const where = {
      contrato_proyecto_id_anio_mes: {
        contrato_proyecto_id: contratoProyectoId,
        anio,
        mes,
      },
    };

    await prisma.$transaction(async (tx) => {
      // Caso legado: solo se actualizan reales y vienen null → borrar fila.
      // Si vinieron estimadas, nunca borramos (la fila representa el mes y
      // su estimada).
      if (!estimadasProvided && horasReales == null) {
        const existing = await tx.uso_mensual.findUnique({ where });
        if (existing) {
          await tx.uso_mensual.delete({ where });
        }
        return;
      }

      const updateData: {
        horas_reales?: number | null;
        horas_estimadas?: number | null;
      } = {
        horas_reales: horasReales,
      };
      if (estimadasProvided) {
        updateData.horas_estimadas = horasEstimadas;
      }

      await tx.uso_mensual.upsert({
        where,
        update: updateData,
        create: {
          contrato_proyecto_id: contratoProyectoId,
          anio,
          mes,
          horas_reales: horasReales,
          horas_estimadas: estimadasProvided ? horasEstimadas : undefined,
        },
      });

      // Si se editaron estimadas, recalcular horas_proyectadas del tramo
      // como la suma de estimadas del uso_mensual. Mantiene consistencia
      // entre la celda mensual y el total del tramo.
      if (estimadasProvided) {
        const sum = await tx.uso_mensual.aggregate({
          where: { contrato_proyecto_id: contratoProyectoId },
          _sum: { horas_estimadas: true },
        });
        await tx.contrato_proyectos.update({
          where: { id: contratoProyectoId },
          data: { horas_proyectadas: sum._sum.horas_estimadas ?? 0 },
        });
      }
    });

    return NextResponse.json({
      message: "El uso mensual ha sido actualizado",
    });
  } catch (error) {
    console.error("Error updating uso_mensual:", error);
    return NextResponse.json(
      { message: "Ha ocurrido un error al actualizar el uso mensual" },
      { status: 500 },
    );
  }
}
