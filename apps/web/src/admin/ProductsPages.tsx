/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Badge, brl, call, centsFrom, errText, Page, Pager, reaisFrom, statusTone, Table, uploadImage, useList, type Row } from "./kit";

const STATUS: Record<string, string> = { draft: "Rascunho", active: "Ativo", archived: "Arquivado" };

function ProductsList() {
  const { user } = useAuth();
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ limit: "30", offset: String(offset) });
  if (status) qs.set("status", status);
  if (q) qs.set("q", q);
  const { data, error } = useList<{ total: number; items: Row[] }>(`/api/admin/catalog/products?${qs}`);
  return (
    <Page title="Produtos" actions={user?.permissions.includes("catalog.manage") && <Link to="/admin/produtos/novo" className="btn">Novo produto</Link>}>
      <div className="adm-filters">
        <form onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); setOffset(0); }}><input placeholder="Nome ou código" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Buscar" /></form>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
          <option value="">Todos</option>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {error && <p className="warn" role="alert">{error}</p>}
      <Table>
        <thead><tr><th /><th>Produto</th><th>Categoria</th><th>Preço</th><th>Variações</th><th>Status</th></tr></thead>
        <tbody>
          {data?.items.map((p) => (
            <tr key={p["id"]}>
              <td>{p["coverUrl"] ? <img className="adm-thumb" src={p["coverUrl"]} alt="" /> : <span className="adm-thumb" style={{ display: "block" }} />}</td>
              <td><Link to={`/admin/produtos/${p["id"]}`}>{p["name"]}</Link><br /><span className="muted">{p["code"]}</span></td>
              <td>{p["categoryName"]}</td><td>{brl(p["basePriceCents"])}</td><td>{p["skuCount"]}</td>
              <td><Badge tone={statusTone(p["status"])}>{STATUS[p["status"]]}</Badge></td>
            </tr>
          ))}
          {data?.items.length === 0 && <tr><td colSpan={6} className="muted">Nenhum produto.</td></tr>}
        </tbody>
      </Table>
      {data && <Pager total={data.total} offset={offset} limit={30} onChange={setOffset} />}
    </Page>
  );
}

const EMPTY = { code: "", name: "", slug: "", categoryId: "", sizeGuideId: "", basePrice: "", comparePrice: "", weightG: "", lengthCm: "", widthCm: "", heightCm: "", description: "", composition: "", careInstructions: "", seoTitle: "", seoDescription: "", status: "draft" };
type Form = typeof EMPTY;
const toForm = (p: Row): Form => ({
  code: p["code"], name: p["name"], slug: p["slug"], categoryId: p["categoryId"], sizeGuideId: p["sizeGuideId"] ?? "",
  basePrice: reaisFrom(p["basePriceCents"]), comparePrice: reaisFrom(p["compareAtPriceCents"]), weightG: p["weightG"] ?? "",
  lengthCm: p["lengthCm"] ?? "", widthCm: p["widthCm"] ?? "", heightCm: p["heightCm"] ?? "", description: p["description"] ?? "",
  composition: p["composition"] ?? "", careInstructions: p["careInstructions"] ?? "", seoTitle: p["seoTitle"] ?? "", seoDescription: p["seoDescription"] ?? "", status: p["status"],
});
const num = (s: string | number) => (String(s).trim() === "" ? null : Number(s));
const toBody = (f: Form, isNew: boolean): Row => ({
  code: f.code, name: f.name, categoryId: f.categoryId, basePriceCents: centsFrom(f.basePrice) ?? 0,
  ...(f.slug && { slug: f.slug }), sizeGuideId: f.sizeGuideId || null, compareAtPriceCents: centsFrom(f.comparePrice),
  weightG: num(f.weightG), lengthCm: num(f.lengthCm), widthCm: num(f.widthCm), heightCm: num(f.heightCm),
  description: f.description || null, composition: f.composition || null, careInstructions: f.careInstructions || null,
  seoTitle: f.seoTitle || null, seoDescription: f.seoDescription || null, ...(!isNew && { status: f.status }),
});

