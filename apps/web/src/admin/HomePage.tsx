/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Badge, call, errText, Modal, Page, Table, uploadImage, useList, type Row } from "./kit";

const KINDS: Record<string, string> = { hero: "Destaque principal (banner grande)", banner: "Faixa com imagem", featured_products: "Vitrine de produtos", category_grid: "Grade de categorias", text: "Texto" };
type Form = { kind: string; title: string; subtitle: string; body: string; ctaLabel: string; ctaUrl: string; imageKey: string | null | undefined; imageUrl: string; productIds: string[]; categoryIds: string[]; sortOrder: string; isActive: boolean };
const EMPTY: Form = { kind: "hero", title: "", subtitle: "", body: "", ctaLabel: "", ctaUrl: "", imageKey: undefined, imageUrl: "", productIds: [], categoryIds: [], sortOrder: "0", isActive: true };

export default function HomePage() {
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("content.manage") ?? false;
  const { data, error, reload } = useList<Row[]>("/api/admin/content/home-sections");
  const products = useList<{ items: Row[] }>("/api/admin/catalog/products?status=active&limit=200");
  const cats = useList<Row[]>("/api/admin/catalog/categories");
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const creating = edit === "new";
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const tog = (k: "productIds" | "categoryIds", id: string) => setF((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((i) => i !== id) : [...x[k], id] }));

  const open = (r: Row | "new") => {
    setMsg(null); setEdit(r);
    setF(r === "new" ? EMPTY : { kind: r["kind"], title: r["title"] ?? "", subtitle: r["subtitle"] ?? "", body: r["body"] ?? "", ctaLabel: r["ctaLabel"] ?? "", ctaUrl: r["ctaUrl"] ?? "", imageKey: undefined, imageUrl: r["imageUrl"] ?? "", productIds: r["productIds"] ?? [], categoryIds: r["categoryIds"] ?? [], sortOrder: String(r["sortOrder"] ?? 0), isActive: r["isActive"] });
  };
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setMsg(null);
    try { const p = await uploadImage(file, "content"); setF((x) => ({ ...x, imageKey: p.key, imageUrl: p.publicUrl })); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    const body: Row = {
      title: f.title || null, subtitle: f.subtitle || null, body: f.body || null, ctaLabel: f.ctaLabel || null, ctaUrl: f.ctaUrl || null,
      productIds: f.kind === "featured_products" ? f.productIds : [], categoryIds: f.kind === "category_grid" ? f.categoryIds : [],
      sortOrder: Number(f.sortOrder) || 0, isActive: f.isActive,
      ...(f.imageKey !== undefined && { imageKey: f.imageKey }),
    };
    try {
      if (creating) await call("POST", "/api/admin/content/home-sections", { kind: f.kind, ...body });
      else await call("PATCH", `/api/admin/content/home-sections/${(edit as Row)["id"]}`, body);
      setEdit(null); reload();
    } catch (err) { setMsg(errText(err)); } finally { setBusy(false); }
  };
  const remove = async (r: Row) => { if (confirm("Excluir esta seção?")) try { await call("DELETE", `/api/admin/content/home-sections/${r["id"]}`); reload(); } catch (e) { alert(errText(e)); } };
  const hasImage = f.kind === "hero" || f.kind === "banner";

  return (
    <Page title="Página inicial" actions={canWrite && <button type="button" className="btn" onClick={() => open("new")}>Nova seção</button>}>
      <p className="muted">As seções aparecem na loja na ordem abaixo (menor número primeiro). Sem seções ativas, a home mostra as novidades do catálogo.</p>
      {error && <p className="warn" role="alert">{error}</p>}
      <Table>
        <thead><tr><th>Ordem</th><th>Tipo</th><th>Título</th><th>Status</th>{canWrite && <th />}</tr></thead>
        <tbody>
          {data?.map((r) => (
            <tr key={r["id"]}><td>{r["sortOrder"]}</td><td>{KINDS[r["kind"]]}</td><td>{r["title"] ?? <span className="muted">—</span>}</td>
              <td><Badge tone={r["isActive"] ? "ok" : "muted"}>{r["isActive"] ? "Ativa" : "Inativa"}</Badge></td>
              {canWrite && <td className="adm-row-actions"><button type="button" className="link-btn" onClick={() => open(r)}>Editar</button><button type="button" className="link-btn" onClick={() => void remove(r)}>Excluir</button></td>}</tr>
          ))}
          {data?.length === 0 && <tr><td colSpan={5} className="muted">Nenhuma seção.</td></tr>}
        </tbody>
      </Table>

      <Modal open={edit !== null} title={creating ? "Nova seção" : "Editar seção"} onClose={() => setEdit(null)}>
        <form className="adm-form" onSubmit={save}>
          <label className="field">Tipo<select value={f.kind} disabled={!creating} onChange={(e) => set("kind", e.target.value)}>{Object.entries(KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="field">Título<input value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} /></label>
          {f.kind !== "text" && <label className="field">Subtítulo<input value={f.subtitle} maxLength={300} onChange={(e) => set("subtitle", e.target.value)} /></label>}
          {f.kind === "text" && <label className="field">Texto<textarea rows={5} value={f.body} onChange={(e) => set("body", e.target.value)} /></label>}
          {f.kind !== "text" && f.kind !== "category_grid" && (
            <div className="two">
              <label className="field">Texto do botão<input value={f.ctaLabel} maxLength={40} onChange={(e) => set("ctaLabel", e.target.value)} /></label>
              <label className="field">Link do botão<input value={f.ctaUrl} placeholder="/catalogo ou https://…" onChange={(e) => set("ctaUrl", e.target.value)} /></label>
            </div>
          )}
          {hasImage && (
            <div className="field">Imagem
              {f.imageUrl && <img src={f.imageUrl} alt="" style={{ maxWidth: "16rem" }} />}
              <div className="adm-inline"><label className="btn btn--ghost">{busy ? "Enviando…" : f.imageUrl ? "Trocar imagem" : "Enviar imagem"}<input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} /></label>
                {f.imageUrl && <button type="button" className="link-btn" onClick={() => setF((x) => ({ ...x, imageKey: null, imageUrl: "" }))}>Remover</button>}</div>
            </div>
          )}
          {f.kind === "featured_products" && <fieldset><legend>Produtos (até 12)</legend><div className="adm-pick">{products.data?.items.map((p) => <label key={p["id"]} className="check"><input type="checkbox" checked={f.productIds.includes(p["id"])} onChange={() => tog("productIds", p["id"])} /> {p["name"]}</label>)}{products.data?.items.length === 0 && <span className="muted">Nenhum produto ativo.</span>}</div></fieldset>}
          {f.kind === "category_grid" && <fieldset><legend>Categorias (até 8)</legend><div className="adm-pick">{cats.data?.map((c) => <label key={c["id"]} className="check"><input type="checkbox" checked={f.categoryIds.includes(c["id"])} onChange={() => tog("categoryIds", c["id"])} /> {c["name"]}</label>)}</div></fieldset>}
          <div className="two">
            <label className="field">Ordem<input type="number" min={0} value={f.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={f.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Ativa</label>
          </div>
          {msg && <p className="warn" role="alert">{msg}</p>}
          <button className="btn" type="submit" disabled={busy}>Salvar</button>
        </form>
      </Modal>
    </Page>
  );
}
