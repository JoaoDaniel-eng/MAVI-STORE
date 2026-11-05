const BASE = (import.meta.env["VITE_API_URL"] as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
/** Renova a sessão (uma chamada por vez). Retorna se deu certo. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(BASE + "/api/auth/refresh", { method: "POST", credentials: "include", headers: { "X-Requested-With": "mavi" } })
    .then((r) => r.ok, () => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function api<T>(path: string, init?: RequestInit & { retried?: boolean }): Promise<T> {
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  if (method !== "GET") headers.set("X-Requested-With", "mavi"); // exigido pelo backend nas escritas (CSRF)
  const res = await fetch(BASE + path, { credentials: "include", ...init, headers });
  if (res.status === 401 && !init?.retried && !path.startsWith("/api/auth/") && (await refreshSession())) {
    return api<T>(path, { ...init, retried: true });
  }
  if (!res.ok) {
    let message = "Não foi possível carregar. Tente novamente.";
    let fields: Record<string, string[]> | undefined;
    try {
      const body = (await res.json()) as { error?: { message?: string; fields?: Record<string, string[]> } };
      message = body.error?.message ?? message;
      fields = body.error?.fields;
    } catch {
      /* resposta sem JSON */
    }
    throw new ApiError(res.status, message, fields);
  }
  if (res.status === 204) return undefined as T; // sem corpo (ex.: logout, exclusão)
  return (await res.json()) as T;
}

export const post = <T>(path: string, body: unknown, headers?: Record<string, string>, signal?: AbortSignal) =>
  api<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    ...(signal && { signal }),
  });

/** Baixa um arquivo protegido por sessão (ex.: relatório CSV) e entrega ao navegador. */
export async function downloadFile(path: string, fallbackName: string, body?: unknown): Promise<void> {
  const res = await fetch(BASE + path, {
    credentials: "include",
    ...(body !== undefined && { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "mavi" }, body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    let message = "Não foi possível gerar o arquivo.";
    try { message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message; } catch { /* sem JSON */ }
    throw new ApiError(res.status, message);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
