import { MAX_LINE_QTY } from "@mavi/shared";
import { useSyncExternalStore } from "react";

// Sacola guardada neste aparelho. Preços e estoque são sempre conferidos pelo servidor.
type Item = { skuId: string; quantity: number };
type State = { items: Item[]; coupon: string };
const KEY = "mavi:cart";
const listeners = new Set<() => void>();

function read(): State {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<State> | null;
    const items = Array.isArray(v?.items)
      ? v.items.filter((i): i is Item => typeof i?.skuId === "string" && Number.isInteger(i.quantity) && i.quantity > 0).slice(0, 30)
      : [];
    return { items, coupon: typeof v?.coupon === "string" ? v.coupon : "" };
  } catch {
    return { items: [], coupon: "" };
  }
}

let state = read();
function write(next: State) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* só em memória */ }
  listeners.forEach((l) => l());
}
window.addEventListener("storage", (e) => { if (e.key === KEY) { state = read(); listeners.forEach((l) => l()); } });
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export function useCart() {
  const s = useSyncExternalStore(subscribe, () => state);
  return {
    items: s.items,
    coupon: s.coupon,
    count: s.items.reduce((n, i) => n + i.quantity, 0),
    add: (skuId: string, quantity = 1) => {
      const cur = s.items.find((i) => i.skuId === skuId);
      const q = Math.min(MAX_LINE_QTY, (cur?.quantity ?? 0) + quantity);
      write({ ...s, items: cur ? s.items.map((i) => (i.skuId === skuId ? { skuId, quantity: q } : i)) : [...s.items, { skuId, quantity: q }] });
    },
    setQty: (skuId: string, quantity: number) =>
      write({ ...s, items: quantity < 1 ? s.items.filter((i) => i.skuId !== skuId) : s.items.map((i) => (i.skuId === skuId ? { skuId, quantity: Math.min(MAX_LINE_QTY, quantity) } : i)) }),
    remove: (skuId: string) => write({ ...s, items: s.items.filter((i) => i.skuId !== skuId) }),
    setCoupon: (coupon: string) => write({ ...s, coupon }),
    clear: () => write({ items: [], coupon: "" }),
  };
}
