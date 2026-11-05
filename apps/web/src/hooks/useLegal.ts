import { LEGAL_SLUGS } from "@mavi/shared";
import { useApi } from "./useApi";

/** Quais páginas legais (termos, privacidade) já estão publicadas, para linkar nos formulários. */
export function useLegal() {
  const { data } = useApi<Array<{ slug: string }>>("/api/store/pages");
  const has = (slug: string) => (data ?? []).some((p) => p.slug === slug);
  return { terms: has(LEGAL_SLUGS.terms) ? `/p/${LEGAL_SLUGS.terms}` : null, privacy: has(LEGAL_SLUGS.privacy) ? `/p/${LEGAL_SLUGS.privacy}` : null };
}
