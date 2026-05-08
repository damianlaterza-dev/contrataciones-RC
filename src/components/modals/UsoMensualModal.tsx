"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Toast } from "@/components/toast/Toast";
import { resumenKeys, proyectosKeys, contratosKeys } from "@/lib/queryKeys";
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
import { Field, FieldError, FieldLabel } from "../ui/field";

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

type Props = {
  open: boolean;
  onClose: () => void;
  contrato_proyecto_id: number;
  proyecto_nombre: string;
  anio: number;
  mes: number;
  horas_estimadas?: number | null;
  horas_reales?: number | null;
  fuera_de_contrato?: boolean;
  /**
   * Habilita la edición del campo `horas_estimadas`. Solo se setea en true
   * cuando el proyecto fue transferido (tiene >1 tramo) — en proyectos de un
   * solo tramo las estimadas se fijan en la creación.
   */
  editable_estimadas?: boolean;
};

function parseNullableNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const MAX_HORAS = 999999;

function isInvalidInput(value: string): boolean {
  if (value.trim() === "") return false;
  const parsed = Number(value);
  return !Number.isFinite(parsed) || parsed > MAX_HORAS;
}

export function UsoMensualModal({
  open,
  onClose,
  contrato_proyecto_id,
  proyecto_nombre,
  anio,
  mes,
  horas_estimadas,
  horas_reales,
  fuera_de_contrato = false,
  editable_estimadas = false,
}: Props) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const estimadasInicial =
    horas_estimadas == null ? "" : String(horas_estimadas);
  const [estimadas, setEstimadas] = useState(estimadasInicial);
  const [reales, setReales] = useState(
    horas_reales == null ? "" : String(horas_reales),
  );

  // Mes fuera de la vigencia del contrato: estimadas forzadas a 0 read-only.
  const estimadasBloqueadasFueraContrato = fuera_de_contrato;
  const puedeEditarEstimadas =
    editable_estimadas && !estimadasBloqueadasFueraContrato;

  const showToast = (success: boolean, message: string) => {
    toast.custom((toastId) => (
      <Toast id={toastId} variant={success ? "success" : "error"}>
        <p className="text-sm text-gray-600">{message}</p>
      </Toast>
    ));
  };

  const realesInvalid = isInvalidInput(reales);
  const estimadasInvalid = puedeEditarEstimadas && isInvalidInput(estimadas);

  const handleSubmit = () => {
    if (realesInvalid || estimadasInvalid) return;
    startTransition(async () => {
      // Solo enviamos horas_estimadas si es editable y cambió respecto al
      // valor inicial — así no recalculamos horas_proyectadas del tramo
      // sin necesidad.
      const estimadasCambio =
        puedeEditarEstimadas && estimadas !== estimadasInicial;
      const body: Record<string, unknown> = {
        contrato_proyecto_id,
        anio,
        mes,
        horas_reales: parseNullableNumber(reales),
      };
      if (estimadasCambio) {
        body.horas_estimadas = parseNullableNumber(estimadas);
      }

      const response = await fetch("/api/uso-mensual", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (response.ok) {
        await queryClient.invalidateQueries({
          queryKey: resumenKeys.all,
        });
        if (estimadasCambio) {
          // Recalcular horas_proyectadas del tramo afecta listados de
          // proyectos y de contratos (horas asignadas/disponibles).
          await queryClient.invalidateQueries({
            queryKey: proyectosKeys.all,
          });
          await queryClient.invalidateQueries({
            queryKey: contratosKeys.all,
          });
        }
        onClose();
      }

      showToast(
        response.ok,
        result.message ?? "No se pudo guardar el uso mensual",
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            Horas - {MESES[mes - 1]} {anio}
          </DialogTitle>
          <DialogDescription>{proyecto_nombre}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2">
          {fuera_de_contrato && (
            <div className="rounded-md bg-rojo-100/40 border border-rojo-200 p-3 text-sm">
              <p className="font-medium text-rojo-700">
                Mes fuera de la vigencia del contrato
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                El estimado queda en 0. Podés ingresar horas reales pero la
                celda se mostrará en rojo.
              </p>
            </div>
          )}
          {puedeEditarEstimadas ? (
            <Field>
              <FieldLabel htmlFor="horas-estimadas">Horas estimadas</FieldLabel>
              <Input
                id="horas-estimadas"
                type="text"
                inputMode="numeric"
                aria-invalid={estimadasInvalid}
                value={estimadas}
                onChange={(event) => setEstimadas(event.target.value)}
                placeholder="Ingresá un valor"
              />
              {estimadasInvalid && (
                <FieldError>
                  {estimadas.trim() !== "" &&
                  Number.isFinite(Number(estimadas)) &&
                  Number(estimadas) > MAX_HORAS
                    ? `El valor no puede superar ${MAX_HORAS.toLocaleString("es-AR")}`
                    : "Ingresá un valor válido"}
                </FieldError>
              )}
              <p className="text-xs text-muted-foreground">
                Editable porque el proyecto fue transferido. Al guardar, el
                total proyectado del tramo se recalcula como la suma de las
                estimadas mensuales.
              </p>
            </Field>
          ) : (
            <div className="flex items-center-safe gap-1">
              <p className="text-sm font-semibold">Horas estimadas:</p>
              <p className="text-azul-600 font-semibold">
                {horas_estimadas ?? 0}
              </p>
            </div>
          )}

          <Field>
            <FieldLabel htmlFor="horas-reales">Horas reales</FieldLabel>
            <Input
              id="horas-reales"
              type="text"
              inputMode="numeric"
              aria-invalid={realesInvalid}
              value={reales}
              onChange={(event) => setReales(event.target.value)}
              placeholder="Ingresá un valor"
            />
            {realesInvalid && (
              <FieldError>
                {reales.trim() !== "" &&
                Number.isFinite(Number(reales)) &&
                Number(reales) > MAX_HORAS
                  ? `El valor no puede superar ${MAX_HORAS.toLocaleString("es-AR")}`
                  : "Ingresá un valor válido"}
              </FieldError>
            )}
          </Field>
        </div>
        {!puedeEditarEstimadas && (
          <p className="text-xs text-muted-foreground italic">
            * Si no ingresás horas reales, se elimina el registro mensual.
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={isPending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={isPending || realesInvalid || estimadasInvalid}>
            {isPending ? (
              <>
                <Spinner className="text-white" data-icon="inline-start" />
                Guardando
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
