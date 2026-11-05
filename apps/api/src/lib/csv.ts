import { AppError } from "../middleware/errors";

const TZ = "America/Sao_Paulo";

/** CSV para Excel em português: separador ";", vírgula decimal, BOM UTF-8 e proteção contra fórmulas. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    let s = v instanceof Date ? v.toLocaleString("pt-BR", { timeZone: TZ }) : typeof v === "number" ? String(v).replace(".", ",") : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`; // evita injeção de fórmula
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
export function resolveRange(from?: string, to?: string) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const end = to ?? today;
  const start = from ?? new Date(Date.parse(end) - 29 * 86_400_000).toISOString().slice(0, 10);
  if (start > end) throw new AppError(400, "invalid_range", "A data inicial deve ser anterior à final.");
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 > 366) throw new AppError(400, "invalid_range", "O período máximo é de 1 ano.");
  return { from: start, to: end };
}

