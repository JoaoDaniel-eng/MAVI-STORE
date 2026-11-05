import type { HomeSectionView, ProductListResponse } from "@mavi/shared";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { ProductGrid } from "../components/ProductCard";
import { SmartLink } from "../components/SmartLink";
import { useApi } from "../hooks/useApi";
import { useSeo } from "../hooks/useSeo";
import "./Home.css";

function Section({ s }: { s: HomeSectionView }) {
  if (s.kind === "hero" || s.kind === "banner") {
    return (
      <section className={`feature feature--${s.kind}`} style={s.imageUrl ? { backgroundImage: `linear-gradient(to top, rgb(42 26 45 / .6), transparent 60%), url(${s.imageUrl})` } : undefined}>
        <div className="container feature__inner">
          {s.title && <h2 className="feature__title">{s.title}</h2>}
          {s.subtitle && <p className="feature__sub">{s.subtitle}</p>}
          {s.ctaLabel && s.ctaUrl && <SmartLink to={s.ctaUrl} className="btn btn--light">{s.ctaLabel}</SmartLink>}
        </div>
      </section>
    );
  }
  if (s.kind === "featured_products") {
    return (
      <section className="container block">
        {s.title && <h2 className="block__title">{s.title}</h2>}
        <ProductGrid items={s.products} />
        {s.ctaLabel && s.ctaUrl && <p className="block__cta"><SmartLink to={s.ctaUrl} className="btn btn--ghost">{s.ctaLabel}</SmartLink></p>}
      </section>
    );
  }
  if (s.kind === "category_grid") {
    return (
      <section className="container block">
        {s.title && <h2 className="block__title">{s.title}</h2>}
        <div className="tiles">
          {s.categories.map((c) => (
            <Link key={c.id} to={`/categoria/${c.slug}`} className="tile" style={c.coverUrl ? { backgroundImage: `linear-gradient(to top, rgb(42 26 45 / .55), transparent 55%), url(${c.coverUrl})` } : undefined}>
              <span>{c.name}</span>
            </Link>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="container block block--text">
      {s.title && <h2 className="block__title">{s.title}</h2>}
      {s.body && <p>{s.body}</p>}
    </section>
  );
}

export function Home() {
  useSeo({ description: "MAVI, moda feminina em Teresópolis/RJ. Lojas no Shopping do Alto e no Shopping Comary." });
  const home = useApi<HomeSectionView[]>("/api/store/home");
  const sections = home.data ?? [];
  // Sem seções cadastradas, mostra as novidades reais do catálogo (se houver).
  const fallback = useApi<ProductListResponse>(home.data && sections.length === 0 ? "/api/store/products?pageSize=8" : null);

  if (home.loading && !home.data) return <p className="container state">Carregando…</p>;
  if (home.error) return <p className="container state">{home.error}</p>;

  if (sections.length) return <>{sections.map((s) => <Section key={s.id} s={s} />)}</>;

  if (fallback.data?.items.length) {
    return (
      <section className="container block">
        <h2 className="block__title">Novidades</h2>
        <ProductGrid items={fallback.data.items} />
        <p className="block__cta"><Link to="/catalogo" className="btn btn--ghost">Ver todos</Link></p>
      </section>
    );
  }

  return (
    <div className="soon">
      <Logo size="lg" tone="brand" tagline />
      <p className="soon__note">A loja online está em construção.</p>
    </div>
  );
}
