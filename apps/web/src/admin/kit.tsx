/* eslint-disable @typescript-eslint/no-explicit-any -- respostas do painel são objetos dinâmicos (camelCase vindos da API) */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, api, post } from "../lib/api";
import { useApi } from "../hooks/useApi";

export type Row = Record<string, any>;

export const call = <T,>(method: "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown) =>
  api<T>(url, { method, ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });

/** Mensagem de erro com os campos inválidos, quando a API informa. */
export function errText(e: unknown): string {
  if (e instanceof ApiError && e.fields) {
    const f = Object.entries(e.fields).map(([k, v]) => (k === "_form" ? v.join(", ") : `${k}: ${v.join(", ")}`)).join(" · ");
    return f ? `${e.message} ${f}` : e.message;
  }
  return (e as Error)?.message ?? "Erro inesperado.";
}

export const brl = (c: number | null | undefined) => (c == null ? "" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100));
/** Aceita "1.234,56" ou "12,5". Retorna centavos ou null se vazio/inválido. */
export function centsFrom(s: string): number | null {
  const t = s.replace(/[^\d,.-]/g, "").trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
export const reaisFrom = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));
export const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
const localInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Aguardando pagamento", confirmed: "Confirmado", processing: "Em separação", ready_for_pickup: "Pronto p/ retirada",
  shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
};
export const PAY_LABEL: Record<string, string> = { pending: "Pendente", paid: "Pago", failed: "Falhou", refunded: "Reembolsado", cancelled: "Cancelado" };
export const METHOD_LABEL: Record<string, string> = { pix: "Pix", card: "Cartão", pay_on_pickup: "Na retirada" };

export function useList<T>(url: string | null) {
  const [n, setN] = useState(0);
  const full = url === null ? null : `${url}${url.includes("?") ? "&" : "?"}_r=${n}`;
  return { ...useApi<T>(full), reload: () => setN((x) => x + 1) };
}

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="adm-page">
      <header className="adm-head"><h1>{title}</h1>{actions && <div className="adm-actions">{actions}</div>}</header>
      {children}
    </section>
  );
}

export const Badge = ({ tone = "muted", children }: { tone?: "ok" | "warn" | "danger" | "muted"; children: ReactNode }) => <span className={`badge-s badge-s--${tone}`}>{children}</span>;
export const statusTone = (s: string) => (["delivered", "confirmed", "active", "approved", "paid"].includes(s) ? "ok" : ["cancelled", "rejected", "failed"].includes(s) ? "danger" : ["awaiting_payment", "pending", "draft"].includes(s) ? "warn" : "muted") as "ok" | "warn" | "danger" | "muted";

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog adm-modal" onClose={onClose}>
      <div className="dialog__head"><h2>{title}</h2><button type="button" className="link-btn" onClick={onClose}>Fechar</button></div>
      {open && children}
    </dialog>
  );
}

export function Pager({ total, offset, limit, onChange }: { total: number; offset: number; limit: number; onChange: (o: number) => void }) {
  if (total <= limit) return null;
  return (
    <nav className="pager" aria-label="Paginação">
      <button type="button" className="btn btn--ghost" disabled={offset <= 0} onClick={() => onChange(Math.max(0, offset - limit))}>Anterior</button>
      <span>{offset + 1}–{Math.min(offset + limit, total)} de {total}</span>
      <button type="button" className="btn btn--ghost" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Próxima</button>
    </nav>
  );
}

export const Table = ({ children }: { children: ReactNode }) => <div className="table-wrap adm-table"><table>{children}</table></div>;

export async function uploadImage(file: File, purpose: "product" | "content") {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use imagens JPG, PNG ou WebP.");
  if (file.size > 8 * 1024 * 1024) throw new Error("A imagem passa de 8 MB.");
  const p = await post<{ key: string; uploadUrl: string; publicUrl: string; headers: Record<string, string> }>("/api/admin/catalog/uploads/presign", { contentType: file.type, size: file.size, purpose });
  const res = await fetch(p.uploadUrl, { method: "PUT", headers: p.headers, body: file }).catch(() => null);
  if (!res?.ok) throw new Error("Falha ao enviar a imagem ao armazenamento. Confira as credenciais e o CORS do bucket.");
  return p;
}

/* ---------- CRUD simples orientado por campos ---------- */
export type Field = {
  key: string; label: string; type: "text" | "number" | "money" | "datetime" | "select" | "bool" | "textarea" | "color";
  options?: Array<{ value: string; label: string }>; rows?: number; required?: boolean; createOnly?: boolean; nullable?: boolean; help?: string; placeholder?: string;
};
type FormVals = Record<string, string | boolean>;

