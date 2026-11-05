import { PAYMENT_LABELS, type OrderSummary, type PaymentMethod, type PickupOption, type ShippingQuote } from "@mavi/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useLegal } from "../hooks/useLegal";
import { useCart } from "../hooks/useCart";
import { useQuote } from "../hooks/useQuote";
import { useSeo } from "../hooks/useSeo";
import { ApiError, post } from "../lib/api";
import { formatPrice } from "../lib/format";

const digits = (s: string) => s.replace(/\D/g, "");
const empty = { recipient: "", postalCode: "", street: "", number: "", complement: "", district: "", city: "", state: "" };

export function Checkout() {
  useSeo({ title: "Finalizar compra" });
  const nav = useNavigate();
  const cart = useCart();
  const quote = useQuote(cart.items, cart.coupon);
  const options = useApi<{ paymentMethods: PaymentMethod[] }>("/api/store/checkout/options");

  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", document: "" });
  const [mode, setMode] = useState<"ship" | "pickup">("ship");
  const [addr, setAddr] = useState(empty);
  const [ship, setShip] = useState<ShippingQuote | null>(null);
  const [shipBusy, setShipBusy] = useState(false);
  const [pickupList, setPickupList] = useState<PickupOption[]>([]);
  const [shipErr, setShipErr] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [terms, setTerms] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idemKey = useRef(crypto.randomUUID());
  const { user } = useAuth();
  const legal = useLegal();
  useEffect(() => { if (user) setCustomer((c) => ({ ...c, name: c.name || user.name, email: c.email || user.email })); }, [user]);

  if (cart.items.length === 0) return <div className="container state"><h1>Sua sacola está vazia</h1><Link to="/catalogo" className="btn btn--ghost">Ver o catálogo</Link></div>;

  const methods = (options.data?.paymentMethods ?? []).filter((m) => m !== "pay_on_pickup" || mode === "pickup");
  const chosen = ship?.shipping.options.find((o) => o.serviceId === serviceId);
  const pickup = pickupList.find((p) => p.code === pickupCode);
  const shippingCents = mode === "ship" ? chosen?.priceCents ?? 0 : pickup?.feeCents ?? 0;
  const q = quote.data;
  const discount = q?.coupon?.discountCents ?? 0;
  const shipDiscount = q?.coupon?.freeShipping ? shippingCents : 0;
  const total = (q?.subtotalCents ?? 0) - discount + shippingCents - shipDiscount;
  const delivery = mode === "ship" ? !!chosen : !!pickup?.available;

  const calcShipping = async () => {
    const cep = digits(addr.postalCode);
    if (cep.length !== 8) return setShipErr("Informe um CEP com 8 dígitos.");
    setShipBusy(true); setShipErr(null); setServiceId(null);
    try {
      setShip(await post<ShippingQuote>("/api/store/shipping/quote", { items: cart.items, postalCode: cep }));
    } catch (e) {
      setShipErr((e as Error).message);
    } finally {
      setShipBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!method || !delivery) return;
    setBusy(true); setError(null);
    try {
      const fulfillment = mode === "ship"
        ? { type: "ship", serviceId, address: { ...addr, postalCode: digits(addr.postalCode), complement: addr.complement || undefined } }
        : { type: "pickup", locationCode: pickupCode };
      const order = await post<OrderSummary>("/api/store/checkout/orders", {
        items: cart.items, ...(cart.coupon && { couponCode: cart.coupon }), customer, fulfillment,
        paymentMethod: method, acceptTerms: terms, ...(notes && { notes }),
      }, { "Idempotency-Key": idemKey.current });
      cart.clear();
      nav(`/pedido/${order.id}?t=${encodeURIComponent(order.accessToken)}`);
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) idemKey.current = crypto.randomUUID(); // novo envio = nova chave
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, key: keyof typeof customer, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">{label}
      <input required value={customer[key]} onChange={(e) => setCustomer({ ...customer, [key]: e.target.value })} {...props} />
    </label>
  );
  const af = (label: string, key: keyof typeof empty, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">{label}
      <input value={addr[key]} onChange={(e) => setAddr({ ...addr, [key]: e.target.value })} {...props} />
    </label>
  );

  return (
    <div className="container">
      <header className="page-head"><h1>Finalizar compra</h1></header>
      <form className="cart" onSubmit={submit}>
        <div className="steps">
          <fieldset className="step">
            <legend>1. Seus dados</legend>
            {field("Nome completo", "name", { autoComplete: "name" })}
            {field("E-mail", "email", { type: "email", autoComplete: "email" })}
            {field("Telefone com DDD", "phone", { inputMode: "tel", autoComplete: "tel" })}
            {field("CPF", "document", { inputMode: "numeric", maxLength: 14 })}
          </fieldset>

          <fieldset className="step">
            <legend>2. Entrega</legend>
            <div className="chips">
              <button type="button" className={`chip ${mode === "ship" ? "is-on" : ""}`} aria-pressed={mode === "ship"} onClick={() => { setMode("ship"); setMethod(null); }}>Receber em casa</button>
              <button type="button" className={`chip ${mode === "pickup" ? "is-on" : ""}`} aria-pressed={mode === "pickup"} onClick={() => { setMode("pickup"); setMethod(null); void post<PickupOption[]>("/api/store/pickup/options", { items: cart.items }).then(setPickupList, (e: Error) => setShipErr(e.message)); }}>Retirar na loja</button>
            </div>

            {mode === "ship" && (
              <>
                <div className="cep">
                  {af("CEP", "postalCode", { inputMode: "numeric", maxLength: 9, required: true, autoComplete: "postal-code" })}
                  <button type="button" className="btn btn--ghost" disabled={shipBusy} onClick={calcShipping}>{shipBusy ? "Calculando…" : "Calcular frete"}</button>
                </div>
                {shipErr && <p className="warn" role="alert">{shipErr}</p>}
                {ship && !ship.shipping.available && <p className="warn" role="status">{ship.shipping.message ?? "Cotação indisponível."} Você pode retirar na loja.</p>}
                {ship?.shipping.available && (
                  <div className="radios" role="radiogroup" aria-label="Opções de entrega">
                    {ship.shipping.options.map((o) => (
                      <label key={o.serviceId} className="radio">
                        <input type="radio" name="svc" checked={serviceId === o.serviceId} onChange={() => setServiceId(o.serviceId)} />
                        <span>{o.company} {o.name}<br /><span className="muted">{o.deliveryDays} {o.deliveryDays === 1 ? "dia útil" : "dias úteis"}</span></span>
                        <strong>{formatPrice(o.priceCents)}</strong>
                      </label>
                    ))}
                  </div>
                )}
                {af("Destinatário", "recipient", { required: true, autoComplete: "name" })}
                {af("Rua", "street", { required: true, autoComplete: "address-line1" })}
                <div className="two">{af("Número", "number", { required: true })}{af("Complemento", "complement")}</div>
                {af("Bairro", "district", { required: true })}
                <div className="two">{af("Cidade", "city", { required: true, autoComplete: "address-level2" })}{af("UF", "state", { required: true, maxLength: 2 })}</div>
              </>
            )}

            {mode === "pickup" && (
              <div className="radios" role="radiogroup" aria-label="Unidade de retirada">
                {pickupList.map((p) => (
                  <label key={p.code} className={`radio ${p.available ? "" : "is-off"}`}>
                    <input type="radio" name="pickup" disabled={!p.available} checked={pickupCode === p.code} onChange={() => setPickupCode(p.code)} />
                    <span>{p.shoppingName}<br /><span className="muted">{p.available ? "Todos os itens disponíveis" : "Sem todos os itens nesta unidade"}</span></span>
                    <strong>{p.feeCents === 0 ? "Grátis" : formatPrice(p.feeCents)}</strong>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="step">
            <legend>3. Pagamento</legend>
            {options.data && methods.length === 0 && <p className="warn" role="status">Pagamento online pendente de configuração. Ainda não é possível concluir a compra.</p>}
            <div className="radios" role="radiogroup" aria-label="Forma de pagamento">
              {methods.map((m) => (
                <label key={m} className="radio"><input type="radio" name="pay" checked={method === m} onChange={() => setMethod(m)} /><span>{PAYMENT_LABELS[m]}</span></label>
              ))}
            </div>
            <label className="field">Observações (opcional)<textarea rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required /> Li e aceito {legal.terms ? <Link to={legal.terms} target="_blank">os termos de compra</Link> : "os termos de compra"} e {legal.privacy ? <Link to={legal.privacy} target="_blank">a política de privacidade</Link> : "a política de privacidade"}.</label>
          </fieldset>
        </div>

        <aside className="summary" aria-label="Resumo do pedido">
          <h2>Resumo</h2>
          <ul className="mini">
            {(q?.lines ?? []).map((l) => <li key={l.skuId}><span>{l.quantity} × {l.productName}{l.sizeLabel ? ` (${l.colorName}, ${l.sizeLabel})` : ""}</span><span>{formatPrice(l.lineTotalCents)}</span></li>)}
          </ul>
          <dl className="totals">
            <div><dt>Subtotal</dt><dd>{formatPrice(q?.subtotalCents ?? 0)}</dd></div>
            {discount > 0 && <div><dt>Desconto</dt><dd>− {formatPrice(discount)}</dd></div>}
            <div><dt>Entrega</dt><dd>{delivery ? (shippingCents - shipDiscount === 0 ? "Grátis" : formatPrice(shippingCents - shipDiscount)) : "a definir"}</dd></div>
            <div className="totals__total"><dt>Total</dt><dd>{formatPrice(total)}</dd></div>
          </dl>
          {q?.hasProblems && <p className="warn" role="alert">Há itens indisponíveis. <Link to="/carrinho">Revisar sacola</Link></p>}
          {error && <p className="warn" role="alert">{error}</p>}
          <button type="submit" className="btn" disabled={busy || !method || !delivery || !terms || !!q?.hasProblems}>{busy ? "Enviando…" : "Concluir pedido"}</button>
          <p className="muted">O valor final é confirmado pelo servidor ao concluir.</p>
        </aside>
      </form>
    </div>
  );
}
