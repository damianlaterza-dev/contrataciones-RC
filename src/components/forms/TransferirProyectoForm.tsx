"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { SelectCombobox } from "@/components/ui/select-combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { cn, formatDate } from "@/lib/utils";
import { transferirProyectoAction } from "@/actions/proyectos";
import { useQueryClient } from "@tanstack/react-query";
import { proyectosKeys, resumenKeys, contratosKeys } from "@/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Toast } from "@/components/toast/Toast";
import { PROVEEDOR_MINISTERIO_ID } from "@/schemas/contratoWizardSchema";

type ContratoOpcion = {
  id: number;
  nombre: string;
  numero_expediente: string;
  proveedor_id: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  horas_disponibles: number | null;
  prorrogas: { fecha_fin: string }[];
};

type ProveedorOpcion = {
  id: number;
  label: string;
};

type UsoMensualItem = {
  anio: number;
  mes: number;
  horas_estimadas: number | null;
};

type Tramo = {
  id: number;
  contrato_id: number;
  contrato_label: string;
  fecha_inicio_vinculo: string;
  fecha_fin_vinculo: string;
  uso_mensual: UsoMensualItem[];
};

type Props = {
  proyecto: {
    id: number;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
  };
  tramos: Tramo[];
  contratos: ContratoOpcion[];
  proveedores: ProveedorOpcion[];
};

