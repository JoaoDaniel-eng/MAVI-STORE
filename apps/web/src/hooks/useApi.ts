import { useEffect, useState } from "react";
import { api } from "../lib/api";

type State<T> = { data?: T; error?: string; status?: number; loading: boolean };

/** Busca dados da API; mantém o resultado anterior enquanto carrega o próximo (filtros sem "piscar"). */
export function useApi<T>(path: string | null): State<T> {
  const [state, setState] = useState<State<T>>({ loading: path !== null });

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    setState((s) => ({ data: s.data, loading: true }));
    api<T>(path, { signal: ctrl.signal }).then(
      (data) => setState({ data, loading: false }),
      (err: { message?: string; status?: number }) => {
        if (ctrl.signal.aborted) return;
        setState({ error: err.message ?? "Erro ao carregar.", status: err.status, loading: false });
      },
    );
    return () => ctrl.abort();
  }, [path]);

  return state;
}
