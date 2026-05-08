"use client";

import { useState, useTransition } from "react";
import {
  TProyecto,
  getProyectosColumns,
} from "@/components/datatable/proyectos/columns";
import { DataTable } from "@/components/datatable/DataTable";
import Pagination from "@/components/datatable/pagination/Pagination";
import { Spinner } from "@/components/spinner/Spinner";
import Title from "@/components/title/Title";
import { Button } from "@/components/ui/button";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { ProyectosFilters, UIProyectosFilters } from "@/@types/filters";
import { CalendarIcon, Filter } from "lucide-react";
import { format } from "date-fns";
import {
  ESTADO_CONFIG,
  ESTADO_CONTRATACION_CONFIG,
} from "@/lib/estadosConfig";
import { proyectosKeys, resumenKeys } from "@/lib/queryKeys";
import { cn, formatDate, toIsoDateString } from "@/lib/utils";
import { parseDateOnly } from "@/lib/fechas";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SelectCombobox } from "@/components/ui/select-combobox";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  proyectoSchema,
  editProyectoSchema,
  type ProyectoData,
  type EditProyectoData,
} from "@/schemas/proyectoSchema";
import { createProyecto, updateProyecto } from "@/actions/proyectos";
import { toast } from "sonner";
import { Toast } from "@/components/toast/Toast";
import { Badge } from "@/components/ui/badge";

type Area = {
  id: number;
  nombre: string;
};

