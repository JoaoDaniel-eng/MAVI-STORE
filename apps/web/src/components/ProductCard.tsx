import type { ProductCard as Card } from "@mavi/shared";
import { Link } from "react-router-dom";
import { formatPrice } from "../lib/format";
import { FavoriteButton } from "./FavoriteButton";

export function ProductCard({ p }: { p: Card }) {
  const promo = p.compareAtPriceCents && p.compareAtPriceCents > p.basePriceCents;
  return (
    <article className="card">
      <Link to={`/produto/${p.slug}`} className="card__media" aria-label={p.name}>
        {p.coverUrl ? (
          <>
            <img src={p.coverUrl} alt="" loading="lazy" className="card__img" />
            {p.hoverUrl && <img src={p.hoverUrl} alt="" loading="lazy" className="card__img card__img--hover" />}
          </>
        ) : (
          <span className="card__empty" aria-hidden="true">MAVI</span>
        )}
        {!p.inStock && <span className="card__tag">Esgotado</span>}
      </Link>
      <FavoriteButton productId={p.id} name={p.name} className="card__fav" />
      <div className="card__body">
        <h3 className="card__name"><Link to={`/produto/${p.slug}`}>{p.name}</Link></h3>
        <p className="card__price">
          {formatPrice(p.basePriceCents)}
          {promo && <s>{formatPrice(p.compareAtPriceCents!)}</s>}
        </p>
        {p.colors.length > 1 && (
          <ul className="dots" aria-label={`${p.colors.length} cores`}>
            {p.colors.map((c) => <li key={c.code} title={c.name} style={{ background: c.hex }} />)}
          </ul>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ items }: { items: Card[] }) {
  return <div className="grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>;
}
