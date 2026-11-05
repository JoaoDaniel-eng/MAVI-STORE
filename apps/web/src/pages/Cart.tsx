import { MAX_LINE_QTY } from "@mavi/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useCart } from "../hooks/useCart";
import { useQuote } from "../hooks/useQuote";
import { useSeo } from "../hooks/useSeo";
import { formatPrice } from "../lib/format";

export function Cart() {
  useSeo({ title: "Sacola" });
  const cart = useCart();
  const { data, error, loading } = useQuote(cart.items, cart.coupon);
  const [code, setCode] = useState(cart.coupon);

  if (cart.items.length === 0) {
    return <div className="container state"><h1>Sua sacola está vazia</h1><Link to="/catalogo" className="btn btn--ghost">Ver o catálogo</Link></div>;
  }
  const discount = data?.coupon?.discountCents ?? 0;
  const total = (data?.subtotalCents ?? 0) - discount;

  return (
    <div className="container">
      <header className="page-head"><h1>Sacola</h1></header>
      {error && <p className="state">{error}</p>}
      <div className="cart">
        <ul className="lines" aria-busy={loading}>
          {(data?.lines ?? []).map((l) => (
            <li key={l.skuId} className="line">
              <div className="line__img">{l.imageUrl ? <img src={l.imageUrl} alt="" /> : <span aria-hidden="true">MAVI</span>}</div>
              <div className="line__info">
                <p className="line__name">{l.slug ? <Link to={`/produto/${l.slug}`}>{l.productName}</Link> : l.productName}</p>
                {l.colorName && <p className="muted">{l.colorName} · {l.sizeLabel}</p>}
                {l.problem === "unavailable" && <p className="warn" role="alert">Este item não está mais disponível.</p>}
                {l.problem === "insufficient_stock" && <p className="warn" role="alert">{l.available > 0 ? `Só há ${l.available} em estoque.` : "Esgotado."}</p>}
                <div className="qty">
                  <button type="button" aria-label="Diminuir" onClick={() => cart.setQty(l.skuId, l.quantity - 1)}>−</button>
                  <span aria-live="polite">{l.quantity}</span>
                  <button type="button" aria-label="Aumentar" disabled={l.quantity >= MAX_LINE_QTY || (!l.problem && l.quantity >= l.available)} onClick={() => cart.setQty(l.skuId, l.quantity + 1)}>+</button>
                  <button type="button" className="link-btn" onClick={() => cart.remove(l.skuId)}>Remover</button>
                </div>
              </div>
              <p className="line__price">{formatPrice(l.lineTotalCents)}</p>
            </li>
          ))}
        </ul>

        <aside className="summary" aria-label="Resumo">
          <h2>Resumo</h2>
          <form className="coupon" onSubmit={(e) => { e.preventDefault(); cart.setCoupon(code.trim().toUpperCase()); }}>
            <label className="sr-only" htmlFor="coupon">Cupom</label>
            <input id="coupon" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Cupom de desconto" maxLength={40} />
            <button type="submit" className="btn btn--ghost">Aplicar</button>
          </form>
          {data?.couponError && <p className="warn" role="alert">{data.couponError}</p>}
          {data?.coupon && <p className="ok">Cupom {data.coupon.code} aplicado{data.coupon.freeShipping ? ": frete grátis, valor abatido no checkout" : ""}.</p>}
          <dl className="totals">
            <div><dt>Subtotal</dt><dd>{formatPrice(data?.subtotalCents ?? 0)}</dd></div>
            {discount > 0 && <div><dt>Desconto</dt><dd>− {formatPrice(discount)}</dd></div>}
            <div><dt>Frete</dt><dd>calculado no checkout</dd></div>
            <div className="totals__total"><dt>Total parcial</dt><dd>{formatPrice(total)}</dd></div>
          </dl>
          {data?.hasProblems
            ? <p className="muted">Resolva os itens indicados para continuar.</p>
            : <Link to="/checkout" className="btn">Finalizar compra</Link>}
        </aside>
      </div>
    </div>
  );
}
