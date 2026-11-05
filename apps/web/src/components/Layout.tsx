import type { StoreCategory, StoreLocation } from "@mavi/shared";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useApi } from "../hooks/useApi";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";
import { useFavorites } from "../hooks/useFavorites";
import { BagIcon, HeartIcon } from "./Icons";
import { Logo } from "./Logo";
import { PrivacyNotice } from "./PrivacyNotice";

export function Layout() {
  const cats = useApi<StoreCategory[]>("/api/store/categories");
  const locs = useApi<StoreLocation[]>("/api/store/locations");
  const pages = useApi<Array<{ slug: string; title: string; showInFooter: boolean }>>("/api/store/pages");
  const fav = useFavorites();
  const cart = useCart();
  const { user } = useAuth();
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);

  const top = (cats.data ?? []).filter((c) => !c.parentId);
  return (
    <>
      <header className="header">
        <div className="container header__row">
          <Link to="/" aria-label="MAVI, página inicial"><Logo size="sm" tone="brand" /></Link>
          <div className="header__actions">
            <Link to={user ? "/conta" : "/entrar"} className="header__account">{user ? "Minha conta" : "Entrar"}</Link>
            <Link to="/favoritos" className="header__fav" aria-label={`Favoritos (${fav.count})`}>
              <HeartIcon filled={fav.count > 0} />
              {fav.count > 0 && <span className="badge">{fav.count}</span>}
            </Link>
            <Link to="/carrinho" className="header__fav" aria-label={`Sacola (${cart.count} ${cart.count === 1 ? "item" : "itens"})`}>
              <BagIcon />
              {cart.count > 0 && <span className="badge">{cart.count}</span>}
            </Link>
          </div>
        </div>
        <nav className="container nav" aria-label="Categorias">
          <NavLink to="/catalogo" end>Todos</NavLink>
          {top.map((c) => <NavLink key={c.id} to={`/categoria/${c.slug}`}>{c.name}</NavLink>)}
        </nav>
      </header>

      <main id="conteudo"><Outlet /></main>
      <PrivacyNotice />

      <footer className="footer">
        <div className="container footer__grid">
          <Logo size="md" tone="light" tagline />
          <div>
            <h2 className="footer__title">Nossas lojas</h2>
            {(locs.data ?? []).map((l) => (
              <p key={l.code} className="footer__loc">
                <strong>{l.shoppingName}, Loja {l.storeNumber}</strong><br />
                {l.address ? <>{l.address}<br /></> : null}
                {l.city}, {l.state}
                {l.pickupEnabled && <><br />Retirada {l.pickupFeeCents === 0 ? "grátis" : "disponível"} na loja</>}
              </p>
            ))}
            <nav className="footer__links" aria-label="Institucional">
              {(pages.data ?? []).filter((p) => p.showInFooter).map((p) => <Link key={p.slug} to={`/p/${p.slug}`}>{p.title}</Link>)}
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}