type ContratoSelectOption = {
  id: number;
  nombre: string;
  numero_expediente: string;
  proveedor_id: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  horas_disponibles: number | null;
  prorrogas: { fecha_fin: string }[];
};

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function getMonthsBetween(fechaInicio: string, fechaFin: string) {
  const months: { anio: number; mes: number }[] = [];
  const current = new Date(
    new Date(fechaInicio).getFullYear(),
    new Date(fechaInicio).getMonth(),
    1,
  );
  const end = new Date(
    new Date(fechaFin).getFullYear(),
    new Date(fechaFin).getMonth(),
    1,
  );
  while (current <= end) {
    months.push({ anio: current.getFullYear(), mes: current.getMonth() + 1 });
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

export default function ProyectosPage({
  filters,
}: {
  filters: ProyectosFilters;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [uiFilters, setUiFilters] = useState<UIProyectosFilters>({});
  const [isPending, startTransition] = useTransition();
  const [openFechaInicio, setOpenFechaInicio] = useState(false);
  const [openFechaFin, setOpenFechaFin] = useState(false);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProyecto, setEditingProyecto] = useState<TProyecto | null>(null);
  const [openEditFechaInicio, setOpenEditFechaInicio] = useState(false);
  const [openEditFechaFin, setOpenEditFechaFin] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    trigger,
    formState: { errors },
  } = useForm<ProyectoData>({
    resolver: zodResolver(proyectoSchema),
    defaultValues: {
      nombre: "",
      fecha_inicio: "",
      fecha_fin: "",
      area_id: undefined,
      contrato_id: undefined,
      horas_proyectadas: undefined,
      uso_mensual: [],
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    setValue: setValueEdit,
    watch: watchEdit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<EditProyectoData>({
    resolver: zodResolver(editProyectoSchema),
  });

  const editFechaInicioWatch = watchEdit("fecha_inicio");
  const editFechaFinWatch = watchEdit("fecha_fin");

  const contratoIdWatch = watch("contrato_id");
  const horasProyectadasWatch = watch("horas_proyectadas");
  const fechaInicioWatch = watch("fecha_inicio");
  const fechaFinWatch = watch("fecha_fin");

  const { fields, replace } = useFieldArray({ control, name: "uso_mensual" });

  const { data, isLoading } = useQuery({
    queryKey: proyectosKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(filters.page));
      params.set("limit", String(filters.limit));
      if (filters.nombre) params.set("nombre", filters.nombre);
      if (filters.estado_id) params.set("estado_id", filters.estado_id);
      if (filters.area_id) params.set("area_id", filters.area_id);

      const res = await fetch(`/api/proyectos?${params.toString()}`);
      return res.json();
    },
  });

  const [areasQuery, contratosQuery] = useQueries({
    queries: [
      {
        queryKey: ["areas"],
        queryFn: async () => {
          const res = await fetch("/api/areas");
          return res.json();
        },
        staleTime: 10 * 60 * 1000,
      },
      {
        queryKey: ["contratos-select"],
        queryFn: async (): Promise<ContratoSelectOption[]> => {
          const res = await fetch("/api/contratos?for_select=true");
          return res.json();
        },
        enabled: isNewOpen,
      },
    ],
  });

  const { data: areas } = areasQuery;
  const estados = Object.entries(ESTADO_CONFIG).map(([id, config]) => ({
    id: Number(id),
    label: config.label,
  }));
  const { data: contratos = [], isLoading: isLoadingContratos } =
    contratosQuery;

  const contratoSeleccionado = contratos.find((c) => c.id === contratoIdWatch);
  const horasDisponibles = contratoSeleccionado?.horas_disponibles ?? null;
  const excede =
    horasDisponibles != null &&
    horasProyectadasWatch != null &&
    horasProyectadasWatch > horasDisponibles;

  const usoMensualWatch = watch("uso_mensual");
  const totalDistribuido = (usoMensualWatch ?? []).reduce(
    (sum, u) => sum + (u.horas_estimadas ?? 0),
    0,
  );
  const excedeMensual =
    horasProyectadasWatch > 0 && totalDistribuido > horasProyectadasWatch;
  const faltaDistribuir =
    horasProyectadasWatch > 0 && totalDistribuido < horasProyectadasWatch;

  if (isLoading || !data)
    return (
      <div className="grid place-items-center h-dvh">
        <Spinner color="text-cian-500" />
      </div>
    );

  const onLimitChange = (newLimit: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(newLimit));
    params.set("page", "1");
    router.push(`/proyectos?${params.toString()}`);
  };

  const onPageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/proyectos?${params.toString()}`);
  };

  const filtersToApply: Record<string, string | undefined> = {
    nombre: uiFilters.nombre,
    estado_id: uiFilters.estado_id,
    area_id: uiFilters.area_id,
  };

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");

    Object.entries(filtersToApply).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    router.push(`/proyectos?${params.toString()}`);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("limit", String(filters.limit));
    router.push(`/proyectos?${params.toString()}`);
    setUiFilters({});
  };

  const onSubmitNuevoProyecto = (data: ProyectoData) => {
    startTransition(async () => {
      const res = await createProyecto(data);
      if (res.success) {
        setIsNewOpen(false);
        setStep(1);
        reset({
          nombre: "",
          area_id: undefined,
          contrato_id: undefined,
          horas_proyectadas: undefined,
          uso_mensual: [],
        });
        queryClient.invalidateQueries({ queryKey: proyectosKeys.all });
        queryClient.invalidateQueries({ queryKey: ["contratos-select"] });
        queryClient.invalidateQueries({ queryKey: resumenKeys.all });
        toast.custom((t) => (
          <Toast id={t} variant="success">
            <p className="text-sm text-gray-600">{res.message}</p>
          </Toast>
        ));
      } else {
        toast.custom((t) => (
          <Toast id={t} variant="error">
            <p className="text-sm text-gray-600">{res.message}</p>
          </Toast>
        ));
      }
    });
  };

  const onEditar = (proyecto: TProyecto) => {
    setEditingProyecto(proyecto);
    resetEdit({
      nombre: proyecto.nombre,
      // Usar toIsoDateString para conservar el día calendario (sin corrimiento
      // UTC→local que recortaba un día en zonas con offset negativo).
      fecha_inicio: toIsoDateString(proyecto.fecha_inicio),
      fecha_fin: toIsoDateString(proyecto.fecha_fin),
      area_id: proyecto.area_id,
      estado_id: proyecto.estado_id,
      estado_contratacion_id: proyecto.estado_contratacion_id,
    });
    setIsEditOpen(true);
  };

  const onSubmitEditProyecto = (data: EditProyectoData) => {
    if (!editingProyecto) return;
    startTransition(async () => {
      const res = await updateProyecto(editingProyecto.id, data);
      if (res.success) {
        setIsEditOpen(false);
        setEditingProyecto(null);
        queryClient.invalidateQueries({ queryKey: proyectosKeys.all });
        queryClient.invalidateQueries({ queryKey: resumenKeys.all });
      }
      toast.custom((t) => (
        <Toast id={t} variant={res.success ? "success" : "error"}>
          <p className="text-sm text-gray-600">{res.message}</p>
        </Toast>
      ));
    });
  };

  return (
    <>
      <main className="container mx-auto px-6 py-8">
        <Title
          title="Gestión de proyectos"
          subtitle="Desde acá vas a poder gestionar los proyectos del sistema"
        />
        <section className="grid grid-cols-12 gap-4 mt-4">
          <div className="col-span-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <Button
                  className="flex-1 sm:flex-auto"
                  variant={"default"}
                  onClick={() => setIsFilterOpen(true)}>
                  <Filter size={14} /> Filtros
                </Button>
                <Button
                  className="flex-1 sm:flex-auto"
                  variant={"ghost"}
                  onClick={() => clearFilters()}>
                  Limpiar filtros
                </Button>
              </div>
              <Button variant={"primary"} onClick={() => setIsNewOpen(true)}>
                Nuevo proyecto
              </Button>
            </div>
          </div>
          <div className="col-span-12">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-3">
              <span className="font-medium text-foreground">Referencias:</span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-400 shrink-0" />
                Proyecto transferido (pasó por más de un contrato)
              </span>
            </div>
            <DataTable
              columns={getProyectosColumns({
                onTransferir: (p) => router.push(`/proyectos/${p.id}/transferir`),
                onEditar,
              })}
              data={data?.data as TProyecto[]}
            />
            <Pagination
              currentPage={filters.page}
              totalPages={Math.ceil((data?.total ?? 0) / filters.limit)}
              limit={filters.limit}
              onLimitChange={onLimitChange}
              onPageChange={onPageChange}
              nextPage={() => onPageChange(filters.page + 1)}
              prevPage={() => onPageChange(filters.page - 1)}
            />
          </div>
        </section>
      </main>

      {/* Dialog: Filtros */}
      <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
            <DialogDescription>
              Seleccioná los filtros que queres aplicar a la búsqueda.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-12 gap-y-4 gap-x-6">
            <div className="col-span-12 lg:col-span-6">
              <Field>
                <FieldLabel>Nombre</FieldLabel>
                <Input
                  placeholder="Buscar por nombre..."
                  value={uiFilters.nombre || ""}
                  onChange={(e) =>
                    setUiFilters((prev) => ({
                      ...prev,
                      nombre: e.target.value,
                    }))
                  }
                />
              </Field>
            </div>
            <div className="col-span-12 lg:col-span-6">
              <Field>
                <FieldLabel>Estado</FieldLabel>
                <Select
                  onValueChange={(value) =>
                    setUiFilters((prev) => ({ ...prev, estado_id: value }))
                  }>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccioná un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {estados.map((estado) => (
                      <SelectItem key={estado.id} value={String(estado.id)}>
                        {estado.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="col-span-12 lg:col-span-6">
              <Field>
                <FieldLabel>Área</FieldLabel>
                <Select
                  onValueChange={(value) =>
                    setUiFilters((prev) => ({ ...prev, area_id: value }))
                  }>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccioná un área" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas?.map((area: Area) => (
                      <SelectItem key={area.id} value={String(area.id)}>
                        {area.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cerrar</Button>
            </DialogClose>
            <Button
              variant={"primary"}
              onClick={() => {
                applyFilters();
                setIsFilterOpen(false);
              }}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nuevo proyecto */}
      <Dialog
        open={isNewOpen}
        onOpenChange={(open) => {
          setIsNewOpen(open);
          if (!open) {
            setStep(1);
            reset({
              nombre: "",
              fecha_inicio: "",
              fecha_fin: "",
              area_id: undefined,
              contrato_id: undefined,
              horas_proyectadas: undefined,
              uso_mensual: [],
            });
          }
        }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between">
                Nuevo proyecto{" "}
                <Badge variant={"secondary"} className="text-sm font-normal">
                  Paso {step} de 2
                </Badge>
              </div>
            </DialogTitle>
            <DialogDescription>
              {step === 1
                ? "Completá los datos del nuevo proyecto."
                : "Estimá las horas por mes para el mismo."}
            </DialogDescription>
          </DialogHeader>

          {/* DialogBody */}
          <div>
            {/* <div className="grid grid-cols-2 gap-6">
              <div>
                <p>Horas proyectadas</p>
                <p>{horasProyectadasWatch}</p>
              </div>
              <div>
                <p>Horas restantes por asignar</p>
                <p>
                  {horasProyectadasWatch -
                    (watch("uso_mensual") ?? []).reduce(
                      (acc, month) => acc + (month.horas_estimadas ?? 0),
                      0,
                    )}
                </p>
              </div>
            </div> */}
            <div className="flex flex-col gap-4">
              {step === 1 && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field>
                      <FieldLabel htmlFor="nombre">Nombre</FieldLabel>
                      <Input
                        id="nombre"
                        aria-invalid={!!errors.nombre}
                        {...register("nombre")}
                        placeholder="Ej: Mejoras UX Secundaria"
                      />
                      {errors.nombre && (
                        <FieldError>
                          <p className="flex items-center gap-2">
                            {errors.nombre.message}
                          </p>
                        </FieldError>
                      )}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="area_id">Área</FieldLabel>
                      <Select
                        value={
                          watch("area_id") ? String(watch("area_id")) : ""
                        }
                        onValueChange={(value) =>
                          setValue("area_id", Number(value), {
                            shouldValidate: true,
                          })
                        }>
                        <SelectTrigger
                          id="area_id"
                          aria-invalid={!!errors.area_id}>
                          <SelectValue placeholder="Seleccioná un área" />
                        </SelectTrigger>
                        <SelectContent>
                          {areas?.map((area: Area) => (
                            <SelectItem key={area.id} value={String(area.id)}>
                              {area.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.area_id && (
                        <FieldError>
                          <p>{errors.area_id.message}</p>
                        </FieldError>
                      )}
                    </Field>
                  </div>

                  <Field>
                    <FieldLabel>Contrato</FieldLabel>
                    <SelectCombobox
                      items={contratos}
                      value={
                        contratos.find((c) => c.id === contratoIdWatch) ?? null
                      }
                      onChange={(contrato) => {
                        setValue("contrato_id", contrato?.id as number, {
                          shouldValidate: true,
                        });
                        setValue("fecha_inicio", "", { shouldValidate: false });
                        setValue("fecha_fin", "", { shouldValidate: false });
                        setValue("horas_proyectadas", undefined as never, {
                          shouldValidate: false,
                        });
                        replace([]);
                      }}
                      getLabel={(c) => `${c.numero_expediente} — ${c.nombre}`}
                      getKey={(c) => c.id}
                      placeholder={
                        isLoadingContratos
                          ? "Cargando contratos..."
                          : "Seleccioná un contrato"
                      }
                      emptyText="No se encontraron contratos."
                      disabled={isLoadingContratos}
                      aria-invalid={!!errors.contrato_id}
                    />
                    {errors.contrato_id && (
                      <FieldError>
                        <p>{errors.contrato_id.message}</p>
                      </FieldError>
                    )}
                  </Field>

                  {contratoSeleccionado && (
                    <>
                      <div className="rounded-lg border bg-muted/30 p-4 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">
                            Fechas del contrato (referencia)
                          </p>
                          {contratoSeleccionado.prorrogas.length > 0 && (
                            <Badge variant="outline">Con prórroga</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">
                              Inicio
                            </p>
                            <p>
                              {formatDate(contratoSeleccionado.fecha_inicio)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">
                              {contratoSeleccionado.prorrogas.length > 0
                                ? "Fin (vigente)"
                                : "Fin"}
                            </p>
                            <p>
                              {contratoSeleccionado.fecha_fin
                                ? formatDate(
                                    contratoSeleccionado.prorrogas.reduce(
                                      (max, p) =>
                                        new Date(p.fecha_fin) > new Date(max)
                                          ? p.fecha_fin
                                          : max,
                                      contratoSeleccionado.fecha_fin,
                                    ),
                                  )
                                : "Sin límite"}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {contratoSeleccionado.prorrogas.length > 0
                            ? "El proyecto no puede exceder esta fecha porque el contrato tiene prórroga."
                            : "Las fechas del proyecto pueden exceder al contrato si no tiene prórroga."}
                        </p>
                      </div>

                      <div className="rounded-lg border p-4 flex flex-col gap-3">
                        <p className="text-sm font-medium">
                          Fechas del proyecto
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <Field>
                            <FieldLabel>Fecha inicio</FieldLabel>
                            <Popover
                              open={openFechaInicio}
                              onOpenChange={setOpenFechaInicio}>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !fechaInicioWatch &&
                                      "text-muted-foreground",
                                    errors.fecha_inicio &&
                                      "border-destructive focus:ring-destructive/20 focus:ring-3",
                                  )}>
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {fechaInicioWatch
                                    ? formatDate(fechaInicioWatch)
                                    : "Seleccionar fecha"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="start">
                                <Calendar
                                  mode="single"
                                  captionLayout="dropdown"
                                  startMonth={(() => {
                                    const inicio = parseDateOnly(
                                      contratoSeleccionado.fecha_inicio,
                                    );
                                    return new Date(
                                      inicio.getFullYear(),
                                      inicio.getMonth(),
                                    );
                                  })()}
                                  endMonth={
                                    new Date(new Date().getFullYear() + 5, 11)
                                  }
                                  selected={
                                    fechaInicioWatch
                                      ? parseDateOnly(fechaInicioWatch)
                                      : undefined
                                  }
                                  disabled={(date) => {
                                    const contratoInicio = parseDateOnly(
                                      contratoSeleccionado.fecha_inicio,
                                    );
                                    if (date < contratoInicio) return true;
                                    // Solo limita por fecha vigente cuando hay
                                    // prórroga. Sin prórroga el proyecto puede
                                    // exceder al contrato.
                                    if (
                                      contratoSeleccionado.prorrogas.length > 0 &&
                                      contratoSeleccionado.fecha_fin
                                    ) {
                                      const vigente =
                                        contratoSeleccionado.prorrogas.reduce(
                                          (max, p) => {
                                            const d = parseDateOnly(p.fecha_fin);
                                            return d > max ? d : max;
                                          },
                                          parseDateOnly(
                                            contratoSeleccionado.fecha_fin,
                                          ),
                                        );
                                      if (date > vigente) return true;
                                    }
                                    return false;
                                  }}
                                  onSelect={(date) => {
                                    const v = date
                                      ? format(date, "yyyy-MM-dd")
                                      : "";
                                    setValue("fecha_inicio", v, {
                                      shouldValidate: true,
                                    });
                                    setOpenFechaInicio(false);
                                    if (v && fechaFinWatch)
                                      replace(
                                        getMonthsBetween(v, fechaFinWatch).map(
                                          (m) => ({
                                            ...m,
                                            horas_estimadas: 0,
                                          }),
                                        ),
                                      );
                                    else replace([]);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                            {errors.fecha_inicio && (
                              <FieldError>
                                <p>{errors.fecha_inicio.message}</p>
                              </FieldError>
                            )}
                          </Field>

                          <Field>
                            <FieldLabel>Fecha fin</FieldLabel>
                            <Popover
                              open={openFechaFin}
                              onOpenChange={setOpenFechaFin}>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={cn(
                                    "w-full justify-start text-left font-normal",
                                    !fechaFinWatch && "text-muted-foreground",
                                    errors.fecha_fin &&
                                      "border-destructive focus:ring-destructive/20 focus:ring-3",
                                  )}>
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {fechaFinWatch
                                    ? formatDate(fechaFinWatch)
                                    : "Seleccionar fecha"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0"
                                align="start">
                                <Calendar
                                  mode="single"
                                  captionLayout="dropdown"
                                  startMonth={(() => {
                                    const inicio = parseDateOnly(
                                      contratoSeleccionado.fecha_inicio,
                                    );
                                    return new Date(
                                      inicio.getFullYear(),
                                      inicio.getMonth(),
                                    );
                                  })()}
                                  endMonth={
                                    new Date(new Date().getFullYear() + 5, 11)
                                  }
                                  selected={
                                    fechaFinWatch
                                      ? parseDateOnly(fechaFinWatch)
                                      : undefined
                                  }
                                  disabled={(date) => {
                                    if (
                                      fechaInicioWatch &&
                                      date <= parseDateOnly(fechaInicioWatch)
                                    )
                                      return true;
                                    // Solo limita por fecha vigente cuando hay
                                    // prórroga. Sin prórroga el proyecto puede
                                    // exceder al contrato.
                                    if (
                                      contratoSeleccionado.prorrogas.length > 0 &&
                                      contratoSeleccionado.fecha_fin
                                    ) {
                                      const vigente =
                                        contratoSeleccionado.prorrogas.reduce(
                                          (max, p) => {
                                            const d = parseDateOnly(p.fecha_fin);
                                            return d > max ? d : max;
                                          },
                                          parseDateOnly(
                                            contratoSeleccionado.fecha_fin,
                                          ),
                                        );
                                      if (date > vigente) return true;
                                    }
                                    return false;
                                  }}
                                  onSelect={(date) => {
                                    const v = date
                                      ? format(date, "yyyy-MM-dd")
                                      : "";
                                    setValue("fecha_fin", v, {
                                      shouldValidate: true,
                                    });
                                    setOpenFechaFin(false);
                                    if (fechaInicioWatch && v)
                                      replace(
                                        getMonthsBetween(
                                          fechaInicioWatch,
                                          v,
                                        ).map((m) => ({
                                          ...m,
                                          horas_estimadas: 0,
                                        })),
                                      );
                                    else replace([]);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                            {errors.fecha_fin && (
                              <FieldError>
                                <p>{errors.fecha_fin.message}</p>
                              </FieldError>
                            )}
                          </Field>
                        </div>
                      </div>
                    </>
                  )}

                  {contratoIdWatch && (
                    <Field>
                      <FieldLabel htmlFor="horas_proyectadas">
                        Horas proyectadas{" "}
                        <span className="text-muted-foreground font-normal">
                          (
                          {horasDisponibles != null
                            ? `${horasDisponibles.toLocaleString("es-AR")} hs disponibles`
                            : "Sin límite"}
                          )
                        </span>
                      </FieldLabel>
                      <Input
                        id="horas_proyectadas"
                        type="text"
                        aria-invalid={!!errors.horas_proyectadas || excede}
                        inputMode="numeric"
                        placeholder={
                          horasDisponibles != null
                            ? `Máx: ${horasDisponibles.toLocaleString("es-AR")}`
                            : "Ej: 0"
                        }
                        {...register("horas_proyectadas", {
                          setValueAs: (v) => {
                            if (v == null || String(v).trim() === "")
                              return null;
                            const n = Number(v);
                            return Number.isFinite(n) ? n : undefined;
                          },
                        })}
                      />
                      {excede && horasDisponibles != null && (
                        <FieldError>
                          <p>
                            Excede las horas disponibles del contrato (
                            {horasDisponibles.toLocaleString("es-AR")} hs)
                          </p>
                        </FieldError>
                      )}
                      {errors.horas_proyectadas && !excede && (
                        <FieldError>
                          <p>{errors.horas_proyectadas.message}</p>
                        </FieldError>
                      )}
                    </Field>
                  )}
                </div>
              )}

              {step === 2 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {fields.map((field, index) => {
                      const fieldError =
                        errors.uso_mensual?.[index]?.horas_estimadas;
                      return (
                        <Field key={field.id}>
                          <FieldLabel>
                            {MESES[field.mes - 1]} {field.anio}
                          </FieldLabel>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            aria-invalid={!!fieldError}
                            {...register(
                              `uso_mensual.${index}.horas_estimadas`,
                              {
                                setValueAs: (v) => {
                                  if (v == null || String(v).trim() === "")
                                    return 0;
                                  const n = Number(v);
                                  return Number.isFinite(n) ? n : 0;
                                },
                              },
                            )}
                          />
                          {fieldError && (
                            <FieldError>{fieldError.message}</FieldError>
                          )}
                        </Field>
                      );
                    })}
                  </div>
                  {horasProyectadasWatch > 0 && (
                    <div className="text-sm text-right space-y-1">
                      <p className="text-muted-foreground">
                        Total distribuido:{" "}
                        <span
                          className={`font-medium ${excedeMensual ? "text-rojo-500" : "text-foreground"}`}>
                          {totalDistribuido}
                        </span>{" "}
                        / {horasProyectadasWatch} hs
                      </p>
                      {excedeMensual && (
                        <div className="flex items-center justify-end gap-1 text-rojo-500">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 512 512"
                            fill="currentColor"
                            className="size-4 shrink-0 self-start mt-0.5">
                            <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24V264c0 13.3-10.7 24-24 24s-24-10.7-24-24V152c0-13.3 10.7-24 24-24zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z" />
                          </svg>
                          <p>
                            Superás las horas proyectadas por{" "}
                            {totalDistribuido - horasProyectadasWatch} hs
                          </p>
                        </div>
                      )}
                      {faltaDistribuir && (
                        <div className="flex items-center justify-end gap-1 text-naranja-500">
                          <svg
                            className="size-4 shrink-0 self-start mt-0.5"
                            xmlns="http://www.w3.org/2000/svg"
                            height="24px"
                            viewBox="0 -960 960 960"
                            width="24px"
                            fill="currentColor">
                            <path d="M508.5-291.5Q520-303 520-320v-160q0-17-11.5-28.5T480-520q-17 0-28.5 11.5T440-480v160q0 17 11.5 28.5T480-280q17 0 28.5-11.5Zm0-320Q520-623 520-640t-11.5-28.5Q497-680 480-680t-28.5 11.5Q440-657 440-640t11.5 28.5Q463-600 480-600t28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
                          </svg>
                          <p>
                            Faltan distribuir{" "}
                            {horasProyectadasWatch - totalDistribuido} hs
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            {step === 1 ? (
              <>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancelar
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  variant="primary"
                  disabled={excede}
                  onClick={async () => {
                    const ok = await trigger([
                      "nombre",
                      "fecha_inicio",
                      "fecha_fin",
                      "area_id",
                      "contrato_id",
                      "horas_proyectadas",
                    ]);
                    if (ok && !excede) setStep(2);
                  }}>
                  Siguiente
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(1)}>
                  Volver
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={isPending || excedeMensual}
                  onClick={() => handleSubmit(onSubmitNuevoProyecto)()}>
                  {isPending ? (
                    <>
                      <Spinner color="text-white" size="size-4" /> Guardando
                    </>
                  ) : (
                    "Guardar"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar proyecto */}
      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) setEditingProyecto(null);
        }}>
        <DialogContent
          className="sm:max-w-lg"
          onInteractOutside={(e) => e.preventDefault()}>
          <form onSubmit={handleSubmitEdit(onSubmitEditProyecto)}>
            <DialogHeader>
              <DialogTitle>Editar proyecto</DialogTitle>
              <DialogDescription>
                Modificá los datos del proyecto.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Nombre</FieldLabel>
                  <Input
                    aria-invalid={!!editErrors.nombre}
                    {...registerEdit("nombre")}
                    placeholder="Nombre del proyecto"
                  />
                  {editErrors.nombre && (
                    <FieldError>{editErrors.nombre.message}</FieldError>
                  )}
                </Field>

                <Field>
                  <FieldLabel>Área</FieldLabel>
                  <Select
                    value={
                      watchEdit("area_id") ? String(watchEdit("area_id")) : ""
                    }
                    onValueChange={(v) =>
                      setValueEdit("area_id", Number(v), {
                        shouldValidate: true,
                      })
                    }>
                    <SelectTrigger aria-invalid={!!editErrors.area_id}>
                      <SelectValue placeholder="Seleccioná un área" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas?.map((area: Area) => (
                        <SelectItem key={area.id} value={String(area.id)}>
                          {area.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editErrors.area_id && (
                    <FieldError>{editErrors.area_id.message}</FieldError>
                  )}
                </Field>
              </div>

              <div className="rounded-lg border p-4 flex flex-col gap-3">
                <p className="text-sm font-medium">Fechas del proyecto</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel>Fecha inicio</FieldLabel>
                    <Popover
                      open={openEditFechaInicio}
                      onOpenChange={setOpenEditFechaInicio}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !editFechaInicioWatch && "text-muted-foreground",
                            editErrors.fecha_inicio &&
                              "border-destructive focus:ring-destructive/20 focus:ring-3",
                          )}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editFechaInicioWatch
                            ? formatDate(editFechaInicioWatch)
                            : "Seleccionar fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown"
                          startMonth={new Date(2020, 0)}
                          endMonth={new Date(new Date().getFullYear() + 5, 11)}
                          selected={
                            editFechaInicioWatch
                              ? parseDateOnly(editFechaInicioWatch)
                              : undefined
                          }
                          disabled={(date) =>
                            editFechaFinWatch
                              ? date >= parseDateOnly(editFechaFinWatch)
                              : false
                          }
                          onSelect={(date) => {
                            setValueEdit(
                              "fecha_inicio",
                              date ? format(date, "yyyy-MM-dd") : "",
                              { shouldValidate: true },
                            );
                            setOpenEditFechaInicio(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    {editErrors.fecha_inicio && (
                      <FieldError>{editErrors.fecha_inicio.message}</FieldError>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel>Fecha fin</FieldLabel>
                    <Popover
                      open={openEditFechaFin}
                      onOpenChange={setOpenEditFechaFin}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !editFechaFinWatch && "text-muted-foreground",
                            editErrors.fecha_fin &&
                              "border-destructive focus:ring-destructive/20 focus:ring-3",
                          )}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {editFechaFinWatch
                            ? formatDate(editFechaFinWatch)
                            : "Seleccionar fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown"
                          startMonth={new Date(2020, 0)}
                          endMonth={new Date(new Date().getFullYear() + 5, 11)}
                          selected={
                            editFechaFinWatch
                              ? parseDateOnly(editFechaFinWatch)
                              : undefined
                          }
                          disabled={(date) =>
                            editFechaInicioWatch
                              ? date <= parseDateOnly(editFechaInicioWatch)
                              : false
                          }
                          onSelect={(date) => {
                            setValueEdit(
                              "fecha_fin",
                              date ? format(date, "yyyy-MM-dd") : "",
                              { shouldValidate: true },
                            );
                            setOpenEditFechaFin(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    {editErrors.fecha_fin && (
                      <FieldError>{editErrors.fecha_fin.message}</FieldError>
                    )}
                  </Field>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Estado proyecto</FieldLabel>
                  <Select
                    value={
                      watchEdit("estado_id")
                        ? String(watchEdit("estado_id"))
                        : ""
                    }
                    onValueChange={(v) =>
                      setValueEdit("estado_id", Number(v), {
                        shouldValidate: true,
                      })
                    }>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccioná un estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ESTADO_CONFIG).map(([id, config]) => (
                        <SelectItem key={id} value={id}>
                          {config.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>Estado contratación</FieldLabel>
                  <Select
                    value={
                      watchEdit("estado_contratacion_id")
                        ? String(watchEdit("estado_contratacion_id"))
                        : ""
                    }
                    onValueChange={(v) =>
                      setValueEdit("estado_contratacion_id", Number(v), {
                        shouldValidate: true,
                      })
                    }>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccioná un estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ESTADO_CONTRATACION_CONFIG).map(
                        ([id, config]) => (
                          <SelectItem key={id} value={id}>
                            {config.label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner color="text-white" size="size-4" /> Guardando
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
