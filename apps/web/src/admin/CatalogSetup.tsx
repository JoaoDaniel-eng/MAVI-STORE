/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Badge, Page, SimpleCrud, useList, type Field, type Row } from "./kit";

const BASE = "/api/admin/catalog";

function Categories({ canWrite }: { canWrite: boolean }) {
  const cats = useList<Row[]>(`${BASE}/categories`);
  const top = (cats.data ?? []).filter((c) => !c["parentId"]);
  const name = (id: string | null) => cats.data?.find((c) => c["id"] === id)?.["name"] ?? "";
  const fields: Field[] = [
    { key: "name", label: "Nome", type: "text", required: true },
    { key: "slug", label: "Endereço (slug)", type: "text", help: "Opcional; gerado pelo nome." },
    { key: "parentId", label: "Categoria pai", type: "select", nullable: true, options: top.map((c) => ({ value: c["id"], label: c["name"] })), help: "Até 2 níveis." },
    { key: "description", label: "Descrição", type: "textarea", nullable: true },
    { key: "sortOrder", label: "Ordem", type: "number" },
    { key: "isActive", label: "Ativa (aparece na loja)", type: "bool" },
  ];
  return <SimpleCrud url={`${BASE}/categories`} fields={fields} canWrite={canWrite} newLabel="Nova categoria"
    columns={[{ label: "Nome", render: (r) => r["name"] }, { label: "Pai", render: (r) => name(r["parentId"]) }, { label: "Slug", render: (r) => r["slug"] }, { label: "Ordem", render: (r) => r["sortOrder"] }, { label: "Status", render: (r) => <Badge tone={r["isActive"] ? "ok" : "muted"}>{r["isActive"] ? "Ativa" : "Inativa"}</Badge> }]} />;
}

function Colors({ canWrite }: { canWrite: boolean }) {
  const fields: Field[] = [
    { key: "code", label: "Código", type: "text", required: true, help: "2 a 12 letras/números, ex.: PRETO. Entra no código do SKU." },
    { key: "name", label: "Nome", type: "text", required: true },
    { key: "hex", label: "Cor", type: "color", required: true },
  ];
  return <SimpleCrud url={`${BASE}/colors`} fields={fields} canWrite={canWrite} newLabel="Nova cor"
    columns={[{ label: "", render: (r) => <span className="dots-inline" style={{ background: r["hex"], width: "1.4rem", height: "1.4rem" }} /> }, { label: "Nome", render: (r) => r["name"] }, { label: "Código", render: (r) => r["code"] }, { label: "Hex", render: (r) => r["hex"] }]} />;
}

function Sizes({ canWrite }: { canWrite: boolean }) {
  const fields: Field[] = [
    { key: "label", label: "Tamanho", type: "text", required: true, placeholder: "P, M, G, 38…" },
    { key: "sortOrder", label: "Ordem de exibição", type: "number", help: "Menor aparece primeiro." },
  ];
  return <SimpleCrud url={`${BASE}/sizes`} fields={fields} canWrite={canWrite} newLabel="Novo tamanho"
    columns={[{ label: "Tamanho", render: (r) => r["label"] }, { label: "Ordem", render: (r) => r["sortOrder"] }]} />;
}

function Guides({ canWrite }: { canWrite: boolean }) {
  const fields: Field[] = [
    { key: "name", label: "Nome do guia", type: "text", required: true },
    { key: "description", label: "Descrição", type: "textarea", nullable: true },
    { key: "table", label: "Tabela de medidas", type: "textarea", required: true, placeholder: "Tamanho; Busto (cm); Cintura (cm)\nP; ...; ...", help: "Uma linha por tamanho, colunas separadas por ponto e vírgula. A primeira linha são os títulos. Preencha com as medidas reais da peça." },
    { key: "notes", label: "Observações", type: "textarea", nullable: true },
  ];
  const parse = (t: string) => t.split("\n").map((l) => l.split(";").map((c) => c.trim())).filter((r) => r.some(Boolean));
  return <SimpleCrud url={`${BASE}/size-guides`} fields={fields} canWrite={canWrite} newLabel="Novo guia"
    rowToForm={(r) => ({ name: r["name"], description: r["description"] ?? "", notes: r["notes"] ?? "", table: [r["columns"], ...r["rows"]].map((x: string[]) => x.join("; ")).join("\n") })}
    formToBody={(f) => { const [columns = [], ...rows] = parse(String(f["table"])); return { name: String(f["name"]).trim(), description: String(f["description"]).trim() || null, notes: String(f["notes"]).trim() || null, columns, rows }; }}
    columns={[{ label: "Nome", render: (r) => r["name"] }, { label: "Colunas", render: (r) => (r["columns"] as string[]).join(", ") }, { label: "Linhas", render: (r) => (r["rows"] as unknown[]).length }]} />;
}

const TABS = [["categorias", "Categorias", Categories], ["cores", "Cores", Colors], ["tamanhos", "Tamanhos", Sizes], ["guias", "Guias de medidas", Guides]] as const;

export default function CatalogSetup() {
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("catalog.manage") ?? false;
  const [tab, setTab] = useState<string>("categorias");
  return (
    <Page title="Categorias e atributos">
      <div className="adm-tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "is-on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {TABS.map(([k, , C]) => tab === k && <C key={k} canWrite={canWrite} />)}
    </Page>
  );
}
