import type { DashboardData } from "@mavi/shared";
import { useState } from "react";
import { Link } from "react-router-dom";
import { brl, METHOD_LABEL, Page, Table, useList } from "./kit";

const INTEGRATION: Record<string, string> = { mercadopago: "Mercado Pago", asaas: "Asaas", melhor_envio: "Melhor Envio (frete)", email: "E-mails", storage: "Armazenamento de imagens" };

export default function DashboardPage() {
  const [days, setDays] = useState(30);
  const { data: d, error } = useList<DashboardData>(`/api/admin/dashboard?days=${days}`);
  const max = Math.max(1, ...(d?.series.map((s) => s.revenueCents) ?? [1]));
  const todo = d?.todo;

  return (
    <Page title="Resumo" actions={
      <div className="adm-tabs" role="group" aria-label="Período">
        {[7, 30, 90].map((n) => <button key={n} type="button" className={`chip ${days === n ? "is-on" : ""}`} aria-pressed={days === n} onClick={() => setDays(n)}>{n} dias</button>)}
      </div>}>
      {error && <p className="warn" role="alert">{error}</p>}
      {d && (
        <>
          <p className="muted">“Vendas” = pedidos confirmados (pagos ou com pagamento na retirada), sem cancelados nem aguardando pagamento. Dias no horário de Brasília.</p>
          <div className="adm-kpis">
            <div className="kpi"><span>Vendas</span><strong>{brl(d.summary.revenueCents)}</strong></div>
            <div className="kpi"><span>Pedidos</span><strong>{d.summary.orders}</strong></div>
            <div className="kpi"><span>Ticket médio</span><strong>{brl(d.summary.averageTicketCents)}</strong></div>
            <div className="kpi"><span>Cancelados</span><strong>{d.summary.cancelled}</strong></div>
            <div className="kpi"><span>Aguardando pagamento</span><strong>{d.summary.awaitingPayment}</strong></div>
          </div>

          <section className="adm-card" aria-label="A fazer">
            <h2>Pendências</h2>
            <ul className="adm-todo">
              <li><Link to="/admin/pedidos">{todo!.toProcess} pedido(s) confirmado(s) para separar</Link></li>
              <li><Link to="/admin/retiradas">{todo!.readyForPickup} retirada(s) pronta(s) aguardando a cliente</Link></li>
              <li><Link to="/admin/pedidos">{todo!.refundsPending} reembolso(s) pendente(s)</Link></li>
              <li><Link to="/admin/estoque">{todo!.lowStock} item(ns) com estoque baixo ou zerado</Link></li>
              <li><Link to="/admin/avaliacoes">{todo!.reviewsPending} avaliação(ões) para moderar</Link></li>
              <li>{todo!.emailsPending} e-mail(s) na fila{todo!.emailsFailed > 0 && `, ${todo!.emailsFailed} com falha de envio`}</li>
            </ul>
          </section>

          <section className="adm-card" aria-label="Vendas por dia">
            <h2>Vendas por dia</h2>
            <div className="bars" role="img" aria-label={`Vendas por dia nos últimos ${d.days} dias`}>
              {d.series.map((s) => <div key={s.day} className="bars__col" title={`${s.day.split("-").reverse().join("/")}: ${brl(s.revenueCents)} (${s.orders} pedido(s))`}><span style={{ height: `${Math.max(2, (s.revenueCents / max) * 100)}%` }} /></div>)}
            </div>
            <p className="muted">Maior dia: {brl(max === 1 ? 0 : max)}</p>
          </section>

          <div className="adm-grid">
            <section className="adm-card"><h2>Mais vendidos</h2>
              <Table><thead><tr><th>Produto</th><th>Un.</th><th>Vendas</th></tr></thead>
                <tbody>{d.topProducts.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.units}</td><td>{brl(p.revenueCents)}</td></tr>)}{d.topProducts.length === 0 && <tr><td colSpan={3} className="muted">Sem vendas no período.</td></tr>}</tbody></Table>
            </section>
            <section className="adm-card"><h2>Por unidade e forma de pagamento</h2>
              <Table><thead><tr><th>Unidade</th><th>Pedidos</th><th>Vendas</th></tr></thead>
                <tbody>{d.byLocation.map((l) => <tr key={l.code}><td>{l.code}</td><td>{l.orders}</td><td>{brl(l.revenueCents)}</td></tr>)}{d.byLocation.length === 0 && <tr><td colSpan={3} className="muted">Sem vendas no período.</td></tr>}</tbody></Table>
              <p>{d.byMethod.map((m) => `${METHOD_LABEL[m.method] ?? m.method}: ${m.orders}`).join(" · ") || "—"}</p>
            </section>
          </div>

          <section className="adm-card"><h2>Integrações</h2>
            <ul className="adm-todo">{Object.entries(d.integrations).map(([k, v]) => <li key={k}>{INTEGRATION[k] ?? k}: <strong>{v === "pendente" ? "pendente de credenciais" : "credenciais presentes"}</strong></li>)}</ul>
            <p className="muted">“Credenciais presentes” só indica que as chaves foram informadas; não garante que a integração funciona. <Link to="/admin/configuracoes">Ver configurações</Link></p>
          </section>
        </>
      )}
    </Page>
  );
}
