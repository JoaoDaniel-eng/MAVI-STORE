const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatPrice = (cents: number) => brl.format(cents / 100);
export const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
