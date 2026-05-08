import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formatea un campo DATE de la DB (sin timezone) a dd/mm/yyyy sin conversión UTC */
export function formatDate(date: Date | string | null | undefined): string {
  if (date == null) return "—";
  let iso: string;
  if (date instanceof Date) {
    if (isNaN(date.getTime())) return "—";
    iso = date.toISOString();
  } else {
    // String. Puede venir como ISO ("2026-09-01T..."), YYYY-MM-DD, o algo raro
    // (ej. Date.toString() = "Thu Jan 01..."). Si no parece ISO/YYYY-MM-DD,
    // intentamos parsearlo y reformat.
    if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
      iso = date;
    } else {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) return "—";
      iso = parsed.toISOString();
    }
  }
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
}

/**
 * Devuelve un string YYYY-MM-DD desde un valor que puede ser Date, ISO string,
 * o un string fecha en otro formato. Si no se puede parsear, devuelve "".
 */
export function toIsoDateString(
  value: Date | string | null | undefined,
): string {
  if (value == null) return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }
  // String. Si ya viene en formato YYYY-MM-DD o ISO, slice directo.
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}