function ProductEditor() {
  const { id = "novo" } = useParams();
  const isNew = id === "novo";
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("catalog.manage") ?? false;
  const product = useList<Row>(isNew ? null : `/api/admin/catalog/products/${id}`);
  const cats = useList<Row[]>("/api/admin/catalog/categories");
  const guides = useList<Row[]>("/api/admin/catalog/size-guides");
  const colors = useList<Row[]>("/api/admin/catalog/colors");
  const sizes = useList<Row[]>("/api/admin/catalog/sizes");
  const [f, setF] = useState<Form>(EMPTY);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (product.data) setF(toForm(product.data)); }, [product.data]);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (isNew) { const r = await call<Row>("POST", "/api/admin/catalog/products", toBody(f, true)); nav(`/admin/produtos/${r["id"]}`, { replace: true }); }
      else { await call("PATCH", `/api/admin/catalog/products/${id}`, toBody(f, false)); setMsg({ tone: "ok", text: "Produto salvo." }); product.reload(); }
    } catch (err) { setMsg({ tone: "warn", text: errText(err) }); } finally { setBusy(false); }
  };

  const p = product.data;
  const text = (label: string, k: keyof Form, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="field">{label}<input value={f[k]} onChange={set(k)} disabled={!canWrite} {...extra} /></label>;

  return (
    <Page title={isNew ? "Novo produto" : p?.["name"] ?? "Produto"} actions={<Link to="/admin/produtos" className="btn btn--ghost">Voltar</Link>}>
      <form className="adm-card adm-form" onSubmit={save}>
        <h2>Dados</h2>
        <div className="adm-grid">
          {text("Código (SKU base)", "code", { required: true, placeholder: "VES001" })}
          {text("Nome", "name", { required: true })}
          {text("Endereço (slug)", "slug", { placeholder: "gerado pelo nome" })}
          <label className="field">Categoria<select required value={f.categoryId} onChange={set("categoryId")} disabled={!canWrite}><option value="">Selecione</option>{cats.data?.map((c) => <option key={c["id"]} value={c["id"]}>{c["name"]}</option>)}</select></label>
          <label className="field">Guia de medidas<select value={f.sizeGuideId} onChange={set("sizeGuideId")} disabled={!canWrite}><option value="">Nenhum</option>{guides.data?.map((g) => <option key={g["id"]} value={g["id"]}>{g["name"]}</option>)}</select></label>
          {!isNew && <label className="field">Status<select value={f.status} onChange={set("status")} disabled={!canWrite}>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><span className="muted">Para ativar: preço, peso, medidas, 1 imagem e 1 variação ativa.</span></label>}
        </div>
        <div className="adm-grid">
          {text("Preço (R$)", "basePrice", { required: true, inputMode: "decimal", placeholder: "0,00" })}
          {text("Preço “de” (opcional)", "comparePrice", { inputMode: "decimal", placeholder: "0,00" })}
        </div>
        <div className="adm-grid">
          {text("Peso (g)", "weightG", { type: "number", min: 1 })}{text("Comprimento (cm)", "lengthCm", { type: "number", min: 1 })}
          {text("Largura (cm)", "widthCm", { type: "number", min: 1 })}{text("Altura (cm)", "heightCm", { type: "number", min: 1 })}
        </div>
        <label className="field">Descrição<textarea rows={4} value={f.description} onChange={set("description")} disabled={!canWrite} /></label>
        <div className="adm-grid">
          {text("Composição", "composition")}{text("Cuidados", "careInstructions")}
          {text("Título para buscadores (SEO)", "seoTitle", { maxLength: 70 })}{text("Descrição para buscadores (SEO)", "seoDescription", { maxLength: 160 })}
        </div>
        {msg && <p className={msg.tone === "ok" ? "ok" : "warn"} role="status">{msg.text}</p>}
        {canWrite && <button className="btn" type="submit" disabled={busy}>{busy ? "Salvando…" : isNew ? "Criar produto" : "Salvar"}</button>}
      </form>

      {p && canWrite && <Skus product={p} colors={colors.data ?? []} sizes={sizes.data ?? []} reload={product.reload} />}
      {p && canWrite && <Images product={p} colors={colors.data ?? []} reload={product.reload} />}
    </Page>
  );
}

