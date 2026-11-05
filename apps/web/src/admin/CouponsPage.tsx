/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAuth } from "../hooks/useAuth";
import { Badge, brl, centsFrom, dt, fieldsToBody, Page, reaisFrom, SimpleCrud, type Field } from "./kit";

const fields: Field[] = [
  { key: "code", label: "Código do cupom", type: "text", required: true, createOnly: true, placeholder: "BEMVINDA10", help: "Letras, números, - ou _. Não pode ser alterado depois." },
  { key: "type", label: "Tipo", type: "select", required: true, createOnly: true, options: [{ value: "percent", label: "Percentual (%)" }, { value: "fixed", label: "Valor fixo (R$)" }, { value: "free_shipping", label: "Frete grátis" }] },
  { key: "value", label: "Valor", type: "text", help: "Percentual de 1 a 100, ou reais no valor fixo (ex.: 15,00). Ignorado no frete grátis." },
  { key: "minSubtotalCents", label: "Pedido mínimo (R$)", type: "money", nullable: true },
  { key: "maxDiscountCents", label: "Desconto máximo (R$)", type: "money", nullable: true, help: "Só para percentual." },
  { key: "startsAt", label: "Início", type: "datetime", nullable: true },
  { key: "endsAt", label: "Fim", type: "datetime", nullable: true },
  { key: "usageLimit", label: "Limite total de usos", type: "number", nullable: true },
  { key: "perCustomerLimit", label: "Limite por cliente", type: "number", nullable: true },
  { key: "description", label: "Observação interna", type: "text", nullable: true },
  { key: "isActive", label: "Ativo", type: "bool" },
];

export default function CouponsPage() {
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("coupons.manage") ?? false;
  const show = (r: Record<string, any>) => (r["type"] === "percent" ? `${r["value"]}%` : r["type"] === "fixed" ? brl(r["value"]) : "Frete grátis");
  return (
    <Page title="Cupons">
      <SimpleCrud url="/api/admin/coupons" fields={fields} canWrite={canWrite} newLabel="Novo cupom"
        rowToForm={(r) => ({
          code: r["code"], type: r["type"], value: r["type"] === "fixed" ? reaisFrom(r["value"]) : r["type"] === "percent" ? String(r["value"]) : "",
          minSubtotalCents: r["minSubtotalCents"] ? reaisFrom(r["minSubtotalCents"]) : "", maxDiscountCents: reaisFrom(r["maxDiscountCents"]),
          startsAt: r["startsAt"] ? new Date(new Date(r["startsAt"]).getTime() - new Date(r["startsAt"]).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "",
          endsAt: r["endsAt"] ? new Date(new Date(r["endsAt"]).getTime() - new Date(r["endsAt"]).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "",
          usageLimit: r["usageLimit"] ?? "", perCustomerLimit: r["perCustomerLimit"] ?? "", description: r["description"] ?? "", isActive: r["isActive"],
        }) as Record<string, string | boolean>}
        formToBody={(form, creating) => {
          const b = fieldsToBody(fields, form, creating);
          const type = String(form["type"]);
          const v = String(form["value"] ?? "").trim();
          if (type === "free_shipping" || !v) delete b["value"];
          else b["value"] = type === "fixed" ? centsFrom(v) : Number(v);
          return b;
        }}
        columns={[
          { label: "Código", render: (r) => <strong>{r["code"]}</strong> }, { label: "Desconto", render: show },
          { label: "Mínimo", render: (r) => (r["minSubtotalCents"] ? brl(r["minSubtotalCents"]) : "—") },
          { label: "Usos", render: (r) => `${r["usedCount"]}${r["usageLimit"] ? ` / ${r["usageLimit"]}` : ""}` },
          { label: "Validade", render: (r) => (r["startsAt"] || r["endsAt"] ? `${dt(r["startsAt"]) || "…"} → ${dt(r["endsAt"]) || "…"}` : "Sem prazo") },
          { label: "Status", render: (r) => <Badge tone={r["isActive"] ? "ok" : "muted"}>{r["isActive"] ? "Ativo" : "Inativo"}</Badge> },
        ]} />
    </Page>
  );
}
