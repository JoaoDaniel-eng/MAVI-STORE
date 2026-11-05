/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Badge, brl, call, errText, fieldsToBody, fieldsToForm, Page, SimpleCrud, useList, type Field, type Row } from "./kit";

const unitFields: Field[] = [
  { key: "name", label: "Nome da unidade", type: "text", required: true },
  { key: "address", label: "Endereço", type: "text", nullable: true },
  { key: "postalCode", label: "CEP", type: "text", nullable: true, help: "8 dígitos, só números. É a origem do cálculo de frete." },
  { key: "phone", label: "Telefone", type: "text", nullable: true },
  { key: "whatsapp", label: "WhatsApp", type: "text", nullable: true, help: "Só dígitos, com país e DDD (ex.: 5521999999999). Ativa o botão de WhatsApp na loja." },
  { key: "hours", label: "Horário de funcionamento", type: "textarea", help: "Uma linha por faixa, no formato “Seg a Sáb: 10h às 22h”." },
  { key: "pickupEnabled", label: "Aceita retirada", type: "bool" },
  { key: "pickupFeeCents", label: "Taxa de retirada (R$)", type: "money", help: "0,00 = retirada grátis." },
  { key: "canShipFrom", label: "Pode ser origem de entregas nacionais", type: "bool" },
  { key: "isActive", label: "Ativa", type: "bool" },
];

