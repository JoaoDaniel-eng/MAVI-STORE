import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login, register } from "../hooks/useAuth";
import { useLegal } from "../hooks/useLegal";
import { useSeo } from "../hooks/useSeo";

export function Login() {
  useSeo({ title: "Entrar" });
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = /^\/(?!\/)/.test(sp.get("next") ?? "") ? sp.get("next")! : "/conta"; // só caminhos internos (evita redirecionamento aberto)
  const legal = useLegal();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === "login") await login(f.email, f.password);
      else await register({ name: f.name, email: f.email, password: f.password, ...(f.phone && { phone: f.phone }) });
      nav(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container narrow">
      <header className="page-head"><h1>{mode === "login" ? "Entrar" : "Criar conta"}</h1></header>
      <div className="chips" role="tablist">
        <button type="button" className={`chip ${mode === "login" ? "is-on" : ""}`} onClick={() => setMode("login")}>Já tenho conta</button>
        <button type="button" className={`chip ${mode === "register" ? "is-on" : ""}`} onClick={() => setMode("register")}>Quero me cadastrar</button>
      </div>
      <form className="step" onSubmit={submit}>
        {mode === "register" && <label className="field">Nome completo<input required autoComplete="name" {...bind("name")} /></label>}
        <label className="field">E-mail<input required type="email" autoComplete="email" {...bind("email")} /></label>
        {mode === "register" && <label className="field">Telefone (opcional)<input inputMode="tel" autoComplete="tel" {...bind("phone")} /></label>}
        <label className="field">Senha{mode === "register" ? " (mínimo 10 caracteres)" : ""}
          <input required type="password" minLength={mode === "register" ? 10 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} {...bind("password")} />
        </label>
        {mode === "register" && <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} required /> Li e aceito {legal.terms ? <Link to={legal.terms} target="_blank">os termos de uso</Link> : "os termos de uso"} e {legal.privacy ? <Link to={legal.privacy} target="_blank">a política de privacidade</Link> : "a política de privacidade"}.</label>}
        {error && <p className="warn" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</button>
        {mode === "login" && <Link to="/esqueci-senha" className="link-btn">Esqueci minha senha</Link>}
      </form>
    </div>
  );
}
