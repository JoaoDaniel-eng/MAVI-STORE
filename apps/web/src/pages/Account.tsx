import type { AccountOrderRow } from "@mavi/shared";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { loadUser, logout, useAuth } from "../hooks/useAuth";
import { useApi } from "../hooks/useApi";
import { useSeo } from "../hooks/useSeo";
import { api, downloadFile, post } from "../lib/api";
import { formatPrice } from "../lib/format";

const STATUS: Record<string, string> = {
  awaiting_payment: "Aguardando pagamento", confirmed: "Confirmado", processing: "Em separação", ready_for_pickup: "Pronto para retirada",
  shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
};

export function Account() {
  useSeo({ title: "Minha conta" });
  const { user, ready } = useAuth();
  const orders = useApi<AccountOrderRow[]>(user ? "/api/account/orders" : null);
  const profile = useApi<{ name: string; phone: string | null; emailVerified: boolean; marketingOptIn: boolean }>(user ? "/api/account/profile" : null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [privMsg, setPrivMsg] = useState<string | null>(null);
  useEffect(() => { if (profile.data) { setName(profile.data.name); setPhone(profile.data.phone ?? ""); setMarketing(profile.data.marketingOptIn); } }, [profile.data]);

  if (!ready) return <p className="container state">Carregando…</p>;
  if (!user) return <Navigate to="/entrar?next=/conta" replace />;

  return (
    <div className="container narrow">
      <header className="page-head"><h1>Minha conta</h1><p className="muted">{user.email}</p></header>

      {profile.data && !profile.data.emailVerified && (
        <p className="warn" role="status">
          Confirme seu e-mail pelo link que enviamos.{" "}
          <button type="button" className="link-btn" onClick={() => post("/api/auth/resend-verification", {}).then(() => setMsg("Enviamos um novo link."), (e: Error) => setMsg(e.message))}>Reenviar</button>
        </p>
      )}

      <section className="step" aria-label="Pedidos">
        <h2>Pedidos</h2>
        {orders.data?.length === 0 && <p className="muted">Você ainda não fez pedidos.</p>}
        <ul className="mini">
          {(orders.data ?? []).map((o) => (
            <li key={o.id}><Link to={`/conta/pedidos/${o.id}`}>Nº {o.number} · {new Date(o.createdAt).toLocaleDateString("pt-BR")}</Link><span>{STATUS[o.status] ?? o.status} · {formatPrice(o.totalCents)}</span></li>
          ))}
        </ul>
        <Link to="/favoritos" className="link-btn">Meus favoritos</Link>
      </section>

      <form className="step" onSubmit={async (e) => { e.preventDefault(); setMsg(null); try { await api("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone: phone || null, marketingOptIn: marketing }) }); setMsg("Dados salvos."); } catch (err) { setMsg((err as Error).message); } }}>
        <h2>Meus dados</h2>
        <label className="field">Nome<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Telefone<input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} /> Quero receber novidades e ofertas por e-mail</label>
        <button className="btn btn--ghost" type="submit">Salvar</button>
        {msg && <p className="muted" role="status">{msg}</p>}
      </form>

      <form className="step" onSubmit={async (e) => { e.preventDefault(); setPwMsg(null); try { await post("/api/account/password", pw); setPw({ currentPassword: "", newPassword: "" }); setPwMsg("Senha alterada."); } catch (err) { setPwMsg((err as Error).message); } }}>
        <h2>Alterar senha</h2>
        <label className="field">Senha atual<input required type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></label>
        <label className="field">Nova senha (mínimo 10 caracteres)<input required type="password" minLength={10} autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></label>
        <button className="btn btn--ghost" type="submit">Alterar senha</button>
        {pwMsg && <p className="muted" role="status">{pwMsg}</p>}
      </form>

      <section className="step" aria-label="Privacidade">
        <h2>Privacidade</h2>
        <p className="muted">Você pode baixar uma cópia dos seus dados ou excluir sua conta. Os pedidos já feitos são mantidos pela loja pelo prazo exigido em lei, sem ligação com a conta.</p>
        <div className="adm-inline">
          <button type="button" className="btn btn--ghost" onClick={() => downloadFile("/api/account/data-export", "meus-dados-mavi.json").catch((e: Error) => setPrivMsg(e.message))}>Baixar meus dados</button>
          <button type="button" className="btn btn--ghost" onClick={async () => {
            const password = prompt("Para excluir sua conta, digite sua senha. Esta ação não pode ser desfeita.");
            if (!password) return;
            try { await post("/api/account/delete", { password }); await loadUser(); } catch (e) { setPrivMsg((e as Error).message); }
          }}>Excluir minha conta</button>
        </div>
        {privMsg && <p className="warn" role="alert">{privMsg}</p>}
      </section>

      <button type="button" className="btn btn--ghost" onClick={() => void logout()}>Sair</button>
    </div>
  );
}
