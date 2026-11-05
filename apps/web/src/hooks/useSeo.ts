import { useEffect } from "react";

type Seo = {
  title?: string | undefined;
  description?: string | undefined;
  image?: string | undefined;
  type?: "website" | "product";
  jsonLd?: Record<string, unknown> | undefined;
};

function setMeta(attr: "name" | "property", key: string, value: string | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!value) return el?.remove();
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

/** SEO básico no cliente: título, descrição, Open Graph, canonical e dados estruturados. */
export function useSeo({ title, description, image, type = "website", jsonLd }: Seo) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : undefined;
  useEffect(() => {
    const full = title ? `${title} | MAVI` : "MAVI | Moda feminina";
    document.title = full;
    setMeta("name", "description", description);
    setMeta("property", "og:title", full);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:image", image);
    setMeta("property", "og:url", window.location.origin + window.location.pathname);

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = window.location.origin + window.location.pathname;

    const old = document.getElementById("ld-json");
    old?.remove();
    if (ld) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.id = "ld-json";
      s.textContent = ld;
      document.head.appendChild(s);
    }
    return () => document.getElementById("ld-json")?.remove();
  }, [title, description, image, type, ld]);
}
