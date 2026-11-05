import "./Logo.css";

type LogoProps = {
  size?: "sm" | "md" | "lg";
  tone?: "ink" | "brand" | "light";
  tagline?: boolean;
};

/** Logotipo tipográfico MAVI: Bodoni Moda com espaçamento aberto. */
export function Logo({ size = "md", tone = "ink", tagline = false }: LogoProps) {
  return (
    <span className={`logo logo--${size} logo--${tone}`} role="img" aria-label="MAVI, moda feminina">
      <span className="logo__word" aria-hidden="true">MAVI</span>
      {tagline && <span className="logo__tag" aria-hidden="true">moda feminina</span>}
    </span>
  );
}
