/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Badge, call, dt, errText, Modal, Page, Pager, Table, useList, type Row } from "./kit";

type Action = { kind: "entry" | "exit" | "adjustment" | "transfer" | "threshold"; row: Row } | null;
const KIND: Record<string, string> = { entry: "Entrada", exit: "Saída", adjustment: "Ajuste de contagem", transfer: "Transferir", threshold: "Limite de baixo estoque" };
const MOVE: Record<string, string> = { entry: "Entrada", exit: "Saída", adjustment: "Ajuste", transfer_in: "Transf. (entrada)", transfer_out: "Transf. (saída)", sale: "Venda" };

export default function StockPage() {
  const { user } = useAuth();
  const can = (p: string) => user?.permissions.includes(p) ?? false;
  const [tab, setTab] = useState<"saldos" | "historico">("saldos");
  const [loc, setLoc] = useState("");
  const [low, setLow] = useState(false);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [offset, setOffset] = useState(0);
  const locations = useRef(new Map<string, string>());

  const qs = new URLSearchParams({ limit: "40", offset: String(offset) });
  if (loc) qs.set("locationId", loc);
  if (tab === "saldos") { if (low) qs.set("lowOnly", "true"); if (q) qs.set("q", q); } else if (type) qs.set("type", type);
  const { data, error, reload } = useList<{ total: number; items: Row[] }>(`/api/admin/stock${tab === "historico" ? "/movements" : ""}?${qs}`);
  data?.items.forEach((i) => { if (i["locationId"]) locations.current.set(i["locationId"], i["locationCode"]); });
  const locOpts = [...locations.current];

  const [action, setAction] = useState<Action>(null);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [dest, setDest] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const open = (kind: NonNullable<Action>["kind"], row: Row) => { setAction({ kind, row }); setQty(kind === "adjustment" ? String(row["onHand"]) : kind === "threshold" ? String(row["threshold"]) : ""); setReason(""); setDest(""); setMsg(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!action) return;
    const { kind, row } = action;
    const base = { skuId: row["skuId"], locationId: row["locationId"] };
    try {
      if (kind === "entry" || kind === "exit") await call("POST", "/api/admin/stock/movements", { type: kind, ...base, quantity: Number(qty), ...(reason && { reason }) });
      else if (kind === "adjustment") await call("POST", "/api/admin/stock/movements", { type: "adjustment", ...base, newOnHand: Number(qty), reason });
      else if (kind === "transfer") await call("POST", "/api/admin/stock/transfers", { fromLocationId: row["locationId"], toLocationId: dest, items: [{ skuId: row["skuId"], quantity: Number(qty) }], ...(reason && { reason }) });
      else await call("PUT", "/api/admin/stock/thresholds", { ...base, threshold: qty.trim() === "" ? null : Number(qty) });
      setAction(null); reload();
    } catch (err) { setMsg(errText(err)); }
  };

  return (
    <Page title="Estoque">
      <div className="adm-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "saldos"} className={`chip ${tab === "saldos" ? "is-on" : ""}`} onClick={() => { setTab("saldos"); setOffset(0); }}>Saldos</button>
        <button type="button" role="tab" aria-selected={tab === "historico"} className={`chip ${tab === "historico" ? "is-on" : ""}`} onClick={() => { setTab("historico"); setOffset(0); }}>Histórico</button>
      </div>
      <div className="adm-filters">
        <select value={loc} onChange={(e) => { setLoc(e.target.value); setOffset(0); }} aria-label="Unidade"><option value="">Todas as unidades</option>{locOpts.map(([id, code]) => <option key={id} value={id}>{code}</option>)}</select>
        {tab === "saldos" ? (
          <>
            <form onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); setOffset(0); }}><input placeholder="Produto ou SKU" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Buscar" /></form>
            <label className="check"><input type="checkbox" checked={low} onChange={(e) => { setLow(e.target.checked); setOffset(0); }} /> Só baixo estoque</label>
          </>
        ) : (
          <select value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }} aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(MOVE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        )}
      </div>
      {error && <p className="warn" role="alert">{error}</p>}

      {tab === "saldos" ? (
        <Table>
          <thead><tr><th>Produto</th><th>SKU</th><th>Unidade</th><th>Físico</th><th>Reservado</th><th>Disponível</th><th>Limite</th><th /></tr></thead>
          <tbody>
            {data?.items.map((r) => (
              <tr key={`${r["skuId"]}:${r["locationId"]}`}>
                <td>{r["productName"]}<br /><span className="muted">{r["colorName"]} · {r["sizeLabel"]}{!r["skuActive"] && " · inativo"}</span></td>
                <td>{r["skuCode"]}</td><td>{r["locationCode"]}</td><td>{r["onHand"]}</td><td>{r["reserved"]}</td>
                <td><strong>{r["available"]}</strong> {r["isLow"] && <Badge tone={r["available"] === 0 ? "danger" : "warn"}>{r["available"] === 0 ? "Zerado" : "Baixo"}</Badge>}</td>
                <td>{r["threshold"]}</td>
                <td className="adm-row-actions">
                  {can("stock.move") && <><button type="button" className="link-btn" onClick={() => open("entry", r)}>Entrada</button><button type="button" className="link-btn" onClick={() => open("exit", r)}>Saída</button><button type="button" className="link-btn" onClick={() => open("transfer", r)}>Transferir</button></>}
                  {can("stock.adjust") && <><button type="button" className="link-btn" onClick={() => open("adjustment", r)}>Ajustar</button><button type="button" className="link-btn" onClick={() => open("threshold", r)}>Limite</button></>}
                </td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={8} className="muted">Nada encontrado. Cadastre produtos com variações para controlar o estoque.</td></tr>}
          </tbody>
        </Table>
      ) : (
        <Table>
          <thead><tr><th>Quando</th><th>Tipo</th><th>Produto</th><th>Unidade</th><th>Qtd</th><th>Saldo após</th><th>Motivo</th><th>Quem</th></tr></thead>
          <tbody>
            {data?.items.map((m) => (
              <tr key={m["id"]}><td>{dt(m["createdAt"])}</td><td>{MOVE[m["type"]]}</td><td>{m["productName"]}<br /><span className="muted">{m["skuCode"]}</span></td><td>{m["locationCode"]}</td>
                <td>{m["quantityDelta"] > 0 ? `+${m["quantityDelta"]}` : m["quantityDelta"]}</td><td>{m["onHandAfter"]}</td><td>{m["reason"] ?? (m["referenceType"] ? `${m["referenceType"]}` : "")}</td><td>{m["actorName"] ?? ""}</td></tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={8} className="muted">Sem movimentos.</td></tr>}
          </tbody>
        </Table>
      )}
      {data && <Pager total={data.total} offset={offset} limit={40} onChange={setOffset} />}

      <Modal open={action !== null} title={action ? `${KIND[action.kind]} · ${action.row["skuCode"]} · ${action.row["locationCode"]}` : ""} onClose={() => setAction(null)}>
        {action && (
          <form className="adm-form" onSubmit={submit}>
            {action.kind === "transfer" && <label className="field">Para a unidade<select required value={dest} onChange={(e) => setDest(e.target.value)}><option value="">Selecione</option>{locOpts.filter(([id]) => id !== action.row["locationId"]).map(([id, code]) => <option key={id} value={id}>{code}</option>)}</select></label>}
            <label className="field">{action.kind === "adjustment" ? "Saldo contado (físico)" : action.kind === "threshold" ? "Limite de baixo estoque (vazio = padrão)" : "Quantidade"}
              <input required={action.kind !== "threshold"} type="number" min={action.kind === "adjustment" || action.kind === "threshold" ? 0 : 1} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
            {action.kind !== "threshold" && <label className="field">Motivo{action.kind === "adjustment" ? "" : " (opcional)"}<input required={action.kind === "adjustment"} minLength={action.kind === "adjustment" ? 3 : undefined} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
            <p className="muted">Físico atual: {action.row["onHand"]} · reservado: {action.row["reserved"]}</p>
            {msg && <p className="warn" role="alert">{msg}</p>}
            <button className="btn" type="submit">Confirmar</button>
          </form>
        )}
      </Modal>
    </Page>
  );
}
