import type { HomeSectionView, ProductListResponse, StoreCategory } from "@mavi/shared";
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

function EmptyStorefront({ categories }: { categories: StoreCategory[] }) {
  const topCategories = categories.filter((category) => !category.parentId);
  return (
    <>
      <section className="home-intro">
        <div className="container home-intro__content">
          <p className="home-intro__eyebrow">MODA FEMININA · TERESÓPOLIS</p>
          <Logo size="lg" tone="light" tagline />
          <h1>Seu estilo, do seu jeito.</h1>
          <p className="home-intro__text">
            Uma nova experiência MAVI está chegando. Estamos preparando nosso catálogo online
            para você conhecer as peças disponíveis em nossas lojas.
          </p>
          <Link to="/catalogo" className="btn btn--light">Explorar a loja</Link>
        </div>
      </section>
      {topCategories.length > 0 && (
        <section className="container block home-categories">
          <h2 className="block__title">Explore por categoria</h2>
          <div className="tiles">
            {topCategories.map((category) => (
              <Link key={category.id} to={`/categoria/${category.slug}`} className="tile home-category-tile">
                <span>{category.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="container home-note">
        <p>Em breve, novidades da MAVI estarão disponíveis por aqui.</p>
        <Link to="/catalogo" className="link-btn">Acessar catálogo</Link>
      </section>
    </>
  );
}

export function Home() {
  useSeo({ title: "MAVI | Moda feminina", description: "MAVI, moda feminina em Teresópolis/RJ. Conheça nossas lojas no Shopping do Alto e no Shopping Comary." });
  const home = useApi<HomeSectionView[]>("/api/store/home");
  const sections = home.data ?? [];
  const fallback = useApi<ProductListResponse>(home.data && sections.length === 0 ? "/api/store/products?pageSize=8" : null);
  const categories = useApi<StoreCategory[]>(home.data && sections.length === 0 ? "/api/store/categories" : null);

  if (home.loading && !home.data) return <p className="container state" role="status">Carregando a loja…</p>;
  if (home.error) {
    return (
      <section className="container state home-error" role="alert">
        <h1>Não foi possível carregar a loja agora.</h1>
        <p>Verifique sua conexão e tente novamente em instantes.</p>
        <button type="button" className="btn btn--ghost" onClick={() => window.location.reload()}>Tentar novamente</button>
      </section>
    );
  }

  if (sections.length) return <>{sections.map((s) => <Section key={s.id} s={s} />)}</>;
  if (fallback.loading || categories.loading) return <p className="container state" role="status">Preparando a vitrine MAVI…</p>;
  if (fallback.error) {
    return (
      <section className="container state home-error" role="alert">
        <h1>A vitrine está temporariamente indisponível.</h1>
        <p>Estamos com dificuldade para buscar o catálogo. Tente novamente em instantes.</p>
        <button type="button" className="btn btn--ghost" onClick={() => window.location.reload()}>Tentar novamente</button>
      </section>
    );
  }
  if (fallback.data?.items.length) {
    return (
      <>
        <section className="home-welcome">
          <div className="container home-welcome__inner">
            <p>MODA FEMININA · TERESÓPOLIS</p>
            <h1>Descubra a MAVI.</h1>
            <span>Peças para expressar quem você é.</span>
          </div>
        </section>
        <section className="container block">
          <h2 className="block__title">Novidades</h2>
          <ProductGrid items={fallback.data.items} />
          <p className="block__cta"><Link to="/catalogo" className="btn btn--ghost">Ver todos os produtos</Link></p>
        </section>
      </>
    );
  }
  return <EmptyStorefront categories={categories.data ?? []} />;
}
