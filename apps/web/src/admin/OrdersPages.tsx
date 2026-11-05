/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Link, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Badge, brl, call, dt, errText, METHOD_LABEL, Page, Pager, PAY_LABEL, STATUS_LABEL, statusTone, Table, useList, type Row } from "./kit";

function OrdersList({ pickups }: { pickups?: boolean }) {
  const [status, setStatus] = useState(pickups ? "ready_for_pickup" : "");
  const [fulfillment, setFulfillment] = useState(pickups ? "pickup" : "");
  const [refund, setRefund] = useState(false);
  const [sp] = useSearchParams(); // vem de "Clientes" (?q=e-mail)
  const [draft, setDraft] = useState(sp.get("q") ?? "");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ limit: "30", offset: String(offset) });
  if (status) qs.set("status", status);
  if (fulfillment) qs.set("fulfillment", fulfillment);
  if (refund) qs.set("requiresRefund", "true");
  if (q) qs.set("q", q);
  const { data, loading, error } = useList<{ total: number; items: Row[] }>(`/api/admin/orders?${qs}`);
  const reset = (fn: () => void) => { fn(); setOffset(0); };

  return (
    <Page title={pickups ? "Retiradas" : "Pedidos"}>
      <div className="adm-filters">
        <form onSubmit={(e) => { e.preventDefault(); reset(() => setQ(draft.trim())); }}><input placeholder="Nº, nome ou e-mail" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Buscar" /></form>
        <select value={status} onChange={(e) => reset(() => setStatus(e.target.value))} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {!pickups && (
          <select value={fulfillment} onChange={(e) => reset(() => setFulfillment(e.target.value))} aria-label="Entrega">
            <option value="">Entrega e retirada</option><option value="ship">Só entrega</option><option value="pickup">Só retirada</option>
          </select>
        )}
        <label className="check"><input type="checkbox" checked={refund} onChange={(e) => reset(() => setRefund(e.target.checked))} /> Reembolso pendente</label>
      </div>
      {error && <p className="warn" role="alert">{error}</p>}
      <div aria-busy={loading} className={loading ? "is-loading" : ""}>
        <Table>
          <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Tipo</th><th>Total</th><th>Pagamento</th><th>Status</th></tr></thead>
          <tbody>
            {data?.items.map((o) => (
              <tr key={o["id"]}>
                <td><Link to={`/admin/pedidos/${o["id"]}`}>{o["orderNumber"]}</Link></td>
                <td>{dt(o["createdAt"])}</td>
                <td>{o["customerName"]}<br /><span className="muted">{o["customerEmail"]}</span></td>
                <td>{o["fulfillment"] === "pickup" ? "Retirada" : "Entrega"} <span className="muted">({o["originCode"]})</span></td>
                <td>{brl(o["totalCents"])}</td>
                <td>{METHOD_LABEL[o["paymentMethod"]]} · <Badge tone={statusTone(o["paymentStatus"])}>{PAY_LABEL[o["paymentStatus"]]}</Badge>{o["requiresRefund"] && <> <Badge tone="danger">Reembolso</Badge></>}</td>
                <td><Badge tone={statusTone(o["status"])}>{STATUS_LABEL[o["status"]]}</Badge></td>
              </tr>
            ))}
            {data?.items.length === 0 && <tr><td colSpan={7} className="muted">Nenhum pedido encontrado.</td></tr>}
          </tbody>
        </Table>
      </div>
      {data && <Pager total={data.total} offset={offset} limit={30} onChange={setOffset} />}
    </Page>
  );
}

