/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { downloadFile } from "../lib/api";
import { Badge, brl, call, dt, errText, Page, Pager, Table, useList, type Row } from "./kit";

export default function CustomersPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes("users.manage_customers") ?? false;
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ limit: "40", offset: String(offset) });
  if (q) qs.set("q", q);
  const { data, error, reload } = useList<{ total: number; items: Row[] }>(`/api/admin/customers?${qs}`);
  const [msg, setMsg] = useState<string | null>(null);
  const canPrivacy = user?.permissions.includes("privacy.manage") ?? false;
  const [pEmail, setPEmail] = useState("");
  const toggle = async (c: Row) => {
    if (!confirm(c["isActive"] ? "Desativar esta conta? A cliente não conseguirá entrar." : "Reativar esta conta?")) return;
    try { await call("PATCH", `/api/admin/users/${c["userId"]}`, { isActive: !c["isActive"] }); setMsg(null); reload(); } catch (e) { setMsg(errText(e)); }
  };

  return (
    <Page title="Clientes">
      <p className="muted">Reúne contas cadastradas e compradores que fizeram pedido como visitante (pelo e-mail). Dados pessoais: use só para atender a cliente.</p>
      <div className="adm-filters"><form onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); setOffset(0); }}><input placeholder="Nome ou e-mail" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Buscar" /></form></div>
      {(error || msg) && <p className="warn" role="alert">{error ?? msg}</p>}
      <Table>
        <thead><tr><th>Cliente</th><th>Contato</th><th>Pedidos</th><th>Total</th><th>Último pedido</th><th>Conta</th><th /></tr></thead>
        <tbody>
          {data?.items.map((c) => (
            <tr key={c["email"]}>
              <td>{c["name"]}<br /><span className="muted">{c["email"]}</span></td>
              <td>{c["phone"] ?? ""}</td><td>{c["orders"]}</td><td>{brl(c["totalCents"])}</td><td>{dt(c["lastOrderAt"])}</td>
              <td>{c["hasAccount"] ? <><Badge tone={c["isActive"] ? "ok" : "danger"}>{c["isActive"] ? "Ativa" : "Desativada"}</Badge>{c["emailVerified"] === false && <> <Badge tone="warn">E-mail não confirmado</Badge></>}</> : <span className="muted">Só visitante</span>}</td>
              <td className="adm-row-actions">
                <Link to={`/admin/pedidos?q=${encodeURIComponent(c["email"])}`}>Ver pedidos</Link>
                {canManage && c["hasAccount"] && <button type="button" className="link-btn" onClick={() => void toggle(c)}>{c["isActive"] ? "Desativar" : "Reativar"}</button>}
              </td>
            </tr>
          ))}
          {data?.items.length === 0 && <tr><td colSpan={7} className="muted">Nenhuma cliente encontrada.</td></tr>}
        </tbody>
      </Table>
      {data && <Pager total={data.total} offset={offset} limit={40} onChange={setOffset} />}

      {canPrivacy && (
        <section className="adm-card" aria-label="Pedidos de titulares (LGPD)">
          <h2>Pedido de titular (LGPD)</h2>
          <p className="muted">Quando uma cliente pedir cópia ou exclusão dos dados: a exportação junta conta, pedidos, favoritos e avaliações. A exclusão anonimiza a conta; os pedidos ficam pelo prazo legal e são anonimizados depois (rotina diária). Cada ação é auditada.</p>
          <div className="adm-inline">
            <input type="email" placeholder="E-mail da cliente" value={pEmail} onChange={(e) => setPEmail(e.target.value)} style={{ width: "18rem" }} aria-label="E-mail da cliente" />
            <button type="button" className="btn btn--ghost" disabled={!pEmail} onClick={() => downloadFile("/api/admin/privacy/export", "dados-pessoais.json", { email: pEmail }).catch((e: Error) => setMsg(e.message))}>Exportar dados (JSON)</button>
            <button type="button" className="btn btn--ghost" disabled={!pEmail} onClick={async () => { if (!confirm("Anonimizar esta conta? Não há como desfazer.")) return; try { await call("POST", "/api/admin/privacy/anonymize", { email: pEmail }); setMsg("Conta anonimizada."); setPEmail(""); reload(); } catch (e) { setMsg(errText(e)); } }}>Anonimizar conta</button>
          </div>
        </section>
      )}
    </Page>
  );
}
