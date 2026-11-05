/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Stars } from "../components/Reviews";
import { Badge, call, dt, errText, Page, Pager, statusTone, Table, useList, type Row } from "./kit";

const LABEL: Record<string, string> = { pending: "Pendente", approved: "Aprovada", rejected: "Rejeitada" };

export default function ReviewsPage() {
  const [status, setStatus] = useState("pending");
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ limit: "30", offset: String(offset) });
  if (status) qs.set("status", status);
  const { data, error, reload } = useList<{ total: number; items: Row[] }>(`/api/admin/reviews?${qs}`);
  const [msg, setMsg] = useState<string | null>(null);
  const moderate = async (id: string, s: "approved" | "rejected") => {
    const note = s === "rejected" ? prompt("Motivo da rejeição (opcional, uso interno):") ?? undefined : undefined;
    try { await call("PATCH", `/api/admin/reviews/${id}`, { status: s, ...(note && { note }) }); setMsg(null); reload(); } catch (e) { setMsg(errText(e)); }
  };
  return (
    <Page title="Avaliações">
      <div className="adm-filters">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status"><option value="">Todas</option>{Object.entries(LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </div>
      {(error || msg) && <p className="warn" role="alert">{error ?? msg}</p>}
      <Table>
        <thead><tr><th>Produto</th><th>Avaliação</th><th>Autora</th><th>Status</th><th /></tr></thead>
        <tbody>
          {data?.items.map((r) => (
            <tr key={r["id"]}>
              <td>{r["productName"]}<br /><span className="muted">{dt(r["createdAt"])}</span></td>
              <td><Stars value={r["rating"]} />{r["title"] && <strong> {r["title"]}</strong>}<br />{r["body"]}{r["moderationNote"] && <><br /><span className="muted">Nota: {r["moderationNote"]}</span></>}</td>
              <td>{r["authorName"]}</td>
              <td><Badge tone={statusTone(r["status"])}>{LABEL[r["status"]]}</Badge></td>
              <td className="adm-row-actions">
                {r["status"] !== "approved" && <button type="button" className="link-btn" onClick={() => void moderate(r["id"], "approved")}>Aprovar</button>}
                {r["status"] !== "rejected" && <button type="button" className="link-btn" onClick={() => void moderate(r["id"], "rejected")}>Rejeitar</button>}
              </td>
            </tr>
          ))}
          {data?.items.length === 0 && <tr><td colSpan={5} className="muted">Nenhuma avaliação.</td></tr>}
        </tbody>
      </Table>
      {data && <Pager total={data.total} offset={offset} limit={30} onChange={setOffset} />}
    </Page>
  );
}
