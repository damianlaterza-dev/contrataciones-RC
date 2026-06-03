"use client";

import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  contratoStep1Schema,
  PROVEEDOR_MINISTERIO_ID,
  type ContratoStep1Data,
} from "@/schemas/contratoWizardSchema";
import { createContratoCompleto } from "@/actions/contratos";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { contratosKeys, proveedoresKeys } from "@/lib/queryKeys";
import { VisuallyHidden } from "radix-ui";
import { toast } from "sonner";
import { Toast } from "@/components/toast/Toast";

type SelectOption = { id: number; label?: string; nombre?: string };
type ContratoPrincipalOption = {
  id: number;
  nombre: string;
  numero_expediente: string;
};

type Props = { open: boolean; onClose: () => void };

export function ContratoFormModal({ open, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>();
  const [fechaFin, setFechaFin] = useState<Date | undefined>();
  const [openFechaInicio, setOpenFechaInicio] = useState(false);
  const [openFechaFin, setOpenFechaFin] = useState(false);

  const form = useForm<ContratoStep1Data>({
    resolver: zodResolver(contratoStep1Schema),
    defaultValues: {
      nombre: "",
      es_accesoridad: false,
      contrato_principal_id: null,
      fecha_inicio: "",
      fecha_fin: "",
      renglones: [{ cantidad_horas: undefined as unknown as number, valor_hora: null }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "renglones",
  });

  const queryClient = useQueryClient();
  const esAccesoridad = form.watch("es_accesoridad");
  const proveedorIdWatch = form.watch("proveedor_id");
  const esMinisterio = proveedorIdWatch === PROVEEDOR_MINISTERIO_ID;

  const { data: proveedores = [], isLoading: isLoadingProveedores } = useQuery<
    SelectOption[]
  >({
    queryKey: [...proveedoresKeys.all, "select"],
    queryFn: () => fetch("/api/proveedores").then((r) => r.json()),
  });

  const { data: contratosPrincipales = [], isLoading: isLoadingContratos } =
    useQuery<ContratoPrincipalOption[]>({
      queryKey: ["contratos-principales-select"],
      queryFn: () =>
        fetch("/api/contratos?for_principal_select=true").then((r) => r.json()),
      enabled: open && esAccesoridad === true,
    });

  const handleClose = () => {
    setServerError(null);
    setFechaInicio(undefined);
    setFechaFin(undefined);
    form.reset({
      nombre: "",
      numero_expediente: "",
      proveedor_id: undefined,
      es_accesoridad: false,
      contrato_principal_id: null,
      fecha_inicio: "",
      fecha_fin: "",
      renglones: [{ cantidad_horas: undefined as unknown as number, valor_hora: null }],
      observaciones: "",
    });
    onClose();
  };

  const showToast = (success: boolean, message: string) => {
    toast.custom((t) => (
      <Toast id={t} variant={success ? "success" : "error"}>
        <p className="text-sm text-gray-600">{message}</p>
      </Toast>
    ));
  };

  const handleSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      const result = await createContratoCompleto(data);
      if (result.success) {
        await queryClient.refetchQueries({ queryKey: contratosKeys.all });
        await queryClient.invalidateQueries({ queryKey: ["contratos-select"] });
        showToast(true, result.message);
        handleClose();
      } else {
        setServerError(result.message ?? "Error inesperado");
        showToast(false, result.message ?? "Error inesperado");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Nuevo contrato</DialogTitle>
        </DialogHeader>
        <VisuallyHidden.Root>
          <DialogDescription />
        </VisuallyHidden.Root>

        <form onSubmit={handleSubmit} className="grid grid-cols-12 gap-4 mt-2">
          {/* Proveedor */}
          <Field className="col-span-6">
            <FieldLabel>Proveedor</FieldLabel>
            <Select
              value={form.watch("proveedor_id")?.toString() ?? ""}
              onValueChange={(v) => {
                const id = Number(v);
                form.setValue("proveedor_id", id, { shouldValidate: true });
                if (id === PROVEEDOR_MINISTERIO_ID) {
                  setFechaFin(undefined);
                  form.setValue("fecha_fin", null, { shouldValidate: true });
                }
              }}>
              <SelectTrigger disabled={isLoadingProveedores}>
                <SelectValue
                  placeholder={
                    isLoadingProveedores
                      ? "Cargando proveedores..."
                      : "Seleccioná un proveedor"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {proveedores.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.proveedor_id && (
              <FieldError>
                <p>{form.formState.errors.proveedor_id.message}</p>
              </FieldError>
            )}
          </Field>

          {/* Nombre & Nº Expediente */}
          <Field className="col-span-12 lg:col-span-6">
            <FieldLabel htmlFor="nombre">Nombre del contrato</FieldLabel>
            <Input
              id="nombre"
              placeholder="Ej: Renacimiento de infraestructura"
              {...form.register("nombre")}
            />
            {form.formState.errors.nombre && (
              <FieldError>
                <p>{form.formState.errors.nombre.message}</p>
              </FieldError>
            )}
          </Field>

          <Field className="col-span-12 lg:col-span-6">
            <FieldLabel htmlFor="numero_expediente">Nº Expediente</FieldLabel>
            <Input
              id="numero_expediente"
              placeholder="EXP-2026-001"
              {...form.register("numero_expediente")}
            />
            {form.formState.errors.numero_expediente && (
              <FieldError>
                <p>{form.formState.errors.numero_expediente.message}</p>
              </FieldError>
            )}
          </Field>

          {/* Fechas */}
          <Field className="col-span-12 lg:col-span-6">
            <FieldLabel>Fecha de inicio</FieldLabel>
            <Popover open={openFechaInicio} onOpenChange={setOpenFechaInicio}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !fechaInicio && "text-muted-foreground",
                  )}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fechaInicio
                    ? format(fechaInicio, "dd/MM/yyyy")
                    : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  captionLayout="dropdown"
                  fromYear={2020}
                  toYear={new Date().getFullYear() + 5}
                  selected={fechaInicio}
                  onSelect={(date) => {
                    setFechaInicio(date);
                    form.setValue(
                      "fecha_inicio",
                      date ? format(date, "yyyy-MM-dd") : "",
                      { shouldValidate: true },
                    );
                    setOpenFechaInicio(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            {form.formState.errors.fecha_inicio && (
              <FieldError>
                <p>{form.formState.errors.fecha_inicio.message}</p>
              </FieldError>
            )}
          </Field>

          {!esMinisterio && (
            <Field className="col-span-12 lg:col-span-6">
              <FieldLabel>Fecha de fin</FieldLabel>
              <Popover open={openFechaFin} onOpenChange={setOpenFechaFin}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fechaFin && "text-muted-foreground",
                    )}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fechaFin
                      ? format(fechaFin, "dd/MM/yyyy")
                      : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    fromYear={2020}
                    toYear={new Date().getFullYear() + 5}
                    selected={fechaFin}
                    onSelect={(date) => {
                      setFechaFin(date);
                      form.setValue(
                        "fecha_fin",
                        date ? format(date, "yyyy-MM-dd") : "",
                        { shouldValidate: true },
                      );
                      setOpenFechaFin(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
              {form.formState.errors.fecha_fin && (
                <FieldError>
                  <p>{form.formState.errors.fecha_fin.message}</p>
                </FieldError>
              )}
            </Field>
          )}

          {/* Renglones */}
          {!esMinisterio && (
            <div className="col-span-12 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Renglones</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    append({ cantidad_horas: undefined as unknown as number, valor_hora: null })
                  }>
                  + Agregar renglón
                </Button>
              </div>
              {fields.map((field, index) => {
                const rError = form.formState.errors.renglones?.[index];
                return (
                  <div
                    key={field.id}
                    className="grid grid-cols-12 gap-3 items-end rounded-lg border p-3">
                    <p className="col-span-12 text-xs font-medium text-muted-foreground">
                      Renglón {index + 1}
                    </p>
                    <Field className="col-span-12 sm:col-span-5">
                      <FieldLabel>Cantidad de horas</FieldLabel>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder="1200"
                        aria-invalid={!!rError?.cantidad_horas}
                        {...form.register(`renglones.${index}.cantidad_horas`, {
                          setValueAs: (v) => {
                            if (v == null || String(v).trim() === "") return undefined;
                            return Number(v);
                          },
                        })}
                      />
                      {rError?.cantidad_horas && (
                        <FieldError>
                          <p>{rError.cantidad_horas.message}</p>
                        </FieldError>
                      )}
                    </Field>
                    <Field className="col-span-12 sm:col-span-5">
                      <FieldLabel>
                        Valor hora{" "}
                        <span className="text-muted-foreground font-normal">
                          (opcional)
                        </span>
                      </FieldLabel>
                      {(() => {
                        const vhField = form.register(
                          `renglones.${index}.valor_hora`,
                          {
                            setValueAs: (v) => {
                              if (v == null || String(v).trim() === "") return null;
                              const cleaned = String(v).replace(/,/g, ".");
                              const n = Number(cleaned);
                              return Number.isFinite(n) ? n : null;
                            },
                          },
                        );
                        return (
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="1500.00"
                            aria-invalid={!!rError?.valor_hora}
                            {...vhField}
                            onChange={(e) => {
                              e.target.value = e.target.value.replace(/,/g, ".");
                              vhField.onChange(e);
                            }}
                          />
                        );
                      })()}
                      {rError?.valor_hora && (
                        <FieldError>
                          <p>{rError.valor_hora.message}</p>
                        </FieldError>
                      )}
                    </Field>
                    {index > 0 && (
                      <div className="col-span-12 sm:col-span-2 flex sm:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(index)}>
                          Quitar
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              {form.formState.errors.renglones?.root && (
                <FieldError>
                  <p>{form.formState.errors.renglones.root.message}</p>
                </FieldError>
              )}
              {typeof form.formState.errors.renglones?.message === "string" && (
                <FieldError>
                  <p>{form.formState.errors.renglones.message}</p>
                </FieldError>
              )}
            </div>
          )}

          {/* Es accesoridad */}
          <Field className="col-span-12 lg:col-span-6">
            <FieldLabel>¿Es accesoridad?</FieldLabel>
            <Select
              value={
                esAccesoridad === true
                  ? "true"
                  : esAccesoridad === false
                    ? "false"
                    : ""
              }
              onValueChange={(v) => {
                const val = v === "true" ? true : false;
                form.setValue("es_accesoridad", val, { shouldValidate: true });
                if (!val) {
                  form.setValue("contrato_principal_id", null);
                }
              }}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná una opción" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Sí</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Contrato principal (solo si es accesoridad = true) */}
          {esAccesoridad === true && (
            <Field className="col-span-12">
              <FieldLabel>Contrato principal</FieldLabel>
              <Select
                value={form.watch("contrato_principal_id")?.toString() ?? ""}
                onValueChange={(v) =>
                  form.setValue("contrato_principal_id", Number(v), {
                    shouldValidate: true,
                  })
                }>
                <SelectTrigger disabled={isLoadingContratos}>
                  <SelectValue
                    placeholder={
                      isLoadingContratos
                        ? "Cargando contratos..."
                        : "Seleccioná el contrato principal"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {contratosPrincipales.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.numero_expediente} — {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {/* Observaciones */}
          <Field className="col-span-12">
            <FieldLabel htmlFor="observaciones">
              Observaciones{" "}
              <span className="text-muted-foreground font-normal">
                (opcional)
              </span>
            </FieldLabel>
            <Textarea
              id="observaciones"
              placeholder="Notas adicionales sobre el contrato..."
              rows={3}
              {...form.register("observaciones")}
            />
          </Field>

          {serverError && (
            <div className="col-span-12">
              <p className="text-sm text-destructive">{serverError}</p>
            </div>
          )}

          <div className="col-span-12">
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={isPending}>
                {isPending ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
