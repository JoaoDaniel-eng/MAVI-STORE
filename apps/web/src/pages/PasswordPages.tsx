import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSeo } from "../hooks/useSeo";
import { post } from "../lib/api";

export function ForgotPassword() {
  useSeo({ title: "Esqueci minha senha" });
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="container narrow">
      <header className="page-head"><h1>Esqueci minha senha</h1></header>
      {done ? <p className="ok" role="status">Se o e-mail estiver cadastrado, enviaremos um link para criar uma nova senha.</p> : (
        <form className="step" onSubmit={async (e) => { e.preventDefault(); setError(null); try { await post("/api/auth/forgot-password", { email }); setDone(true); } catch (err) { setError((err as Error).message); } }}>
          <label className="field">E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          {error && <p className="warn" role="alert">{error}</p>}
          <button className="btn" type="submit">Enviar link</button>
        </form>
      )}
    </div>
  );
}

export function ResetPassword() {
  useSeo({ title: "Nova senha" });
  const [sp] = useSearchParams();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="container narrow">
      <header className="page-head"><h1>Criar nova senha</h1></header>
      {done ? <p className="ok" role="status">Senha alterada. <Link to="/entrar">Entrar</Link></p> : (
        <form className="step" onSubmit={async (e) => { e.preventDefault(); setError(null); try { await post("/api/auth/reset-password", { token: sp.get("token") ?? "", password }); setDone(true); } catch (err) { setError((err as Error).message); } }}>
          <label className="field">Nova senha (mínimo 10 caracteres)<input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <p className="warn" role="alert">{error}</p>}
          <button className="btn" type="submit">Salvar senha</button>
        </form>
      )}
    </div>
  );
}

export function VerifyEmail() {
  useSeo({ title: "Confirmar e-mail" });
  const [sp] = useSearchParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    post("/api/auth/verify-email", { token: sp.get("token") ?? "" }).then(() => setState("ok"), (e: Error) => { setMsg(e.message); setState("error"); });
  }, [sp]);
  return (
    <div className="container narrow state">
      <h1>Confirmação de e-mail</h1>
      {state === "loading" && <p>Confirmando…</p>}
      {state === "ok" && <p className="ok" role="status">E-mail confirmado. <Link to="/conta">Ir para minha conta</Link></p>}
      {state === "error" && <p className="warn" role="alert">{msg}</p>}
    </div>
  );
}
