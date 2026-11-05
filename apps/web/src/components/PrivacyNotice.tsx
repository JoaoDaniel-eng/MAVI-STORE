import { useState } from "react";
import { Link } from "react-router-dom";
import { useLegal } from "../hooks/useLegal";

const KEY = "mavi:notice";

/** Aviso de transparência: a loja usa apenas armazenamento essencial. Se um dia houver análise ou publicidade, é preciso pedir consentimento. */
export function PrivacyNotice() {
  const legal = useLegal();
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  if (seen) return null;
  return (
    <aside className="notice" role="region" aria-label="Aviso de privacidade">
      <p>Este site usa apenas armazenamento essencial: sua sacola, favoritos e o login. Não usamos cookies de publicidade nem de rastreamento. {legal.privacy && <Link to={legal.privacy}>Política de privacidade</Link>}</p>
      <button type="button" className="btn btn--ghost" onClick={() => { try { localStorage.setItem(KEY, "1"); } catch { /* ignora */ } setSeen(true); }}>Entendi</button>
    </aside>
  );
}
