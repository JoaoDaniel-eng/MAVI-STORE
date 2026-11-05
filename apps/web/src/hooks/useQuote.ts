import type { CartQuote } from "@mavi/shared";
import { useEffect, useState } from "react";
import { post } from "../lib/api";

export function useQuote(items: Array<{ skuId: string; quantity: number }>, couponCode: string) {
  const [state, setState] = useState<{ data?: CartQuote; error?: string; loading: boolean }>({ loading: items.length > 0 });
  const key = JSON.stringify([items, couponCode]);

  useEffect(() => {
    if (!items.length) { setState({ loading: false }); return; }
    const ctrl = new AbortController();
    setState((s) => ({ data: s.data, loading: true }));
    post<CartQuote>("/api/store/cart/quote", { items, ...(couponCode && { couponCode }) }, undefined, ctrl.signal).then(
      (data) => setState({ data, loading: false }),
      (e: { message?: string }) => { if (!ctrl.signal.aborted) setState({ error: e.message ?? "Erro ao carregar a sacola.", loading: false }); },
    );
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
