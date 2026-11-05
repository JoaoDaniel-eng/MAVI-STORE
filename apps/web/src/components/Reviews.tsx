import type { ReviewsResponse } from "@mavi/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { post } from "../lib/api";

export const Stars = ({ value }: { value: number }) => (
  <span className="stars" role="img" aria-label={`${value} de 5`}>{"★".repeat(Math.round(value))}<span className="stars__off">{"★".repeat(5 - Math.round(value))}</span></span>
);

export function Reviews({ slug }: { slug: string }) {
  const [v, setV] = useState(0); // força recarregar depois de enviar
  const { data } = useApi<ReviewsResponse>(`/api/store/products/${slug}/reviews?limit=20&v=${v}`);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return null;
  const { summary } = data;
  return (
    <section className="block" aria-label="Avaliações">
      <h2 className="block__title">Avaliações</h2>
      {summary.count > 0 && summary.average !== null
        ? <p className="reviews__sum"><Stars value={summary.average} /> {summary.average.toLocaleString("pt-BR")} de 5 · {summary.count} {summary.count === 1 ? "avaliação" : "avaliações"}</p>
        : <p className="muted">Este produto ainda não tem avaliações.</p>}
      <ul className="reviews">
        {data.items.map((r) => (
          <li key={r.id}><Stars value={r.rating} />{r.title && <strong> {r.title}</strong>}<p>{r.body}</p><p className="muted">{r.authorName} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}</p></li>
        ))}
      </ul>

      {data.canReview === null && <p className="muted"><Link to={`/entrar?next=/produto/${slug}`}>Entre</Link> para avaliar se você já recebeu este produto.</p>}
      {data.canReview === false && <p className="muted">Só quem recebeu o produto pode avaliar (uma avaliação por produto).</p>}
      {data.canReview && (
        <form className="step" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setMsg(null); try { const r = await post<{ message: string }>(`/api/store/products/${slug}/reviews`, { rating, ...(title && { title }), body }); setMsg(r.message); setBody(""); setTitle(""); setV((x) => x + 1); } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); } }}>
          <h3>Sua avaliação</h3>
          <div className="chips" role="radiogroup" aria-label="Nota">
            {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={`chip ${rating === n ? "is-on" : ""}`} aria-pressed={rating === n} onClick={() => setRating(n)}>{n} ★</button>)}
          </div>
          <label className="field">Título (opcional)<input maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field">Comentário<textarea required minLength={10} maxLength={1500} rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></label>
          <button className="btn" type="submit" disabled={busy}>Enviar avaliação</button>
          {msg && <p className="muted" role="status">{msg}</p>}
        </form>
      )}
      {data.canReview !== true && msg && <p className="muted" role="status">{msg}</p>}
    </section>
  );
}