function toForm(fields: Field[], row?: Row): FormVals {
  const out: FormVals = {};
  for (const f of fields) {
    const v = row?.[f.key];
    out[f.key] = f.type === "bool" ? (row ? Boolean(v) : true)
      : f.type === "money" ? reaisFrom(v) : f.type === "datetime" ? localInput(v) : v == null ? "" : String(v);
    if (f.type === "color" && !out[f.key]) out[f.key] = "#5A2D52";
  }
  return out;
}

function toBody(fields: Field[], form: FormVals, creating: boolean): Row {
  const body: Row = {};
  for (const f of fields) {
    if (f.createOnly && !creating) continue;
    const raw = form[f.key];
    if (f.type === "bool") { body[f.key] = Boolean(raw); continue; }
    const s = String(raw ?? "").trim();
    if (s === "") { if (f.nullable && !creating) body[f.key] = null; continue; }
    body[f.key] = f.type === "number" ? Number(s)
      : f.type === "money" ? centsFrom(s)
      : f.type === "datetime" ? new Date(s).toISOString() : s;
  }
  return body;
}

export function FieldInput({ f, value, onChange, disabled }: { f: Field; value: string | boolean; onChange: (v: string | boolean) => void; disabled?: boolean }) {
  if (f.type === "bool") return <label className="check"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} /> {f.label}</label>;
  const common = { value: String(value ?? ""), disabled, required: f.required && !disabled, placeholder: f.placeholder };
  return (
    <label className="field">{f.label}
      {f.type === "textarea" ? <textarea rows={f.rows ?? 3} {...common} onChange={(e) => onChange(e.target.value)} />
        : f.type === "select" ? <select {...common} onChange={(e) => onChange(e.target.value)}><option value="">{f.required ? "Selecione" : "—"}</option>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : <input {...common} type={f.type === "number" ? "number" : f.type === "datetime" ? "datetime-local" : f.type === "color" ? "color" : "text"} inputMode={f.type === "money" ? "decimal" : undefined} onChange={(e) => onChange(e.target.value)} />}
      {f.help && <span className="muted">{f.help}</span>}
    </label>
  );
}

export { toForm as fieldsToForm, toBody as fieldsToBody };

export function SimpleCrud({ url, fields, columns, canWrite, newLabel = "Novo", rowToForm, formToBody, deletable = true, creatable = true }: {
  url: string; fields: Field[]; columns: Array<{ label: string; render: (r: Row) => ReactNode }>; canWrite: boolean; newLabel?: string;
  rowToForm?: (r: Row) => FormVals; formToBody?: (f: FormVals, creating: boolean) => Row; deletable?: boolean; creatable?: boolean;
}) {
  const { data, error, reload } = useList<Row[]>(url);
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState<FormVals>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const creating = editing === "new";

  const open = (row: Row | "new") => { setMsg(null); setForm(row === "new" ? toForm(fields) : rowToForm ? rowToForm(row) : toForm(fields, row)); setEditing(row); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const body = formToBody ? formToBody(form, creating) : toBody(fields, form, creating);
      if (creating) await call("POST", url, body); else await call("PATCH", `${url}/${(editing as Row)["id"]}`, body);
      setEditing(null); reload();
    } catch (err) { setMsg(errText(err)); } finally { setBusy(false); }
  };
  const remove = async (r: Row) => {
    if (!confirm("Excluir este registro?")) return;
    try { await call("DELETE", `${url}/${r["id"]}`); reload(); } catch (err) { alert(errText(err)); }
  };

  return (
    <>
      {error && <p className="warn" role="alert">{error}</p>}
      {canWrite && creatable && <p><button type="button" className="btn" onClick={() => open("new")}>{newLabel}</button></p>}
      <Table>
        <thead><tr>{columns.map((c) => <th key={c.label} scope="col">{c.label}</th>)}{canWrite && <th scope="col"><span className="sr-only">Ações</span></th>}</tr></thead>
        <tbody>
          {(data ?? []).map((r) => (
            <tr key={r["id"]}>
              {columns.map((c) => <td key={c.label}>{c.render(r)}</td>)}
              {canWrite && <td className="adm-row-actions"><button type="button" className="link-btn" onClick={() => open(r)}>Editar</button>{deletable && <button type="button" className="link-btn" onClick={() => remove(r)}>Excluir</button>}</td>}
            </tr>
          ))}
          {data?.length === 0 && <tr><td colSpan={columns.length + 1} className="muted">Nada cadastrado ainda.</td></tr>}
        </tbody>
      </Table>
      <Modal open={editing !== null} title={creating ? newLabel : "Editar"} onClose={() => setEditing(null)}>
        <form className="adm-form" onSubmit={save}>
          {fields.map((f) => <FieldInput key={f.key} f={f} value={form[f.key] ?? ""} disabled={f.createOnly && !creating} onChange={(v) => setForm({ ...form, [f.key]: v })} />)}
          {msg && <p className="warn" role="alert">{msg}</p>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        </form>
      </Modal>
    </>
  );
}