function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const can = (p: string) => user?.permissions.includes(p) ?? false;
  const { data: o, error, reload } = useList<Row>(`/api/admin/orders/${id}`);
  const [tracking, setTracking] = useState("");
  const [code, setCode] = useState("");
  const [received, setReceived] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try { await call("POST", `/api/admin/orders/${id}/actions`, body); setCode(""); setReason(""); reload(); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };

  if (error) return <Page title="Pedido"><p className="warn" role="alert">{error}</p></Page>;
  if (!o) return <Page title="Pedido"><p>Carregando…</p></Page>;
  const st = o["status"] as string;
  const pickup = o["fulfillment"] === "pickup";
  const addr = o["shippingAddress"] as Row | null;
  const cancellable = ["awaiting_payment", "confirmed", "processing", "ready_for_pickup"].includes(st);

  return (
    <Page title={`Pedido nº ${o["orderNumber"]}`} actions={<Link to="/admin/pedidos" className="btn btn--ghost">Voltar</Link>}>
      <p><Badge tone={statusTone(st)}>{STATUS_LABEL[st]}</Badge> {o["requiresRefund"] && <Badge tone="danger">Reembolso pendente</Badge>}</p>

      <div className="adm-grid">
        <section className="adm-card"><h2>Cliente</h2>
          <dl className="dl"><dt>Nome</dt><dd>{o["customerName"]}</dd><dt>E-mail</dt><dd>{o["customerEmail"]}</dd><dt>Telefone</dt><dd>{o["customerPhone"]}</dd><dt>CPF</dt><dd>{o["customerDocument"]}</dd></dl>
        </section>
        <section className="adm-card"><h2>{pickup ? "Retirada" : "Entrega"}</h2>
          {pickup ? <p>{o["pickupName"]}</p> : (
            <>
              <p>{addr?.["recipient"]}<br />{addr?.["street"]}, {addr?.["number"]} {addr?.["complement"]}<br />{addr?.["district"]} · {addr?.["city"]}/{addr?.["state"]} · CEP {addr?.["postalCode"]}</p>
              <p className="muted">{(o["shippingService"] as Row | null)?.["company"]} {(o["shippingService"] as Row | null)?.["name"]} · separado em {o["originName"]}</p>
              {o["trackingCode"] && <p>Rastreio: <strong>{o["trackingCode"]}</strong></p>}
            </>
          )}
          {o["notes"] && <p className="muted">Obs.: {o["notes"]}</p>}
        </section>
      </div>

      <section className="adm-card"><h2>Itens</h2>
        <Table>
          <thead><tr><th>Produto</th><th>SKU</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr></thead>
          <tbody>{(o["items"] as Row[]).map((i) => <tr key={i["id"]}><td>{i["productName"]} <span className="muted">({i["colorName"]}, {i["sizeLabel"]})</span></td><td>{i["skuCode"]}</td><td>{i["quantity"]}</td><td>{brl(i["unitPriceCents"])}</td><td>{brl(i["totalCents"])}</td></tr>)}</tbody>
        </Table>
        <dl className="dl"><dt>Subtotal</dt><dd>{brl(o["subtotalCents"])}</dd>
          {o["discountCents"] > 0 && <><dt>Desconto {o["couponCode"] ? `(${o["couponCode"]})` : ""}</dt><dd>− {brl(o["discountCents"])}</dd></>}
          <dt>Frete</dt><dd>{brl(o["shippingCents"] - o["shippingDiscountCents"])}</dd><dt><strong>Total</strong></dt><dd><strong>{brl(o["totalCents"])}</strong></dd></dl>
      </section>

      {can("orders.manage") && (
        <section className="adm-card"><h2>Ações</h2>
          {msg && <p className="warn" role="alert">{msg}</p>}
          {st === "confirmed" && <button className="btn" disabled={busy} onClick={() => act({ action: "process" })}>Iniciar separação</button>}
          {st === "processing" && !pickup && (
            <div className="adm-inline"><input placeholder="Código de rastreio (opcional)" value={tracking} onChange={(e) => setTracking(e.target.value)} style={{ width: "16rem" }} /><button className="btn" disabled={busy} onClick={() => act({ action: "ship", ...(tracking && { trackingCode: tracking }) })}>Marcar como enviado</button></div>
          )}
          {st === "processing" && pickup && <button className="btn" disabled={busy} onClick={() => act({ action: "ready" })}>Pronto para retirada</button>}
          {st === "shipped" && <button className="btn" disabled={busy} onClick={() => act({ action: "deliver" })}>Marcar como entregue</button>}
          {st === "ready_for_pickup" && (
            <div className="adm-form">
              <label className="field">Código de retirada (a cliente informa)<input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ width: "10rem" }} /></label>
              {o["paymentMethod"] === "pay_on_pickup" && o["paymentStatus"] !== "paid" && <label className="check"><input type="checkbox" checked={received} onChange={(e) => setReceived(e.target.checked)} /> Recebi o pagamento na loja ({brl(o["totalCents"])})</label>}
              <button className="btn" disabled={busy || code.length !== 6} onClick={() => act({ action: "deliver", pickupCode: code, ...(received && { paymentReceived: true }) })}>Entregar ao cliente</button>
            </div>
          )}
          {!["confirmed", "processing", "shipped", "ready_for_pickup"].includes(st) && <p className="muted">Sem ações disponíveis neste status.</p>}

          {can("orders.cancel") && o["requiresRefund"] && <button className="btn btn--ghost" disabled={busy} onClick={() => confirm("Confirma que o reembolso já foi feito no gateway/loja?") && act({ action: "refund_done" })}>Registrar reembolso realizado</button>}
          {can("orders.cancel") && cancellable && (
            <div className="adm-inline"><input placeholder="Motivo do cancelamento" value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "18rem" }} />
              <button className="btn btn--ghost" disabled={busy || reason.trim().length < 3} onClick={() => confirm("Cancelar este pedido? O estoque será devolvido.") && act({ action: "cancel", reason })}>Cancelar pedido</button></div>
          )}
        </section>
      )}

      <div className="adm-grid">
        <section className="adm-card"><h2>Pagamentos</h2>
          {(o["payments"] as Row[]).length === 0 ? <p className="muted">Nenhuma cobrança registrada.</p> : (
            <Table><thead><tr><th>Quando</th><th>Meio</th><th>Valor</th><th>Status</th></tr></thead>
              <tbody>{(o["payments"] as Row[]).map((p) => <tr key={p["id"]}><td>{dt(p["createdAt"])}</td><td>{p["gateway"]} · {METHOD_LABEL[p["method"]]}</td><td>{brl(p["amountCents"])}</td><td><Badge tone={statusTone(p["status"])}>{PAY_LABEL[p["status"]]}</Badge></td></tr>)}</tbody></Table>
          )}
        </section>
        <section className="adm-card"><h2>Histórico</h2>
          <ol className="timeline">{(o["events"] as Row[]).map((e) => <li key={e["id"]}><strong>{STATUS_LABEL[e["status"]] ?? e["status"]}</strong> <span className="muted">{dt(e["createdAt"])}{e["actorName"] ? ` · ${e["actorName"]}` : ""}</span>{e["note"] && <><br /><span className="muted">{e["note"]}</span></>}</li>)}</ol>
        </section>
      </div>
    </Page>
  );
}

export default function OrdersPages({ pickups }: { pickups?: boolean }) {
  return (
    <Routes>
      <Route index element={<OrdersList key={pickups ? "p" : "o"} {...(pickups && { pickups: true })} />} />
      <Route path=":id" element={<OrderDetail />} />
    </Routes>
  );
}
