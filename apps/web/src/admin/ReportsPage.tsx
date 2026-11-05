import { useState } from "react";
import { downloadFile } from "../lib/api";
import { errText, Page } from "./kit";

const REPORTS: Array<{ type: string; title: string; text: string; dated: boolean }> = [
  { type: "sales", title: "Vendas (pedidos)", text: "Um pedido por linha: status, pagamento, unidade, cliente, valores e cupom.", dated: true },
  { type: "items", title: "Itens vendidos", text: "Um item por linha: produto, SKU, cor, tamanho, quantidade e valores.", dated: true },
  { type: "stock", title: "Estoque atual", text: "Saldo físico, reservado e disponível por SKU e unidade (posição de hoje).", dated: false },
  { type: "coupons", title: "Uso de cupons", text: "Pedidos que usaram cupom e o desconto concedido.", dated: true },
  { type: "customers", title: "Clientes do período", text: "Compradores com total gasto e último pedido. Contém dados pessoais.", dated: true },
];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export default function ReportsPage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const get = async (type: string, dated: boolean) => {
    setBusy(type); setMsg(null);
    try { await downloadFile(`/api/admin/reports/${type}${dated ? `?from=${from}&to=${to}` : ""}`, `mavi-${type}.csv`); } catch (e) { setMsg(errText(e)); } finally { setBusy(null); }
  };

  return (
    <Page title="Relatórios">
      <p className="muted">Arquivos CSV para abrir no Excel ou Google Planilhas (separador “;”, valores em reais, até 1 ano e 50 mil linhas). Cada exportação fica registrada na auditoria.</p>
      <div className="adm-filters">
        <label className="field">De<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field">Até<input type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {msg && <p className="warn" role="alert">{msg}</p>}
      <div className="adm-grid">
        {REPORTS.map((r) => (
          <section key={r.type} className="adm-card">
            <h2>{r.title}</h2><p className="muted">{r.text}</p>
            <button type="button" className="btn btn--ghost" disabled={busy !== null || !from || !to} onClick={() => void get(r.type, r.dated)}>{busy === r.type ? "Gerando…" : "Baixar CSV"}</button>
          </section>
        ))}
      </div>
    </Page>
  );
}
