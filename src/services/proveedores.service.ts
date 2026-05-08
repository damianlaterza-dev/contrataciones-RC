import { prisma } from "@/lib/prisma";
import { ProveedoresFilters } from "@/@types/filters";
import { contratoEstaVigente } from "@/lib/fechas";
import type { proveedores } from "@prisma/client";

export type ProveedorConEstado = proveedores & { is_active: boolean };

export async function getProveedores() {
  return await prisma.proveedores.findMany({
    select: {
      id: true,
      label: true,
      value: true,
    },
    where: { deleted_at: null },
    orderBy: {
      label: "asc",
    },
  });
}

export async function getProveedoresPaginated(
  filters: ProveedoresFilters,
): Promise<{ data: ProveedorConEstado[]; total: number }> {
  const { page, limit, search } = filters;
  const skip = (page - 1) * limit;

  const where = {
    deleted_at: null,
    ...(search ? { label: { contains: search.toLowerCase().trim() } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.proveedores.findMany({
      skip,
      take: limit,
      where,
      orderBy: { label: "asc" },
      include: {
        contratos: {
          select: {
            fecha_fin: true,
            prorrogas: { select: { fecha_fin: true } },
            proyectos: { select: { fecha_fin_vinculo: true } },
          },
        },
      },
    }),
    prisma.proveedores.count({ where }),
  ]);

  const hoy = new Date();
  // Activo = al menos un contrato vigente que además tenga un tramo
  // (contrato_proyectos) vigente. Si todos los tramos terminaron, aunque el
  // contrato siga abierto, el proveedor pasa a inactivo.
  const data: ProveedorConEstado[] = rows.map(({ contratos, ...p }) => ({
    ...p,
    is_active: contratos.some(
      (c) =>
        contratoEstaVigente(c, hoy) &&
        c.proyectos.some((cp) => cp.fecha_fin_vinculo >= hoy),
    ),
  }));

  return { data, total };
}
