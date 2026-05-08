"use client";

import { StatusBadge } from "@/components/badges/badgeStatus";
import { ContratacionStatusBadge } from "@/components/badges/badgeContratacionStatus";
import { ColumnDef } from "@tanstack/react-table";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

export type TProyectoTramo = {
  id: number;
  contrato_id: number;
  fecha_inicio_vinculo: string | Date;
  fecha_fin_vinculo: string | Date;
  contratos: {
    id: number;
    nombre: string;
    numero_expediente: string;
    proveedores: {
      id: number;
      label: string;
    };
  };
};

export type TProyecto = {
  id: number;
  nombre: string;
  fecha_inicio: string | Date;
  fecha_fin: string | Date;
  estado_id: number;
  estado_contratacion_id: number;
  area_id: number;
  areas: {
    nombre: string;
  };
  contrato_proyectos: TProyectoTramo[];
};

type ColumnCallbacks = {
  onTransferir: (proyecto: TProyecto) => void;
  onEditar: (proyecto: TProyecto) => void;
};

export function getProyectosColumns({
  onTransferir,
  onEditar,
}: ColumnCallbacks): ColumnDef<TProyecto>[] {
  return [
    {
      accessorKey: "nombre",
      header: "Nombre",
      cell: ({ row }) => {
        const transferido = row.original.contrato_proyectos.length > 1;
        return (
          <div className="flex items-center gap-2">
            {transferido && (
              <span
                className="inline-block h-2 w-2 rounded-full bg-orange-400 shrink-0"
                title="Proyecto transferido"
              />
            )}
            <span>{row.original.nombre}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "areas.nombre",
      header: "Área",
    },
    {
      id: "proveedor_actual",
      header: "Proveedor actual",
      cell: ({ row }) => {
        const tramos = row.original.contrato_proyectos;
        if (tramos.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const hoy = new Date();
        const ordenados = [...tramos].sort(
          (a, b) =>
            new Date(a.fecha_inicio_vinculo).getTime() -
            new Date(b.fecha_inicio_vinculo).getTime(),
        );
        // Tramo vigente hoy; si no hay (proyecto terminado o aún no iniciado),
        // tomamos el más reciente cronológicamente.
        const actual =
          ordenados.find(
            (t) =>
              new Date(t.fecha_inicio_vinculo) <= hoy &&
              new Date(t.fecha_fin_vinculo) >= hoy,
          ) ?? ordenados[ordenados.length - 1];
        return <span>{actual.contratos.proveedores.label}</span>;
      },
    },
    {
      id: "proveedores_anteriores",
      header: "Proveedores anteriores",
      cell: ({ row }) => {
        const tramos = row.original.contrato_proyectos;
        if (tramos.length <= 1) {
          return <span className="text-muted-foreground">—</span>;
        }
        const hoy = new Date();
        const ordenados = [...tramos].sort(
          (a, b) =>
            new Date(a.fecha_inicio_vinculo).getTime() -
            new Date(b.fecha_inicio_vinculo).getTime(),
        );
        const actual =
          ordenados.find(
            (t) =>
              new Date(t.fecha_inicio_vinculo) <= hoy &&
              new Date(t.fecha_fin_vinculo) >= hoy,
          ) ?? ordenados[ordenados.length - 1];
        const anteriores = ordenados
          .filter((t) => t.id !== actual.id)
          .map((t) => t.contratos.proveedores.label);
        const unicos = [...new Set(anteriores)];
        if (unicos.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return <span>{unicos.join(", ")}</span>;
      },
    },
    {
      accessorKey: "fecha_inicio",
      header: "Fecha inicio",
      cell: ({ row }) => formatDate(row.original.fecha_inicio),
    },
    {
      accessorKey: "fecha_fin",
      header: "Fecha fin",
      cell: ({ row }) => formatDate(row.original.fecha_fin),
    },
    {
      accessorKey: "estado_contratacion_id",
      header: "Estado contratación",
      cell: ({ row }) => (
        <ContratacionStatusBadge
          status={row.original.estado_contratacion_id}
        />
      ),
    },
    {
      accessorKey: "estado_id",
      header: "Estado proyecto",
      cell: ({ row }) => <StatusBadge status={row.original.estado_id} />,
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const tieneTramos = row.original.contrato_proyectos.length > 0;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Acciones</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditar(row.original)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onTransferir(row.original)}
                disabled={!tieneTramos}>
                Transferir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