function Skus({ product, colors, sizes, reload }: { product: Row; colors: Row[]; sizes: Row[]; reload: () => void }) {
  const [cs, setCs] = useState<string[]>([]);
  const [zs, setZs] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const tog = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const run = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); reload(); } catch (e) { setMsg(errText(e)); } };

  return (
    <section className="adm-card">
      <h2>Variações (cor × tamanho)</h2>
      {msg && <p className="warn" role="alert">{msg}</p>}
      <Table>
        <thead><tr><th>SKU</th><th>Cor</th><th>Tamanho</th><th>Preço próprio</th><th>Ativa</th><th /></tr></thead>
        <tbody>
          {(product["skus"] as Row[]).map((s) => (
            <tr key={s["id"]}>
              <td>{s["skuCode"]}</td><td>{s["colorName"]}</td><td>{s["sizeLabel"]}</td>
              <td><input className="adm-price" defaultValue={reaisFrom(s["priceCents"])} placeholder={reaisFrom(product["basePriceCents"])} style={{ width: "7rem" }} aria-label={`Preço do SKU ${s["skuCode"]}`}
                onBlur={(e) => { const c = centsFrom(e.target.value); if (c !== (s["priceCents"] ?? null)) void run(() => call("PATCH", `/api/admin/catalog/skus/${s["id"]}`, { priceCents: c })); }} /></td>
              <td><input type="checkbox" checked={s["isActive"]} aria-label="Ativa" onChange={(e) => void run(() => call("PATCH", `/api/admin/catalog/skus/${s["id"]}`, { isActive: e.target.checked }))} /></td>
              <td><button type="button" className="link-btn" onClick={() => confirm("Excluir esta variação?") && void run(() => call("DELETE", `/api/admin/catalog/skus/${s["id"]}`))}>Excluir</button></td>
            </tr>
          ))}
          {(product["skus"] as Row[]).length === 0 && <tr><td colSpan={6} className="muted">Nenhuma variação. Gere abaixo.</td></tr>}
        </tbody>
      </Table>
      <h3>Gerar variações</h3>
      <div className="adm-grid">
        <fieldset><legend>Cores</legend><div className="adm-pick">{colors.map((c) => <label key={c["id"]} className="check"><input type="checkbox" checked={cs.includes(c["id"])} onChange={() => tog(cs, setCs, c["id"])} /><span className="dots-inline" style={{ background: c["hex"] }} /> {c["name"]}</label>)}{colors.length === 0 && <span className="muted">Cadastre cores em “Categorias e atributos”.</span>}</div></fieldset>
        <fieldset><legend>Tamanhos</legend><div className="adm-pick">{sizes.map((z) => <label key={z["id"]} className="check"><input type="checkbox" checked={zs.includes(z["id"])} onChange={() => tog(zs, setZs, z["id"])} /> {z["label"]}</label>)}{sizes.length === 0 && <span className="muted">Cadastre tamanhos em “Categorias e atributos”.</span>}</div></fieldset>
      </div>
      <div className="adm-inline">
        <input placeholder="Preço próprio (opcional)" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: "12rem" }} />
        <button type="button" className="btn" disabled={!cs.length || !zs.length}
          onClick={() => void run(async () => { const r = await call<{ created: unknown[]; skipped: number }>("POST", `/api/admin/catalog/products/${product["id"]}/skus/generate`, { colorIds: cs, sizeIds: zs, priceCents: centsFrom(price) }); setMsg(`${r.created.length} criada(s), ${r.skipped} já existia(m).`); setCs([]); setZs([]); })}>Gerar</button>
      </div>
    </section>
  );
}

function Images({ product, colors, reload }: { product: Row; colors: Row[]; reload: () => void }) {
  const [color, setColor] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    try {
      for (const file of Array.from(files)) {
        const p = await uploadImage(file, "product");
        await call("POST", `/api/admin/catalog/products/${product["id"]}/images`, { key: p.key, alt: product["name"], ...(color && { colorId: color }) });
      }
      reload();
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  const patch = (id: string, body: Row) => call("PATCH", `/api/admin/catalog/images/${id}`, body).then(reload, (e) => setMsg(errText(e)));

  return (
    <section className="adm-card">
      <h2>Imagens</h2>
      {msg && <p className="warn" role="alert">{msg}</p>}
      <div className="adm-inline">
        <select value={color} onChange={(e) => setColor(e.target.value)} aria-label="Cor das novas imagens" style={{ width: "auto" }}><option value="">Todas as cores</option>{colors.map((c) => <option key={c["id"]} value={c["id"]}>{c["name"]}</option>)}</select>
        <label className="btn btn--ghost">{busy ? "Enviando…" : "Enviar fotos"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label>
      </div>
      <ul className="adm-images">
        {(product["images"] as Row[]).map((i) => (
          <li key={i["id"]}>
            <img src={i["url"]} alt={i["alt"]} />
            <input defaultValue={i["alt"]} aria-label="Texto alternativo" placeholder="Descrição da foto" onBlur={(e) => e.target.value !== i["alt"] && void patch(i["id"], { alt: e.target.value })} />
            <select defaultValue={i["colorId"] ?? ""} aria-label="Cor" onChange={(e) => void patch(i["id"], { colorId: e.target.value || null })}><option value="">Todas as cores</option>{colors.map((c) => <option key={c["id"]} value={c["id"]}>{c["name"]}</option>)}</select>
            <div className="adm-inline"><input type="number" min={0} defaultValue={i["sortOrder"]} aria-label="Ordem" onBlur={(e) => Number(e.target.value) !== i["sortOrder"] && void patch(i["id"], { sortOrder: Number(e.target.value) })} />
              <button type="button" className="link-btn" onClick={() => confirm("Excluir esta imagem?") && void call("DELETE", `/api/admin/catalog/images/${i["id"]}`).then(reload, (e) => setMsg(errText(e)))}>Excluir</button></div>
          </li>
        ))}
      </ul>
      {(product["images"] as Row[]).length === 0 && <p className="muted">Nenhuma imagem. A primeira (menor ordem) é a capa.</p>}
    </section>
  );
}

export default function ProductsPages() {
  return (
    <Routes>
      <Route index element={<ProductsList />} />
      <Route path=":id" element={<ProductEditor />} />
    </Routes>
  );
}
