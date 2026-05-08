import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAllContratosForSelect } from "@/services/contratos.service";
import { TransferirProyectoForm } from "@/components/forms/TransferirProyectoForm";
import { formatDate } from "@/lib/utils";

export default async function TransferirPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const proyectoId = Number(id);
  if (!Number.isFinite(proyectoId) || proyectoId <= 0) notFound();

  const proyecto = await prisma.proyectos.findUnique({
    where: { id: proyectoId },
    include: {
      contrato_proyectos: {
        include: {
          contratos: {
            select: {
              id: true,
              nombre: true,
              numero_expediente: true,
              proveedor_id: true,
              proveedores: { select: { id: true, label: true } },
            },
          },
          uso_mensual: {
            select: { anio: true, mes: true, horas_estimadas: true },
          },
        },
      },
    },
  });

  if (!proyecto) notFound();
  if (proyecto.contrato_proyectos.length === 0) {
    redirect("/proyectos");
  }

  const [contratos, proveedores] = await Promise.all([
    getAllContratosForSelect(),
    prisma.proveedores.findMany({
      where: { deleted_at: null },
      select: { id: true, label: true },
      orderBy: { label: "asc" },
    }),
  ]);

  const tramos = proyecto.contrato_proyectos.map((cp) => ({
    id: cp.id,
    contrato_id: cp.contratos.id,
    contrato_label: `${cp.contratos.numero_expediente} — ${cp.contratos.nombre}`,
    fecha_inicio_vinculo: cp.fecha_inicio_vinculo.toISOString(),
    fecha_fin_vinculo: cp.fecha_fin_vinculo.toISOString(),
    uso_mensual: cp.uso_mensual.map((u) => ({
      anio: u.anio,
      mes: u.mes,
      horas_estimadas: u.horas_estimadas,
    })),
  }));

  const contratosForm = contratos.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    numero_expediente: c.numero_expediente,
    proveedor_id: c.proveedor_id,
    fecha_inicio: c.fecha_inicio.toISOString(),
    fecha_fin: c.fecha_fin ? c.fecha_fin.toISOString() : null,
    horas_disponibles: c.horas_disponibles,
    prorrogas: c.prorrogas.map((p) => ({
      fecha_fin: p.fecha_fin.toISOString(),
    })),
  }));

  return (
    <main className="container mx-auto px-6 py-8 max-w-5xl">
      <div className="flex flex-col gap-6">
        <Link
          href="/proyectos"
          className="text-sm text-muted-foreground hover:underline self-start">
          ← Volver a proyectos
        </Link>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Transferir proyecto</h1>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{proyecto.nombre}</span>{" "}
            — del {formatDate(proyecto.fecha_inicio)} al{" "}
            {formatDate(proyecto.fecha_fin)}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-3">
            <div className="rounded-lg border p-4 flex flex-col gap-3">
              <p className="text-sm font-medium">Tramos actuales</p>
              <div className="flex flex-col gap-2">
                {proyecto.contrato_proyectos.map((cp) => (
                  <div
                    key={cp.id}
                    className="text-sm flex flex-col gap-0.5 border-l-2 border-muted-foreground/20 pl-3">
                    <span className="font-medium">
                      {cp.contratos.numero_expediente} — {cp.contratos.nombre}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(cp.fecha_inicio_vinculo)} →{" "}
                      {formatDate(cp.fecha_fin_vinculo)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Proveedor: {cp.contratos.proveedores.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-lg border p-6">
              <TransferirProyectoForm
                proyecto={{
                  id: proyecto.id,
                  nombre: proyecto.nombre,
                  fecha_inicio: proyecto.fecha_inicio.toISOString(),
                  fecha_fin: proyecto.fecha_fin.toISOString(),
                }}
                tramos={tramos}
                contratos={contratosForm}
                proveedores={proveedores}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
