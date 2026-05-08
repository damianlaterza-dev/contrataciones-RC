"use client";

import { useEffect, useState, useTransition } from "react";
import { createProveedor, updateProveedor } from "@/actions/proveedores";
import { toast } from "sonner";
import { Toast } from "@/components/toast/Toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { proveedorSchema, type Proveedor } from "@/schemas/proveedorSchema";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Building2, Pencil, SearchIcon } from "lucide-react";
import ErrorIcon from "@/assets/img/main/inputs/error.svg";
import Image from "next/image";
import Link from "next/link";
import { proveedoresKeys } from "@/lib/queryKeys";
import { ProveedoresFilters } from "@/@types/filters";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useUrlParams } from "@/hooks/useUrlParams";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { proveedores } from "@prisma/client";

type ProveedorConEstado = proveedores & { is_active: boolean };

const COLORS = [
  "bg-azul-100 text-azul-700",
  "bg-cian-100 text-cian-700",
  "bg-verde-100 text-verde-700",
  "bg-pink-100 text-pink-700",
  "bg-violeta-100 text-violeta-700",
  "bg-violet-100 text-violet-700",
  "bg-amarillo-100 text-amarillo-700",
  "bg-rojo-100 text-rojo-700",
  "bg-naranja-100 text-naranja-700",
  "bg-rose-100 text-rose-700",
  "bg-cielo-100 text-cielo-700",
];

function hashStr(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++)
    h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
}

function getColor(value: string): string {
  return COLORS[hashStr(value) % COLORS.length];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function labelToValue(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, "_");
}

