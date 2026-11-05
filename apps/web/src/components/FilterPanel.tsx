import type { Facets } from "@mavi/shared";
import { useState } from "react";
import { formatPrice } from "../lib/format";

export type Filters = { cor: string[]; tamanho: string[]; min: string; max: string; disponivel: boolean };

type Props = {
  facets: Facets | undefined;
  value: Filters;
  onChange: (next: Partial<Filters>) => void;
  onClear: () => void;
};

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function FilterPanel({ facets, value, onChange, onClear }: Props) {
  const [min, setMin] = useState(value.min);
  const [max, setMax] = useState(value.max);
  const range = facets?.price;
  const active = value.cor.length + value.tamanho.length + (value.min ? 1 : 0) + (value.max ? 1 : 0) + (value.disponivel ? 1 : 0);

  return (
    <div className="filters">
      <fieldset>
        <legend>Disponibilidade</legend>
        <label className="check">
          <input type="checkbox" checked={value.disponivel} onChange={(e) => onChange({ disponivel: e.target.checked })} />
          Somente em estoque
        </label>
      </fieldset>

      {!!facets?.sizes.length && (
        <fieldset>
          <legend>Tamanho</legend>
          <div className="chips">
            {facets.sizes.map((s) => (
              <button key={s.label} type="button" className={`chip ${value.tamanho.includes(s.label) ? "is-on" : ""}`}
                aria-pressed={value.tamanho.includes(s.label)} onClick={() => onChange({ tamanho: toggle(value.tamanho, s.label) })}>
                {s.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {!!facets?.colors.length && (
        <fieldset>
          <legend>Cor</legend>
          <div className="swatches">
            {facets.colors.map((c) => (
              <button key={c.code} type="button" className={`swatch ${value.cor.includes(c.code) ? "is-on" : ""}`}
                aria-pressed={value.cor.includes(c.code)} aria-label={`${c.name} (${c.count})`} title={`${c.name} (${c.count})`}
                style={{ background: c.hex }} onClick={() => onChange({ cor: toggle(value.cor, c.code) })} />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>Preço</legend>
        <form className="price-form" onSubmit={(e) => { e.preventDefault(); onChange({ min, max }); }}>
          <label>De (R$)<input inputMode="numeric" pattern="[0-9]*" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))}
            placeholder={range?.minCents != null ? String(Math.floor(range.minCents / 100)) : ""} /></label>
          <label>Até (R$)<input inputMode="numeric" pattern="[0-9]*" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))}
            placeholder={range?.maxCents != null ? String(Math.ceil(range.maxCents / 100)) : ""} /></label>
          <button type="submit" className="btn btn--ghost">Aplicar</button>
        </form>
        {range?.minCents != null && range.maxCents != null && (
          <p className="muted">Nesta seleção: {formatPrice(range.minCents)} a {formatPrice(range.maxCents)}</p>
        )}
      </fieldset>

      {active > 0 && <button type="button" className="link-btn" onClick={() => { setMin(""); setMax(""); onClear(); }}>Limpar filtros ({active})</button>}
    </div>
  );
}