function Units({ canWrite }: { canWrite: boolean }) {
  return (
    <SimpleCrud url="/api/admin/locations" fields={unitFields} canWrite={canWrite} creatable={false} deletable={false}
      rowToForm={(r) => ({ ...fieldsToForm(unitFields, r), hours: ((r["openingHours"] as Array<{ label: string; hours: string }> | null) ?? []).map((h) => `${h.label}: ${h.hours}`).join("\n") })}
      formToBody={(f) => {
        const b = fieldsToBody(unitFields.filter((x) => x.key !== "hours"), f, false);
        const lines = String(f["hours"] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
        b["openingHours"] = lines.length ? lines.map((l) => { const i = l.indexOf(":"); return i > 0 ? { label: l.slice(0, i).trim(), hours: l.slice(i + 1).trim() } : { label: "Horário", hours: l }; }) : null;
        return b;
      }}
      columns={[
        { label: "Unidade", render: (r) => r["name"] },
        { label: "CEP (frete)", render: (r) => r["postalCode"] ?? <Badge tone="warn">pendente</Badge> },
        { label: "WhatsApp", render: (r) => r["whatsapp"] ?? <Badge tone="warn">pendente</Badge> },
        { label: "Retirada", render: (r) => (r["pickupEnabled"] ? (r["pickupFeeCents"] ? brl(r["pickupFeeCents"]) : "Grátis") : "Não") },
        { label: "Envia", render: (r) => (r["canShipFrom"] ? "sim" : "não") },
        { label: "Status", render: (r) => <Badge tone={r["isActive"] ? "ok" : "muted"}>{r["isActive"] ? "Ativa" : "Inativa"}</Badge> },
      ]} />
  );
}

const METHODS: Array<[string, string]> = [["pix", "Pix"], ["card", "Cartão"], ["pay_on_pickup", "Pagar na retirada"]];
const STRATEGIES: Array<[string, string]> = [["default_with_fallback", "Unidade padrão; se faltar, outra que tenha tudo"], ["default_only", "Somente a unidade padrão"], ["most_stock", "Unidade com mais estoque dos itens"]];

function Rules({ canWrite }: { canWrite: boolean }) {
  const settings = useList<Array<{ key: string; value: any }>>("/api/admin/settings");
  const locs = useList<Row[]>("/api/admin/locations");
  const gw = useList<{ active: string | null }>("/api/admin/payments/gateway");
  const [name, setName] = useState("");
  const [rule, setRule] = useState({ strategy: "default_with_fallback", default_location_code: "" });
  const [low, setLow] = useState("3");
  const [ttl, setTtl] = useState("15");
  const [methods, setMethods] = useState<string[]>([]);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const val = (k: string) => settings.data?.find((s) => s.key === k)?.value;

  useEffect(() => {
    if (!settings.data) return;
    setName(val("store.name") ?? ""); setRule(val("shipping.origin_rule") ?? rule);
    setLow(String(val("stock.low_stock_threshold")?.default ?? 3)); setTtl(String(val("stock.reservation_ttl_minutes") ?? 15));
    setMethods(val("payments.enabled_methods") ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);

  const save = async (key: string, value: unknown) => {
    try { await call("PATCH", `/api/admin/settings/${key}`, { value }); setMsg((m) => ({ ...m, [key]: "Salvo." })); settings.reload(); } catch (e) { setMsg((m) => ({ ...m, [key]: errText(e) })); }
  };
  const Msg = ({ k }: { k: string }) => (msg[k] ? <p className={msg[k] === "Salvo." ? "ok" : "warn"} role="status">{msg[k]}</p> : null);
  const onlineOff = gw.data && !gw.data.active;

  return (
    <div className="adm-grid">
      <form className="adm-card adm-form" onSubmit={(e) => { e.preventDefault(); void save("store.name", name.trim()); }}>
        <h2>Loja</h2><label className="field">Nome da loja<input value={name} disabled={!canWrite} onChange={(e) => setName(e.target.value)} /></label>
        {canWrite && <button className="btn btn--ghost" type="submit">Salvar</button>}<Msg k="store.name" />
      </form>

      <form className="adm-card adm-form" onSubmit={(e) => { e.preventDefault(); void save("shipping.origin_rule", rule); }}>
        <h2>Origem das entregas nacionais</h2>
        <label className="field">Regra<select value={rule.strategy} disabled={!canWrite} onChange={(e) => setRule({ ...rule, strategy: e.target.value })}>{STRATEGIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field">Unidade padrão<select required value={rule.default_location_code} disabled={!canWrite} onChange={(e) => setRule({ ...rule, default_location_code: e.target.value })}><option value="">Selecione</option>{locs.data?.filter((l) => l["canShipFrom"] && l["isActive"]).map((l) => <option key={l["code"]} value={l["code"]}>{l["name"]}</option>)}</select></label>
        {canWrite && <button className="btn btn--ghost" type="submit">Salvar</button>}<Msg k="shipping.origin_rule" />
      </form>

      <form className="adm-card adm-form" onSubmit={(e) => { e.preventDefault(); void save("stock.low_stock_threshold", { default: Number(low) }); }}>
        <h2>Alerta de baixo estoque</h2>
        <label className="field">Avisar quando o disponível for até<input type="number" min={0} max={1000} required value={low} disabled={!canWrite} onChange={(e) => setLow(e.target.value)} /><span className="muted">Vale para todos os SKUs sem limite próprio.</span></label>
        {canWrite && <button className="btn btn--ghost" type="submit">Salvar</button>}<Msg k="stock.low_stock_threshold" />
      </form>

      <form className="adm-card adm-form" onSubmit={(e) => { e.preventDefault(); void save("stock.reservation_ttl_minutes", Number(ttl)); }}>
        <h2>Reserva no checkout</h2>
        <label className="field">Minutos que o estoque fica reservado (5 a 120)<input type="number" min={5} max={120} required value={ttl} disabled={!canWrite} onChange={(e) => setTtl(e.target.value)} /><span className="muted">Deixe compatível com o prazo do Pix do seu gateway.</span></label>
        {canWrite && <button className="btn btn--ghost" type="submit">Salvar</button>}<Msg k="stock.reservation_ttl_minutes" />
      </form>

      <form className="adm-card adm-form" onSubmit={(e) => { e.preventDefault(); void save("payments.enabled_methods", methods); }}>
        <h2>Formas de pagamento no checkout</h2>
        {METHODS.map(([v, l]) => <label key={v} className="check"><input type="checkbox" disabled={!canWrite} checked={methods.includes(v)} onChange={() => setMethods((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]))} /> {l}</label>)}
        {onlineOff && methods.some((m) => m !== "pay_on_pickup") && <p className="warn" role="status">Pix e cartão só aparecem na loja quando o gateway estiver configurado (veja “Integrações”).</p>}
        {canWrite && <button className="btn btn--ghost" type="submit">Salvar</button>}<Msg k="payments.enabled_methods" />
      </form>
    </div>
  );
}

const INTEGRATIONS: Array<{ key: string; name: string; vars: string }> = [
  { key: "mercadopago", name: "Mercado Pago", vars: "MERCADOPAGO_ACCESS_TOKEN, API_PUBLIC_URL, SITE_URL (e, opcional, MERCADOPAGO_WEBHOOK_SECRET)" },
  { key: "asaas", name: "Asaas", vars: "ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN" },
  { key: "melhor_envio", name: "Melhor Envio (frete)", vars: "MELHOR_ENVIO_TOKEN, MELHOR_ENVIO_CONTACT_EMAIL, e o CEP de cada unidade (aba Unidades)" },
  { key: "email", name: "E-mails", vars: "EMAIL_API_KEY, EMAIL_FROM, SITE_URL" },
  { key: "storage", name: "Armazenamento de imagens", vars: "STORAGE_BUCKET, STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_ENDPOINT, STORAGE_PUBLIC_URL" },
];

function Integrations() {
  const st = useList<Record<string, string>>("/api/status/integrations");
  const gw = useList<{ selected: string | null; active: string | null; webhookUrl: string | null }>("/api/admin/payments/gateway");
  return (
    <div className="adm-form">
      <p className="muted">As chaves são variáveis de ambiente da hospedagem (nunca ficam no painel nem no código). “Credenciais presentes” só indica que foram informadas; não garante que funcionam.</p>
      <div className="adm-grid">
        {INTEGRATIONS.map((i) => (
          <section key={i.key} className="adm-card"><h2>{i.name}</h2>
            <p><Badge tone={st.data?.[i.key] === "credenciais_presentes" ? "ok" : "warn"}>{st.data?.[i.key] === "credenciais_presentes" ? "Credenciais presentes" : "Pendente"}</Badge></p>
            <p className="muted">Variáveis: {i.vars}</p>
          </section>
        ))}
      </div>
      <section className="adm-card"><h2>Gateway de pagamento</h2>
        <dl className="dl"><dt>Escolhido</dt><dd>{gw.data?.selected ?? "nenhum (PAYMENT_GATEWAY)"}</dd><dt>Ativo</dt><dd>{gw.data?.active ?? "não — credenciais incompletas"}</dd><dt>URL do webhook</dt><dd>{gw.data?.webhookUrl ?? "defina PAYMENT_GATEWAY e API_PUBLIC_URL"}</dd></dl>
        <p className="muted">Cadastre essa URL como webhook no painel do gateway.</p>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("settings.manage") ?? false;
  const [tab, setTab] = useState("unidades");
  return (
    <Page title="Configurações">
      {!canWrite && <p className="muted">Você pode consultar as configurações; só a Proprietária altera.</p>}
      <div className="adm-tabs" role="tablist">
        {[["unidades", "Unidades"], ["regras", "Regras"], ["integracoes", "Integrações"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`chip ${tab === k ? "is-on" : ""}`} onClick={() => setTab(k!)}>{l}</button>)}
      </div>
      {tab === "unidades" && <Units canWrite={canWrite} />}
      {tab === "regras" && <Rules canWrite={canWrite} />}
      {tab === "integracoes" && <Integrations />}
    </Page>
  );
}
