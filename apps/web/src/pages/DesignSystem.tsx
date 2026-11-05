import { Logo } from "../components/Logo";
import "./DesignSystem.css";

const colors = [
  { token: "--mavi-perola", name: "Pérola", hex: "#F6F3F5", use: "Fundo" },
  { token: "--mavi-nevoa", name: "Névoa", hex: "#E8E1E6", use: "Superfícies e linhas" },
  { token: "--mavi-orquidea", name: "Orquídea", hex: "#B98AAE", use: "Detalhe sobre fundo escuro" },
  { token: "--mavi-uva", name: "Uva", hex: "#5A2D52", use: "Marca e ações principais" },
  { token: "--mavi-ameixa", name: "Ameixa", hex: "#2A1A2D", use: "Texto" },
  { token: "--mavi-pedra", name: "Pedra", hex: "#625666", use: "Texto secundário" },
  { token: "--mavi-salvia", name: "Sálvia", hex: "#4F6B5C", use: "Sucesso" },
  { token: "--mavi-rubi", name: "Rubi", hex: "#A12F3F", use: "Erro" },
  { token: "--mavi-ambar", name: "Âmbar", hex: "#8A5A12", use: "Aviso" },
];

const scale = [
  { step: "--step-4", sample: "Vestidos de verão" },
  { step: "--step-3", sample: "Nova coleção" },
  { step: "--step-2", sample: "Linho e algodão" },
  { step: "--step-1", sample: "Escolha o tamanho e a cor" },
  { step: "--step-0", sample: "Texto corrido em Jost, com entrelinha de 1,6 para leitura confortável." },
  { step: "--step--1", sample: "Informação de apoio, como prazo e composição." },
];

/** Página interna de referência. Só existe em desenvolvimento. */
export function DesignSystem() {
  return (
    <main className="ds container">
      <h1>Design system MAVI</h1>

      <section className="ds__section" aria-labelledby="ds-logo">
        <h2 id="ds-logo">Logotipo</h2>
        <div className="ds__logos">
          <div className="ds__panel"><Logo size="lg" tone="brand" tagline /></div>
          <div className="ds__panel ds__panel--dark"><Logo size="lg" tone="light" tagline /></div>
          <div className="ds__panel"><Logo size="sm" tone="ink" /></div>
        </div>
      </section>

      <section className="ds__section" aria-labelledby="ds-cores">
        <h2 id="ds-cores">Cores</h2>
        <ul className="ds__colors">
          {colors.map((c) => (
            <li key={c.token}>
              <span className="ds__swatch" style={{ background: `var(${c.token})` }} />
              <strong>{c.name}</strong>
              <span>{c.hex}</span>
              <span className="ds__muted">{c.use}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ds__section" aria-labelledby="ds-tipo">
        <h2 id="ds-tipo">Tipografia</h2>
        <p className="ds__muted">Títulos em Bodoni Moda, texto em Jost.</p>
        {scale.map((s) => (
          <div key={s.step} className="ds__type">
            <code>{s.step}</code>
            <span
              style={{
                fontSize: `var(${s.step})`,
                fontFamily: s.step === "--step-0" || s.step === "--step--1" ? "var(--font-text)" : "var(--font-display)",
              }}
            >
              {s.sample}
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
