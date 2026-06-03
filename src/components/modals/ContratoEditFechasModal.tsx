"use client";

import { useState, useEffect, useTransition } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { updateContratoFechas } from "@/actions/contratos";
import { useQueryClient } from "@tanstack/react-query";
import { contratosKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { Toast } from "@/components/toast/Toast";
import { VisuallyHidden } from "radix-ui";
import type { TContrato } from "@/components/datatable/contratos/columns";
import { PROVEEDOR_MINISTERIO_ID } from "@/schemas/contratoWizardSchema";

type Props = {
  contrato: TContrato;
  open: boolean;
  onClose: () => void;
};

function parseDateString(str: string | Date | null | undefined): Date | undefined {
  if (!str) return undefined;
  const s = typeof str === "string" ? str : str.toISOString();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function ContratoEditFechasModal({ contrato, open, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const esMinisterio = contrato.proveedor_id === PROVEEDOR_MINISTERIO_ID;
  const tieneProrroga = contrato.prorrogas.length > 0;
  const ultimaProrroga = tieneProrroga
    ? contrato.prorrogas[contrato.prorrogas.length - 1]
    : null;

  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(
    parseDateString(contrato.fecha_inicio as unknown as string),
  );
  const [fechaFin, setFechaFin] = useState<Date | undefined>(
    parseDateString(contrato.fecha_fin as unknown as string),
  );
  const [fechaFinExtendida, setFechaFinExtendida] = useState<Date | undefined>(
    parseDateString(ultimaProrroga?.fecha_fin as unknown as string),
  );

  // Resetear fechas cuando cambia el contrato seleccionado para evitar que
  // queden "pegadas" las fechas del contrato anterior.
  useEffect(() => {
    const ultima = contrato.prorrogas.length > 0
      ? contrato.prorrogas[contrato.prorrogas.length - 1]
      : null;
    setFechaInicio(parseDateString(contrato.fecha_inicio as unknown as string));
    setFechaFin(parseDateString(contrato.fecha_fin as unknown as string));
    setFechaFinExtendida(parseDateString(ultima?.fecha_fin as unknown as string));
  }, [contrato.id]);

  const [openFechaInicio, setOpenFechaInicio] = useState(false);
  const [openFechaFin, setOpenFechaFin] = useState(false);
  const [openFechaFinExtendida, setOpenFechaFinExtendida] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    if (!fechaInicio) {
      setError("La fecha de inicio es requerida");
      return;
    }
    if (!esMinisterio && !fechaFin) {
      setError("La fecha de fin es requerida");
      return;
    }
    if (fechaFin && fechaFin <= fechaInicio) {
      setError("La fecha de fin debe ser posterior a la fecha de inicio");
      return;
    }
    if (fechaFinExtendida && fechaFin && fechaFinExtendida <= fechaFin) {
      setError("La fecha fin extendida debe ser posterior a la fecha fin");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await updateContratoFechas(contrato.id, {
        fecha_inicio: format(fechaInicio, "yyyy-MM-dd"),
        fecha_fin: fechaFin ? format(fechaFin, "yyyy-MM-dd") : null,
        fecha_fin_extendida: fechaFinExtendida
          ? format(fechaFinExtendida, "yyyy-MM-dd")
          : null,
      });

      if (res.success) {
        await queryClient.refetchQueries({ queryKey: contratosKeys.all });
        toast.custom((t) => (
          <Toast id={t} variant="success">
            <p className="text-sm text-gray-600">{res.message}</p>
          </Toast>
        ));
        handleClose();
      } else {
        setError(res.message ?? "Error inesperado");
        toast.custom((t) => (
          <Toast id={t} variant="error">
            <p className="text-sm text-gray-600">{res.message ?? "Error inesperado"}</p>
          </Toast>
        ));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Editar fechas del contrato</DialogTitle>
          <VisuallyHidden.Root>
            <DialogDescription />
          </VisuallyHidden.Root>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <Field>
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
                  {fechaInicio ? format(fechaInicio, "dd/MM/yyyy") : "Seleccionar fecha"}
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
                    setOpenFechaInicio(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>

          {!esMinisterio && (
            <Field>
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
                    {fechaFin ? format(fechaFin, "dd/MM/yyyy") : "Seleccionar fecha"}
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
                      setOpenFechaFin(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
          )}

          {tieneProrroga && (
            <Field>
              <FieldLabel>
                Fecha fin extendida{" "}
                <span className="text-muted-foreground font-normal text-xs">
                  (última prórroga)
                </span>
              </FieldLabel>
              <Popover
                open={openFechaFinExtendida}
                onOpenChange={setOpenFechaFinExtendida}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fechaFinExtendida && "text-muted-foreground",
                    )}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fechaFinExtendida
                      ? format(fechaFinExtendida, "dd/MM/yyyy")
                      : "Seleccionar fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    fromYear={2020}
                    toYear={new Date().getFullYear() + 5}
                    selected={fechaFinExtendida}
                    onSelect={(date) => {
                      setFechaFinExtendida(date);
                      setOpenFechaFinExtendida(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
          )}

          {error && (
            <FieldError>
              <p>{error}</p>
            </FieldError>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isPending}
            onClick={handleSubmit}>
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