export default function ProveedoresPage({
  filters,
}: {
  filters: ProveedoresFilters;
}) {
  const { setFilter } = useUrlParams();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState<string>(filters.search || "");

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [editingProveedor, setEditingProveedor] = useState<
    (Proveedor & { id?: number }) | null
  >(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<Proveedor>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: { label: "", value: "" },
  });

  const [isPending, startTransition] = useTransition();
  const [isCooldown, setIsCooldown] = useState(false);

  const showToast = (success: boolean, message: string) => {
    toast.custom((t) => (
      <Toast id={t} variant={success ? "success" : "error"}>
        <p className="text-sm text-gray-600">{message}</p>
      </Toast>
    ));
  };

  const triggerCooldown = () => {
    setIsCooldown(true);
    setTimeout(() => setIsCooldown(false), 600);
  };

  const onSubmit = (data: Proveedor) => {
    startTransition(async () => {
      if (editingProveedor?.id) {
        const res = await updateProveedor(editingProveedor.id, data);
        if (res.success) {
          await queryClient.refetchQueries({
            queryKey: proveedoresKeys.all,
          });
          setIsOpen(false);
          setEditingProveedor(null);
          reset();
        }
        showToast(res.success, res.message);
      } else {
        const res = await createProveedor(data);
        if (res.success) {
          await queryClient.refetchQueries({
            queryKey: proveedoresKeys.all,
          });
          setIsOpen(false);
          reset();
        }
        showToast(res.success, res.message);
      }
      triggerCooldown();
    });
  };

  const handleEdit = (proveedor: proveedores) => {
    setEditingProveedor({
      label: proveedor.label,
      value: proveedor.value,
      id: proveedor.id,
    });
    setValue("label", proveedor.label);
    setValue("value", proveedor.value);
    setIsOpen(true);
  };

  // Debounce de búsqueda
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchText !== (filters.search || "")) {
        setFilter("search", searchText || null);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [searchText, filters.search, setFilter]);

  const { data: proveedoresData, isLoading } = useQuery({
    queryKey: proveedoresKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);

      params.set("page", String(filters.page));
      params.set("limit", String(filters.limit));

      const res = await fetch(`/api/proveedores?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Error al buscar proveedores");
      return res.json();
    },
    placeholderData: keepPreviousData,
  });

  if (isLoading || !proveedoresData)
    return (
      <div className="grid place-items-center h-dvh">
        <Spinner color="text-cian-500" />
      </div>
    );

  // Activo/inactivo se deriva de fechas de contratos en el server (is_active).
  // Why: la baja manual fue removida en Fase 1 (mayo/2026) — un proveedor sin
  // contratos vigentes hoy queda en "Inactivos" automáticamente.
  const allProviders: ProveedorConEstado[] = proveedoresData.data;
  const activeProviders = allProviders.filter((p) => p.is_active);
  const inactiveProviders = allProviders.filter((p) => !p.is_active);

  return (
    <>
      <main className="container mx-auto px-6 py-8">
        <h1 className="text-4xl font-bold">Proveedores</h1>
        <p className="2xl:text-lg">
          Desde acá vas a poder gestionar los proveedores del sistema
        </p>
        <section className="grid grid-cols-12 gap-4 mt-4">
          <div className="col-span-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <Field className="max-w-xs">
                <FieldLabel htmlFor="search-proveedor" className="sr-only">
                  Buscar
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="search-proveedor"
                    placeholder="Buscar por nombre"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <SearchIcon className="text-azul-500" />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
              <Button variant="primary" onClick={() => setIsOpen(true)}>
                Agregar proveedor
              </Button>
            </div>
          </div>
          <div className="col-span-12">
            <h2 className="text-lg font-medium my-4">
              Activos{" "}
              <span className="text-sm text-muted-foreground font-normal">
                ({activeProviders.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {activeProviders.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  onEdit={handleEdit}
                />
              ))}
            </div>

            {inactiveProviders.length > 0 && (
              <>
                <h2 className="mt-8 mb-4 text-lg font-medium text-muted-foreground">
                  Inactivos{" "}
                  <span className="text-sm font-normal">
                    ({inactiveProviders.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {inactiveProviders.map((provider) => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onEdit={handleEdit}
                      dimmed
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      {/* Dialog editar / crear */}
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            reset();
            setEditingProveedor(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>
                {editingProveedor ? "Editar proveedor" : "Agregar proveedor"}
              </DialogTitle>
              <DialogDescription>
                {editingProveedor
                  ? "Modificá el nombre del proveedor."
                  : "Completá los datos del nuevo proveedor."}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Field>
                <FieldLabel htmlFor="label">Nombre</FieldLabel>
                <Input
                  aria-invalid={!!errors.label}
                  id="label"
                  {...register("label", {
                    onChange: (e) => {
                      if (!editingProveedor) {
                        setValue("value", labelToValue(e.target.value), {
                          shouldValidate: false,
                        });
                      }
                    },
                  })}
                  placeholder="Ingresá el nombre del proveedor"
                />
                {errors.label && (
                  <FieldError>
                    <p className="flex items-center gap-2">
                      <span>
                        <Image src={ErrorIcon} alt="Error" className="size-4" />
                      </span>
                      {errors.label.message}
                    </p>
                  </FieldError>
                )}
              </Field>
              {/* value se auto-genera, campo oculto para react-hook-form */}
              <input type="hidden" {...register("value")} />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                disabled={isPending || isCooldown}
              >
                {isPending ? (
                  <>
                    <Spinner className="text-white" data-icon="inline-start" />{" "}
                    <p>Guardando</p>
                  </>
                ) : (
                  "Guardar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}

function ProviderCard({
  provider,
  onEdit,
  dimmed = false,
}: {
  provider: proveedores;
  onEdit?: (p: proveedores) => void;
  dimmed?: boolean;
}) {
  return (
    <div className={`group relative ${dimmed ? "opacity-60" : ""}`}>
      <Link
        href={`/proveedores/resumen/${provider.id}`}
        className="bg-card outline outline-border rounded-xl p-5 flex items-center gap-4 hover:outline-azul-600 transition-all duration-200"
      >
        {provider.id === 1 ? (
          <Image
            src="/favicon.svg"
            alt="Ministerio"
            width={48}
            height={48}
            className="size-12 shrink-0"
          />
        ) : (
          <div
            className={`size-12 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ${getColor(provider.value)}`}
          >
            {getInitials(provider.label)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate leading-snug">
            {provider.label}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Building2 className="size-3" />
            {provider.id === 1 ? "Desarrollo interno" : "Proveedor"}
          </p>
        </div>
      </Link>

      {onEdit && provider.id !== 1 && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(provider)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={`Editar ${provider.label}`}
          >
            <Pencil className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
