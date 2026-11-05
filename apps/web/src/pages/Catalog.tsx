import { SORTS, type ProductListResponse, type StoreCategory } from "@mavi/shared";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { FilterPanel, type Filters } from "../components/FilterPanel";
import { FilterIcon } from "../components/Icons";
import { ProductGrid } from "../components/ProductCard";
import { useApi } from "../hooks/useApi";
import { useSeo } from "../hooks/useSeo";

const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  newest: "Mais recentes",
  price_asc: "Menor preço",
  price_desc: "Maior preço",
  name: "Nome (A a Z)",
};
const csv = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

export function Catalog() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState(false);
  const cats = useApi<StoreCategory[]>("/api/store/categories");

  const filters: Filters = {
    cor: csv(sp.get("cor")), tamanho: csv(sp.get("tamanho")),
    min: sp.get("min") ?? "", max: sp.get("max") ?? "", disponivel: sp.get("disponivel") === "1",
  };
  const rawSort = sp.get("ordem");
  const sort = (SORTS as readonly string[]).includes(rawSort ?? "") ? (rawSort as (typeof SORTS)[number]) : "newest";
  const page = Math.max(1, Number(sp.get("pagina")) || 1);
  const q = sp.get("q") ?? "";

  const qs = new URLSearchParams({ sort, page: String(page), pageSize: "24" });
  if (slug) qs.set("category", slug);
  if (q) qs.set("q", q);
  if (filters.cor.length) qs.set("color", filters.cor.join(","));
  if (filters.tamanho.length) qs.set("size", filters.tamanho.join(","));
  if (filters.min) qs.set("minPrice", String(Number(filters.min) * 100));
  if (filters.max) qs.set("maxPrice", String(Number(filters.max) * 100));
  if (filters.disponivel) qs.set("inStock", "true");

  const { data, loading, error, status } = useApi<ProductListResponse>(`/api/store/products?${qs}`);
  const category = cats.data?.find((c) => c.slug === slug);
  const heading = category?.name ?? (q ? `Busca: ${q}` : "Todos os produtos");
  useSeo({ title: heading, description: `${heading} na MAVI, moda feminina.` });

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
    if (!("pagina" in next)) p.delete("pagina");
    setSp(p);
  };
  const onFilters = (n: Partial<Filters>) =>
    update({
      ...(n.cor && { cor: n.cor.join(",") || null }),
      ...(n.tamanho && { tamanho: n.tamanho.join(",") || null }),
      ...(n.min !== undefined && { min: n.min || null }),
      ...(n.max !== undefined && { max: n.max || null }),
      ...(n.disponivel !== undefined && { disponivel: n.disponivel ? "1" : null }),
    });
  const clear = () => update({ cor: null, tamanho: null, min: null, max: null, disponivel: null });

  if (status === 404) return <div className="container state"><p>Categoria não encontrada.</p><Link to="/catalogo" className="btn btn--ghost">Ver todos os produtos</Link></div>;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="container">
      <header className="page-head">
        <h1>{heading}</h1>
        {data && <p className="muted">{data.total} {data.total === 1 ? "produto" : "produtos"}</p>}
      </header>

      <div className="toolbar">
        <button type="button" className="btn btn--ghost filter-open" onClick={() => setOpen(true)}><FilterIcon /> Filtrar</button>
        <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: (new FormData(e.currentTarget).get("q") as string).trim() || null }); }}>
          <label className="sr-only" htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={q} placeholder="Buscar produto" key={q} />
        </form>
        <label className="sort">
          <span className="sr-only">Ordenar por</span>
          <select value={sort} onChange={(e) => update({ ordem: e.target.value === "newest" ? null : e.target.value })}>
            {SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </label>
      </div>

      <div className="catalog">
        <aside className={`drawer ${open ? "is-open" : ""}`} aria-label="Filtros">
          <div className="drawer__head"><h2>Filtros</h2><button type="button" className="link-btn" onClick={() => setOpen(false)}>Fechar</button></div>
          <FilterPanel facets={data?.facets} value={filters} onChange={onFilters} onClear={clear} />
          <button type="button" className="btn drawer__apply" onClick={() => setOpen(false)}>Ver {data?.total ?? 0} {data?.total === 1 ? "produto" : "produtos"}</button>
        </aside>
        {open && <div className="backdrop" onClick={() => setOpen(false)} />}

        <section aria-busy={loading} className={loading ? "is-loading" : ""}>
          {error && <p className="state">{error}</p>}
          {data && data.items.length === 0 && <p className="state">Nenhum produto encontrado com esses filtros.</p>}
          {data && <ProductGrid items={data.items} />}
          {data && totalPages > 1 && (
            <nav className="pager" aria-label="Paginação">
              <button type="button" className="btn btn--ghost" disabled={page <= 1} onClick={() => update({ pagina: String(page - 1) })}>Anterior</button>
              <span>Página {page} de {totalPages}</span>
              <button type="button" className="btn btn--ghost" disabled={page >= totalPages} onClick={() => update({ pagina: String(page + 1) })}>Próxima</button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
