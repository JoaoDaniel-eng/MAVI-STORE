import { PAYMENT_LABELS, type OrderView, type PaymentView } from "@mavi/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useSeo } from "../hooks/useSeo";
import { api, post } from "../lib/api";
import { formatPrice } from "../lib/format";

const STATUS: Record<string, string> = {
  awaiting_payment: "Aguardando pagamento", confirmed: "Pedido confirmado", processing: "Em separação",
  ready_for_pickup: "Pronto para retirada", shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
};

export function OrderDone() {
  useSeo({ title: "Pedido" });
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("t") ?? "";
  const inAccount = useLocation().pathname.startsWith("/conta"); // dentro da conta vale a sessão; fora, o token do link
  const headers: Record<string, string> = inAccount ? {} : { "x-order-token": token };
  const orderUrl = inAccount ? `/api/account/orders/${id}` : `/api/store/orders/${id}`;

  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState<PaymentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const status = useRef<string>("");

  // Carrega o pedido e, enquanto aguarda pagamento, confere a cada 6 s (a confirmação vem do servidor).
  useEffect(() => {
    let stop = false;
    const load = () => api<OrderView>(orderUrl, { headers }).then(
      (o) => { if (!stop) { status.current = o.status; setOrder(o); } },
      (e: Error) => { if (!stop) setError(e.message); },
    );
    void load();
    const iv = setInterval(() => { if (status.current === "awaiting_payment") void load(); }, 6000);
    return () => { stop = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  const online = order && order.status === "awaiting_payment" && (order.paymentMethod === "pix" || order.paymentMethod === "card");
  useEffect(() => {
    if (!online) return;
    api<PaymentView | null>(`/api/store/orders/${id}/payment`, { headers }).then(setPay, () => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, id]);

  const startPayment = async () => {
    setBusy(true); setPayErr(null);
    try {
      const v = await post<PaymentView>(`/api/store/orders/${id}/payment`, {}, headers);
      setPay(v);
      if (v.redirectUrl) window.location.assign(v.redirectUrl); // cartão: página segura do gateway
    } catch (e) {
      setPayErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setPayErr("Não foi possível copiar. Selecione o código e copie manualmente."); }
  };

  if (error) return <div className="container state"><p>{error}</p><Link to="/" className="btn btn--ghost">Voltar à loja</Link></div>;
  if (!order) return <p className="container state">Carregando…</p>;

  return (
    <div className="container order">
      <header className="page-head"><h1>Pedido nº {order.number}</h1><p>{STATUS[order.status] ?? order.status}</p></header>

      {order.paymentStatus === "paid" && order.status !== "cancelled" && <p className="ok" role="status">Pagamento confirmado. Obrigada pela compra!</p>}
      {order.paymentStatus === "paid" && order.status === "cancelled" && <p className="warn" role="alert">Recebemos o pagamento, mas o estoque acabou antes da confirmação. Entraremos em contato para o reembolso.</p>}
      {order.paymentMethod === "pay_on_pickup" && order.status === "confirmed" && order.paymentStatus === "pending" && (
        <p className="ok" role="status">Pedido confirmado. O pagamento será feito na retirada, em {order.pickupLocation}.</p>
      )}

      {online && (
        <section className="step" aria-label="Pagamento">
          <h2>Pagamento por {PAYMENT_LABELS[order.paymentMethod]}</h2>
          <p className="muted">Os itens ficam reservados até {new Date(order.expiresAt).toLocaleString("pt-BR")}.</p>
          {payErr && <p className="warn" role="alert">{payErr}</p>}

          {order.paymentMethod === "pix" && !pay?.pix && <button type="button" className="btn" disabled={busy} onClick={startPayment}>{busy ? "Gerando…" : "Gerar código Pix"}</button>}
          {pay?.pix && (
            <>
              {pay.pix.qrImageBase64 && <img className="qr" alt="QR Code Pix" src={`data:image/png;base64,${pay.pix.qrImageBase64}`} />}
              <label className="field">Pix copia e cola<textarea readOnly rows={3} value={pay.pix.copyPaste} onFocus={(e) => e.currentTarget.select()} /></label>
              <button type="button" className="btn" onClick={() => copy(pay.pix!.copyPaste)}>{copied ? "Copiado!" : "Copiar código"}</button>
              <p className="muted" role="status">Assim que o pagamento for confirmado, esta página atualiza sozinha.</p>
            </>
          )}

          {order.paymentMethod === "card" && (
            <>
              <button type="button" className="btn" disabled={busy} onClick={startPayment}>{busy ? "Abrindo…" : "Pagar com cartão"}</button>
              <p className="muted">Você será levada a uma página segura do provedor de pagamento. Nós não recebemos os dados do seu cartão.</p>
            </>
          )}
        </section>
      )}

      <ul className="mini">
        {order.items.map((i) => <li key={i.skuCode}><span>{i.quantity} × {i.productName} ({i.colorName}, {i.sizeLabel})</span><span>{formatPrice(i.totalCents)}</span></li>)}
      </ul>
      <dl className="totals">
        <div><dt>Subtotal</dt><dd>{formatPrice(order.subtotalCents)}</dd></div>
        {order.discountCents > 0 && <div><dt>Desconto {order.couponCode ? `(${order.couponCode})` : ""}</dt><dd>− {formatPrice(order.discountCents)}</dd></div>}
        <div><dt>Entrega</dt><dd>{formatPrice(order.shippingCents - order.shippingDiscountCents)}</dd></div>
        <div className="totals__total"><dt>Total</dt><dd>{formatPrice(order.totalCents)}</dd></div>
      </dl>
      <p>
        {order.fulfillment === "pickup" ? <>Retirada: <strong>{order.pickupLocation}</strong></> : <>Entrega: {order.shippingService?.company} {order.shippingService?.name}, prazo de {order.shippingService?.deliveryDays} dia(s) útil(eis) após a postagem.</>}
      </p>
      {order.pickupCode && <p className="ok" role="status">Pronto para retirada! Código: <strong className="code">{order.pickupCode}</strong></p>}
      {order.trackingCode && <p>Código de rastreio: <strong>{order.trackingCode}</strong></p>}
      {order.timeline.length > 0 && (
        <ol className="timeline" aria-label="Andamento do pedido">
          {order.timeline.map((e, i) => <li key={i}><strong>{STATUS[e.status] ?? e.status}</strong> <span className="muted">{new Date(e.createdAt).toLocaleString("pt-BR")}</span>{e.note && <><br /><span className="muted">{e.note}</span></>}</li>)}
        </ol>
      )}
      {!inAccount && <p className="muted">Guarde o endereço desta página para acompanhar o pedido, ou <Link to="/entrar?next=/conta">entre na sua conta</Link>.</p>}
    </div>
  );
}