export function TransferirProyectoForm({
  proyecto,
  tramos,
  contratos,
  proveedores,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [contratoOrigenId, setContratoOrigenId] = useState<number | null>(null);
  const [proveedorDestinoId, setProveedorDestinoId] = useState<number | null>(
    null,
  );
  const [contratoDestinoId, setContratoDestinoId] = useState<number | null>(
    null,
  );
  const [fechaCorte, setFechaCorte] = useState<Date | undefined>();
  const [openFechaCorte, setOpenFechaCorte] = useState(false);
  const [horasDestino, setHorasDestino] = useState<string>("");
  const [horasEditadasManual, setHorasEditadasManual] = useState(false);

  const queryClient = useQueryClient();

  const showToast = (success: boolean, message: string) => {
    toast.custom((t) => (
      <Toast id={t} variant={success ? "success" : "error"}>
        <p className="text-sm text-gray-600">{message}</p>
      </Toast>
    ));
  };

  useEffect(() => {
    if (contratoOrigenId == null && tramos.length > 0) {
      const hoy = new Date();
      const activos = tramos.filter(
        (t) => new Date(t.fecha_fin_vinculo) >= hoy,
      );
      if (activos.length === 1) {
        setContratoOrigenId(activos[0].contrato_id);
      }
    }
  }, [tramos, contratoOrigenId]);

  const tramoOrigen = tramos.find((t) => t.contrato_id === contratoOrigenId);

  const proveedorOrigenId = useMemo(() => {
    if (!contratoOrigenId) return null;
    return (
      contratos.find((c) => c.id === contratoOrigenId)?.proveedor_id ?? null
    );
  }, [contratoOrigenId, contratos]);

  const contratosDestinoFiltrados = useMemo(() => {
    if (!proveedorDestinoId) return [];
    return contratos.filter(
      (c) =>
        c.proveedor_id === proveedorDestinoId && c.id !== contratoOrigenId,
    );
  }, [contratos, proveedorDestinoId, contratoOrigenId]);

  const contratoDestino = contratosDestinoFiltrados.find(
    (c) => c.id === contratoDestinoId,
  );

  useEffect(() => {
    if (
      contratoDestinoId &&
      !contratosDestinoFiltrados.some((c) => c.id === contratoDestinoId)
    ) {
      setContratoDestinoId(null);
    }
  }, [contratosDestinoFiltrados, contratoDestinoId]);

  // Meses post-corte del tramo origen (estrictamente posteriores al mes del
  // corte). Estos son los que el service traspasa automáticamente al nuevo
  // tramo. Mostramos la suma como referencia y precargamos `horasDestino`.
  const mesesTraspaso = useMemo(() => {
    if (!tramoOrigen || !fechaCorte) return [];
    const cy = fechaCorte.getFullYear();
    const cm = fechaCorte.getMonth() + 1;
    return tramoOrigen.uso_mensual.filter(
      (u) => u.anio > cy || (u.anio === cy && u.mes > cm),
    );
  }, [tramoOrigen, fechaCorte]);

  const sumaTraspaso = useMemo(
    () =>
      mesesTraspaso.reduce((sum, m) => sum + (m.horas_estimadas ?? 0), 0),
    [mesesTraspaso],
  );

  useEffect(() => {
    if (!horasEditadasManual && mesesTraspaso.length > 0) {
      setHorasDestino(String(sumaTraspaso));
    }
  }, [sumaTraspaso, mesesTraspaso.length, horasEditadasManual]);

  const handleCancel = () => {
    router.push("/proyectos");
  };

  const handleSubmit = () => {
    setServerError(null);
    if (!contratoOrigenId || !contratoDestinoId || !fechaCorte) {
      setServerError("Completá todos los campos requeridos");
      return;
    }
    const horasNum = Number(horasDestino);
    if (!Number.isFinite(horasNum) || horasNum < 0) {
      setServerError("Las horas del nuevo tramo deben ser 0 o mayores");
      return;
    }
    startTransition(async () => {
      const res = await transferirProyectoAction({
        proyecto_id: proyecto.id,
        contrato_origen_id: contratoOrigenId,
        contrato_destino_id: contratoDestinoId,
        fecha_corte: format(fechaCorte, "yyyy-MM-dd"),
        horas_destino: horasNum,
      });
      if (res.success) {
        await queryClient.refetchQueries({ queryKey: proyectosKeys.all });
        await queryClient.refetchQueries({ queryKey: resumenKeys.all });
        await queryClient.refetchQueries({ queryKey: contratosKeys.all });
        await queryClient.refetchQueries({ queryKey: ["contratos-select"] });
        showToast(true, res.message);
        router.push("/proyectos");
      } else {
        setServerError(res.message ?? "Error al transferir");
        showToast(false, res.message ?? "Error al transferir");
      }
    });
  };

  const proveedoresDestino = proveedores.filter(
    (p) => p.id !== proveedorOrigenId,
  );

  const esMinisterio = proveedorDestinoId === PROVEEDOR_MINISTERIO_ID;

  const horasDestinoNum = Number(horasDestino);
  const muestraDesfase =
    mesesTraspaso.length > 0 &&
    Number.isFinite(horasDestinoNum) &&
    horasDestinoNum !== sumaTraspaso;

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel>Tramo origen</FieldLabel>
        <SelectCombobox
          items={tramos}
          value={tramos.find((t) => t.contrato_id === contratoOrigenId) ?? null}
          onChange={(t) => setContratoOrigenId(t?.contrato_id ?? null)}
          getLabel={(t) =>
            `${t.contrato_label} — ${formatDate(t.fecha_inicio_vinculo)} → ${formatDate(t.fecha_fin_vinculo)}`
          }
          getKey={(t) => t.id}
          placeholder="Seleccioná el tramo a cortar"
          emptyText="Este proyecto no tiene tramos asignados."
        />
      </Field>

      {tramoOrigen && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Tramo a cortar</p>
          <p className="font-medium">{tramoOrigen.contrato_label}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(tramoOrigen.fecha_inicio_vinculo)} →{" "}
            {formatDate(tramoOrigen.fecha_fin_vinculo)}
          </p>
        </div>
      )}

      <Field>
        <FieldLabel>Proveedor destino</FieldLabel>
        <Select
          value={proveedorDestinoId ? String(proveedorDestinoId) : ""}
          onValueChange={(v) => setProveedorDestinoId(Number(v))}
          disabled={!contratoOrigenId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Seleccioná el proveedor destino" />
          </SelectTrigger>
          <SelectContent>
            {proveedoresDestino.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.label}
                {p.id === PROVEEDOR_MINISTERIO_ID && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (Ministerio)
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {esMinisterio && (
          <p className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
            <Badge variant="outline">Ministerio</Badge>
            Las horas post-corte se imputan al contrato interno del Ministerio.
          </p>
        )}
      </Field>

      <Field>
        <FieldLabel>Contrato destino</FieldLabel>
        <SelectCombobox
          items={contratosDestinoFiltrados}
          value={contratoDestino ?? null}
          onChange={(c) => setContratoDestinoId(c?.id ?? null)}
          getLabel={(c) => `${c.numero_expediente} — ${c.nombre}`}
          getKey={(c) => c.id}
          placeholder={
            proveedorDestinoId
              ? contratosDestinoFiltrados.length === 0
                ? "Este proveedor no tiene contratos disponibles"
                : "Seleccioná un contrato"
              : "Elegí primero un proveedor"
          }
          emptyText="Este proveedor no tiene contratos disponibles."
          disabled={
            !proveedorDestinoId || contratosDestinoFiltrados.length === 0
          }
        />
        {contratoDestino && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm mt-2 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              Datos del contrato destino
            </p>
            <p className="font-medium">
              {contratoDestino.numero_expediente} — {contratoDestino.nombre}
            </p>
            <p className="text-xs text-muted-foreground">
              Vigencia: {formatDate(contratoDestino.fecha_inicio)} →{" "}
              {contratoDestino.prorrogas.length > 0
                ? formatDate(
                    contratoDestino.prorrogas[
                      contratoDestino.prorrogas.length - 1
                    ].fecha_fin,
                  )
                : contratoDestino.fecha_fin
                  ? formatDate(contratoDestino.fecha_fin)
                  : "Sin límite"}
              {contratoDestino.prorrogas.length > 0 && " (con prórroga)"}
            </p>
            <p className="text-xs">
              Horas disponibles:{" "}
              <span className="font-semibold text-azul-600">
                {contratoDestino.horas_disponibles != null
                  ? `${contratoDestino.horas_disponibles.toLocaleString("es-AR")} hs`
                  : "Sin límite"}
              </span>
            </p>
          </div>
        )}
      </Field>

      <Field>
        <FieldLabel>Fecha de corte</FieldLabel>
        <Popover open={openFechaCorte} onOpenChange={setOpenFechaCorte}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !fechaCorte && "text-muted-foreground",
              )}
              disabled={!tramoOrigen}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {fechaCorte
                ? format(fechaCorte, "dd/MM/yyyy")
                : "Seleccionar fecha"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              captionLayout="dropdown"
              startMonth={new Date(2020, 0)}
              endMonth={new Date(new Date().getFullYear() + 5, 11)}
              selected={fechaCorte}
              disabled={(date) => {
                if (!tramoOrigen) return true;
                const inicio = new Date(tramoOrigen.fecha_inicio_vinculo);
                const fin = new Date(tramoOrigen.fecha_fin_vinculo);
                const proyectoFin = new Date(proyecto.fecha_fin);
                return date < inicio || date > fin || date >= proyectoFin;
              }}
              onSelect={(date) => {
                setFechaCorte(date);
                setHorasEditadasManual(false);
                setOpenFechaCorte(false);
              }}
            />
          </PopoverContent>
        </Popover>
        <p className="text-xs text-muted-foreground">
          El nuevo tramo arranca al día siguiente del corte.
        </p>
      </Field>

      {tramoOrigen && fechaCorte && mesesTraspaso.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm flex flex-col gap-1">
          <p className="font-medium text-orange-900">
            Meses estimados que se traspasan al nuevo tramo
          </p>
          <p className="text-xs text-orange-800">
            Se traspasan automáticamente {mesesTraspaso.length}{" "}
            {mesesTraspaso.length === 1 ? "mes" : "meses"} con un total de{" "}
            <span className="font-semibold">
              {sumaTraspaso.toLocaleString("es-AR")} hs
            </span>{" "}
            estimadas.
          </p>
        </div>
      )}

      <Field>
        <FieldLabel>Horas del nuevo tramo</FieldLabel>
        <Input
          type="text"
          inputMode="numeric"
          placeholder="Ej: 200"
          value={horasDestino}
          onChange={(e) => {
            setHorasEditadasManual(true);
            setHorasDestino(e.target.value);
          }}
          disabled={!contratoDestinoId}
        />
        {contratoDestino && (
          <p className="text-xs text-muted-foreground">
            Disponibles en destino:{" "}
            {contratoDestino.horas_disponibles != null
              ? `${contratoDestino.horas_disponibles.toLocaleString("es-AR")} hs`
              : "Sin límite"}
          </p>
        )}
        {muestraDesfase && (
          <p className="text-xs text-amber-700">
            El total de horas del tramo ({horasDestinoNum.toLocaleString("es-AR")}{" "}
            hs) difiere de la suma de meses traspasados (
            {sumaTraspaso.toLocaleString("es-AR")} hs). Vas a poder ajustar la
            distribución mensual después.
          </p>
        )}
      </Field>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={handleCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={handleSubmit}
          disabled={
            isPending ||
            !contratoOrigenId ||
            !contratoDestinoId ||
            !fechaCorte ||
            horasDestino === ""
          }>
          {isPending ? "Transfiriendo..." : "Transferir"}
        </Button>
      </div>
    </div>
  );
}
