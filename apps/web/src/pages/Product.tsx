import type { ProductDetail, StoreLocation } from "@mavi/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FavoriteButton } from "../components/FavoriteButton";
import { ProductGrid } from "../components/ProductCard";
import { Reviews, Stars } from "../components/Reviews";
import { SizeGuide } from "../components/SizeGuide";
import { useApi } from "../hooks/useApi";
import { useSeo } from "../hooks/useSeo";
import { useCart } from "../hooks/useCart";
import { formatPrice, waLink } from "../lib/format";

export function Product() {
  const { slug } = useParams();
  const { data: p, error, loading, status } = useApi<ProductDetail>(`/api/store/products/${slug ?? ""}`);
  const locs = useApi<StoreLocation[]>("/api/store/locations");
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [added, setAdded] = useState(false);
  const cart = useCart();
  useEffect(() => { setColor(null); setSize(null); setIdx(0); setAdded(false); }, [slug]);

  const activeColor = p ? color ?? (p.colors.find((c) => p.skus.some((s) => s.colorCode === c.code && s.inStock)) ?? p.colors[0])?.code ?? null : null;
  const sku = p?.skus.find((s) => s.colorCode === activeColor && s.sizeLabel === size);
  const price = sku?.priceCents ?? p?.basePriceCents ?? 0;
  const promo = p?.compareAtPriceCents && p.compareAtPriceCents > price && (!sku || sku.priceCents === p.basePriceCents);

  const forColor = p?.images.filter((i) => i.colorCode === activeColor) ?? [];
  const gallery = p ? (forColor.length ? [...forColor, ...p.images.filter((i) => !i.colorCode)] : p.images) : [];
  const current = gallery[Math.min(idx, Math.max(0, gallery.length - 1))];

  const anyStock = p?.skus.some((s) => s.inStock) ?? false;
  useSeo({
    title: p?.seoTitle ?? p?.name,
    description: p?.seoDescription ?? p?.description?.slice(0, 160) ?? undefined,
    image: p?.images[0]?.url,
    type: "product",
    jsonLd: p && {
      "@context": "https://schema.org", "@type": "Product", name: p.name, sku: p.code,
      description: p.description ?? undefined, image: p.images.map((i) => i.url),
      ...(p.rating && { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating.average, reviewCount: p.rating.count } }),
      offers: {
        "@type": "Offer", priceCurrency: "BRL", price: (p.basePriceCents / 100).toFixed(2),
        availability: anyStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        url: window.location.href,
      },
    },
  });

  if (status === 404) return <div className="container state"><p>Produto não encontrado.</p><Link to="/catalogo" className="btn btn--ghost">Ver o catálogo</Link></div>;
  if (error) return <p className="container state">{error}</p>;
  if (!p) return <p className="container state">{loading ? "Carregando…" : ""}</p>;

  const locName = new Map((locs.data ?? []).map((l) => [l.code, l]));
  const pickup = sku?.pickupLocations ?? [];
  const wa = pickup.map((c) => locName.get(c)).find((l) => l?.whatsapp);

  return (
    <article className="container pdp">
      <nav className="crumbs" aria-label="Você está em">
        <Link to="/">Início</Link> / <Link to={`/categoria/${p.categorySlug}`}>{p.categoryName}</Link>
      </nav>

      <div className="pdp__grid">
        <div className="gallery">
          <div className="gallery__main">
            {current ? <img src={current.url} alt={current.alt || p.name} /> : <span className="card__empty" aria-hidden="true">MAVI</span>}
          </div>
          {gallery.length > 1 && (
            <ul className="thumbs">
              {gallery.map((g, i) => (
                <li key={g.id}>
                  <button type="button" className={i === idx ? "is-on" : ""} aria-label={`Ver foto ${i + 1}`} aria-current={i === idx} onClick={() => setIdx(i)}>
                    <img src={g.url} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pdp__info">
          <div className="pdp__top">
            <h1>{p.name}</h1>
            <FavoriteButton productId={p.id} name={p.name} />
          </div>
          {p.rating && <p className="reviews__sum"><Stars value={p.rating.average} /> {p.rating.average.toLocaleString("pt-BR")} ({p.rating.count})</p>}
          <p className="pdp__price">{formatPrice(price)}{promo && <s>{formatPrice(p.compareAtPriceCents!)}</s>}</p>

          <fieldset className="opt">
            <legend>Cor: <strong>{p.colors.find((c) => c.code === activeColor)?.name}</strong></legend>
            <div className="swatches">
              {p.colors.map((c) => (
                <button key={c.code} type="button" className={`swatch ${c.code === activeColor ? "is-on" : ""}`} style={{ background: c.hex }}
                  aria-label={c.name} aria-pressed={c.code === activeColor} onClick={() => { setColor(c.code); setIdx(0); }} />
              ))}
            </div>
          </fieldset>

          <fieldset className="opt">
            <legend>Tamanho {p.sizeGuide && <SizeGuide guide={p.sizeGuide} />}</legend>
            <div className="chips">
              {p.sizes.map((label) => {
                const s = p.skus.find((x) => x.colorCode === activeColor && x.sizeLabel === label);
                const out = !s || !s.inStock;
                return (
                  <button key={label} type="button" className={`chip ${size === label ? "is-on" : ""} ${out ? "is-out" : ""}`}
                    disabled={out} aria-pressed={size === label} title={out ? "Indisponível" : undefined} onClick={() => setSize(label)}>
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <p className="avail" role="status">
            {!sku ? "Escolha um tamanho para ver a disponibilidade."
              : !sku.inStock ? "Esgotado."
              : sku.lowStock ? "Últimas unidades."
              : "Em estoque."}
            {sku?.inStock && pickup.length > 0 && <><br />Retirada em: {pickup.map((c) => locName.get(c)?.name ?? c).join(", ")}.</>}
          </p>

          <button type="button" className="btn" disabled={!sku || !sku.inStock}
            onClick={() => { if (sku) { cart.add(sku.id, 1); setAdded(true); } }}>
            {!sku ? "Escolha um tamanho" : sku.inStock ? "Adicionar à sacola" : "Indisponível"}
          </button>
          {added && <p role="status" className="ok">Adicionado à sacola. <Link to="/carrinho">Ver sacola</Link></p>}
          {sku && wa?.whatsapp && (
            <a className="btn btn--ghost" rel="noopener noreferrer" target="_blank"
              href={waLink(wa.whatsapp, `Olá! Tenho interesse em ${p.name} (${sku.skuCode}).`)}>
              Consultar no WhatsApp ({wa.shoppingName})
            </a>
          )}

          <div className="prose">
            {p.description && <p>{p.description}</p>}
            {p.composition && <p><strong>Composição:</strong> {p.composition}</p>}
            {p.careInstructions && <p><strong>Cuidados:</strong> {p.careInstructions}</p>}
          </div>
        </div>
      </div>

      <Reviews slug={p.slug} />

      {p.related.length > 0 && (
        <section className="block">
          <h2 className="block__title">Você também pode gostar</h2>
          <ProductGrid items={p.related} />
        </section>
      )}
    </article>
  );
}
