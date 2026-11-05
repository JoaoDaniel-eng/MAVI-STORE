import { Fragment, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useSeo } from "../hooks/useSeo";

/** Texto simples: parágrafos, "## subtítulo" e listas com "- ". Nunca interpreta HTML. */
function Body({ text }: { text: string }) {
  const blocks: ReactNode[] = text.split(/\n{2,}/).map((b, i) => {
    const lines = b.split("\n").map((l) => l.trimEnd());
    if (lines[0]?.startsWith("## ")) return <h2 key={i} className="info__h">{lines[0].slice(3)}</h2>;
    if (lines.every((l) => l.startsWith("- "))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{l.slice(2)}</li>)}</ul>;
    return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{l}</Fragment>)}</p>;
  });
  return <>{blocks}</>;
}

export function InfoPage() {
  const { slug = "" } = useParams();
  const { data, error, status } = useApi<{ title: string; body: string; seoDescription: string | null }>(`/api/store/pages/${slug}`);
  useSeo({ title: data?.title, description: data?.seoDescription ?? undefined });
  if (status === 404) return <div className="container state"><p>Página não encontrada.</p><Link to="/" className="btn btn--ghost">Voltar à loja</Link></div>;
  if (error) return <p className="container state">{error}</p>;
  if (!data) return <p className="container state">Carregando…</p>;
  return (
    <article className="container info">
      <header className="page-head"><h1>{data.title}</h1></header>
      <div className="info__body"><Body text={data.body} /></div>
    </article>
  );
}
