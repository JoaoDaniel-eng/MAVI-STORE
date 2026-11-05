import { env } from "../../config/env";

type D = Record<string, unknown>;
export const TEMPLATES = ["verify_email", "password_reset", "order_confirmed", "order_ready_for_pickup", "order_shipped", "order_cancelled"] as const;
export type Template = (typeof TEMPLATES)[number];

const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (c: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(c) / 100);
export const siteLink = (path: string) => (env.SITE_URL ? `${env.SITE_URL.replace(/\/$/, "")}${path}` : null);

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string | null }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.6">${p}</p>`).join("");
  const button = cta?.url
    ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#5A2D52;color:#F6F3F5;padding:12px 22px;text-decoration:none;border-radius:2px">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F6F3F5;font-family:Helvetica,Arial,sans-serif;color:#2A1A2D">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.34em;color:#5A2D52;margin:0 0 28px">MAVI</p>
<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;margin:0 0 20px">${esc(title)}</h1>${body}${button}
<p style="margin-top:32px;font-size:12px;color:#625666">MAVI · Shopping do Alto, Loja 29 · Shopping Comary, Loja 120 · Teresópolis, RJ</p>
</div></body></html>`;
}
const text = (lines: Array<string | null>) => lines.filter(Boolean).join("\n\n");

export function renderEmail(t: Template, d: D): { subject: string; html: string; text: string } {
  const name = esc(d["name"] ?? "");
  const link = (d["link"] as string | null) ?? null;
  switch (t) {
    case "verify_email":
      return { subject: "Confirme seu e-mail na MAVI",
        html: layout("Confirme seu e-mail", [`Olá, ${name}! Falta só confirmar seu e-mail para ativar sua conta.`, "Se não foi você, ignore esta mensagem."], { label: "Confirmar e-mail", url: link }),
        text: text([`Olá, ${d["name"]}! Confirme seu e-mail:`, link, "Se não foi você, ignore esta mensagem."]) };
    case "password_reset":
      return { subject: "Redefinição de senha da MAVI",
        html: layout("Redefinir senha", [`Olá, ${name}! Recebemos um pedido para redefinir sua senha. O link vale por 1 hora.`, "Se não foi você, ignore esta mensagem: sua senha continua a mesma."], { label: "Criar nova senha", url: link }),
        text: text([`Olá, ${d["name"]}! Para redefinir sua senha (vale por 1 hora):`, link, "Se não foi você, ignore."]) };
    case "order_confirmed":
      return { subject: `Pedido nº ${d["number"]} confirmado`,
        html: layout(`Pedido nº ${esc(d["number"])} confirmado`, [`Olá, ${name}! Seu pedido de ${esc(money(d["totalCents"]))} foi confirmado.`, d["pickup"] ? `Retirada: ${esc(d["pickup"])}. Avisaremos quando estiver pronto.` : "Avisaremos quando for enviado."], { label: "Ver pedido", url: link }),
        text: text([`Olá, ${d["name"]}! Seu pedido nº ${d["number"]} (${money(d["totalCents"])}) foi confirmado.`, link]) };
    case "order_ready_for_pickup":
      return { subject: `Pedido nº ${d["number"]} pronto para retirada`,
        html: layout("Pronto para retirada", [`Olá, ${name}! Seu pedido nº ${esc(d["number"])} está pronto em ${esc(d["location"])}.`, `Informe este código na retirada: <strong style="font-size:20px;letter-spacing:0.2em">${esc(d["code"])}</strong>`], { label: "Ver pedido", url: link }),
        text: text([`Olá, ${d["name"]}! Pedido nº ${d["number"]} pronto em ${d["location"]}. Código de retirada: ${d["code"]}`, link]) };
    case "order_shipped":
      return { subject: `Pedido nº ${d["number"]} enviado`,
        html: layout("Seu pedido foi enviado", [`Olá, ${name}! Seu pedido nº ${esc(d["number"])} saiu para entrega.`, d["tracking"] ? `Código de rastreio: <strong>${esc(d["tracking"])}</strong>` : "O código de rastreio será informado em breve."], { label: "Ver pedido", url: link }),
        text: text([`Olá, ${d["name"]}! Pedido nº ${d["number"]} enviado.`, d["tracking"] ? `Rastreio: ${d["tracking"]}` : null, link]) };
    case "order_cancelled":
      return { subject: `Pedido nº ${d["number"]} cancelado`,
        html: layout("Pedido cancelado", [`Olá, ${name}. Seu pedido nº ${esc(d["number"])} foi cancelado.`, d["reason"] ? `Motivo: ${esc(d["reason"])}` : "", d["refund"] ? "Como houve pagamento, faremos o reembolso e avisaremos por aqui." : ""].filter(Boolean), { label: "Ver pedido", url: link }),
        text: text([`Olá, ${d["name"]}. Pedido nº ${d["number"]} cancelado.`, d["reason"] ? `Motivo: ${d["reason"]}` : null, d["refund"] ? "Faremos o reembolso do valor pago." : null, link]) };
  }
}
