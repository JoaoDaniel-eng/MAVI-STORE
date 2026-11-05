import type { ProductCard } from "@mavi/shared";
import { Link } from "react-router-dom";
import { ProductGrid } from "../components/ProductCard";
import { useApi } from "../hooks/useApi";
import { useFavorites } from "../hooks/useFavorites";
import { useSeo } from "../hooks/useSeo";

export function Favorites() {
  useSeo({ title: "Favoritos" });
  const fav = useFavorites();
  const ids = fav.ids.slice(0, 50);
  const { data, error, loading } = useApi<ProductCard[]>(ids.length ? `/api/store/products/by-ids?ids=${ids.join(",")}` : null);
  const items = (data ?? []).filter((p) => ids.includes(p.id));

  return (
    <div className="container">
      <header className="page-head"><h1>Favoritos</h1><p className="muted">Salvos neste aparelho.</p></header>
      {ids.length === 0 && <div className="state"><p>Você ainda não favoritou nenhuma peça.</p><Link to="/catalogo" className="btn btn--ghost">Ver o catálogo</Link></div>}
      {error && <p className="state">{error}</p>}
      {ids.length > 0 && loading && !data && <p className="state">Carregando…</p>}
      {items.length > 0 && <ProductGrid items={items} />}
    </div>
  );
}
