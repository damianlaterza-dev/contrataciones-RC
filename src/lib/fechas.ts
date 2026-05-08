type ContratoConProrrogas = {
  fecha_fin: Date | null;
  prorrogas: { fecha_fin: Date }[];
};

export function getFechaFinVigente(
  contrato: ContratoConProrrogas,
): Date | null {
  if (contrato.prorrogas.length === 0) return contrato.fecha_fin;
  const inicial = contrato.fecha_fin;
  return contrato.prorrogas.reduce<Date | null>(
    (max, p) => (max == null || p.fecha_fin > max ? p.fecha_fin : max),
    inicial,
  );
}

/**
 * Parsea una fecha (string ISO, "yyyy-MM-dd" o Date) a un Date en medianoche
 * local del día calendario que representa.
 *
 * Why: <Calendar> genera celdas en medianoche local, mientras que
 * `new Date("2026-05-31")` se interpreta como UTC y en zonas con offset
 * negativo (ej. Argentina UTC-3) cae en el día anterior, deshabilitando
 * incorrectamente el último día del rango.
 */
export function parseDateOnly(value: Date | string): Date {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const ymd = value.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function contratoTieneProrroga(contrato: {
  prorrogas: unknown[];
}): boolean {
  return contrato.prorrogas.length > 0;
}

export function contratoEstaVigente(
  contrato: ContratoConProrrogas,
  hoy: Date = new Date(),
): boolean {
  const vigente = getFechaFinVigente(contrato);
  if (!vigente) return true;
  return vigente >= hoy;
}
