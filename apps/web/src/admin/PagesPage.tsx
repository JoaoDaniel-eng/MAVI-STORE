/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAuth } from "../hooks/useAuth";
import { Badge, Page, SimpleCrud, type Field } from "./kit";

const fields: Field[] = [
  { key: "title", label: "Título", type: "text", required: true },
  { key: "slug", label: "Endereço (slug)", type: "text", help: "Fica em /p/endereço. Use “termos” e “privacidade” para os links do checkout e do cadastro." },
  { key: "body", label: "Texto", type: "textarea", rows: 14, required: true, help: "Parágrafos separados por linha em branco. “## Título” cria um subtítulo; linhas com “- ” viram lista." },
  { key: "seoDescription", label: "Descrição para buscadores", type: "text", nullable: true },
  { key: "sortOrder", label: "Ordem", type: "number" },
  { key: "isPublished", label: "Publicada", type: "bool" },
  { key: "showInFooter", label: "Mostrar no rodapé", type: "bool" },
];

export default function PagesPage() {
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("content.manage") ?? false;
  return (
    <Page title="Páginas institucionais">
      <p className="muted">Termos, privacidade, trocas, sobre nós… Textos jurídicos devem ser revisados por um profissional antes de publicar.</p>
      <SimpleCrud url="/api/admin/content/pages" fields={fields} canWrite={canWrite} newLabel="Nova página"
        rowToForm={(r) => ({ title: r["title"], slug: r["slug"], body: r["body"], seoDescription: r["seoDescription"] ?? "", sortOrder: String(r["sortOrder"]), isPublished: r["isPublished"], showInFooter: r["showInFooter"] })}
        columns={[{ label: "Título", render: (r) => r["title"] }, { label: "Endereço", render: (r) => `/p/${r["slug"]}` }, { label: "Rodapé", render: (r) => (r["showInFooter"] ? "sim" : "não") },
          { label: "Status", render: (r) => <Badge tone={r["isPublished"] ? "ok" : "warn"}>{r["isPublished"] ? "Publicada" : "Rascunho"}</Badge> }]} />
    </Page>
  );
}
