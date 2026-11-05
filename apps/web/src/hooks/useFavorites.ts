import { useSyncExternalStore } from "react";
import { api, post } from "../lib/api";

// Favoritos deste aparelho (localStorage). A sincronização com a conta chega com o login do cliente.
const KEY = "mavi:favorites";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  } catch {
    return [];
  }
}

let ids = read();
const emit = () => listeners.forEach((l) => l());

function write(next: string[]) {
  ids = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* armazenamento indisponível: mantém só em memória */
  }
  emit();
}

window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    ids = read();
    emit();
  }
});

let accountMode = false;
export const bindAccount = (on: boolean) => { accountMode = on; };
/** Após o login: envia os favoritos do aparelho para a conta e passa a usar a lista da conta. */
export async function mergeWithAccount() {
  try {
    const cards = await post<Array<{ id: string }>>("/api/store/favorites/merge", { ids: ids.slice(0, 100) });
    write(cards.map((c) => c.id));
  } catch { /* mantém os favoritos locais */ }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useFavorites() {
  const list = useSyncExternalStore(subscribe, () => ids);
  return {
    ids: list,
    count: list.length,
    has: (id: string) => list.includes(id),
    toggle: (id: string) => {
      const on = !list.includes(id);
      write(on ? [id, ...list] : list.filter((x) => x !== id));
      if (accountMode) void api(`/api/store/favorites/${id}`, { method: on ? "PUT" : "DELETE" }).catch(() => undefined);
    },
  };
}
