import { useSyncExternalStore } from "react";
import { ApiError, api, post, refreshSession } from "../lib/api";
import { bindAccount, mergeWithAccount } from "./useFavorites";

export type AuthUser = { id: string; email: string; name: string; role: string; permissions: string[] };
type State = { user: AuthUser | null; ready: boolean };

let state: State = { user: null, ready: false };
const listeners = new Set<() => void>();
const set = (next: State) => { state = next; bindAccount(next.user !== null); listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

type Me = { user: Omit<AuthUser, "permissions">; permissions: string[] };
const withPerms = (r: Me): AuthUser => ({ ...r.user, permissions: r.permissions ?? [] });

async function fetchMe(): Promise<AuthUser | null> {
  try {
    return withPerms(await api<Me>("/api/auth/me"));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && (await refreshSession())) {
      try { return withPerms(await api<Me>("/api/auth/me")); } catch { return null; }
    }
    return null;
  }
}

export async function loadUser() {
  const user = await fetchMe();
  set({ user, ready: true });
  if (user) void mergeWithAccount();
}
void loadUser();

export async function login(email: string, password: string) {
  const r = await post<Me>("/api/auth/login", { email, password });
  set({ user: withPerms(r), ready: true });
  void mergeWithAccount();
}

export async function register(p: { name: string; email: string; password: string; phone?: string }) {
  const r = await post<{ user: Omit<AuthUser, "permissions"> }>("/api/auth/register", { ...p, acceptTerms: true, marketingOptIn: false });
  set({ user: { ...r.user, permissions: [] }, ready: true });
  void mergeWithAccount();
}

export async function logout() {
  await post("/api/auth/logout", {}).catch(() => undefined);
  set({ user: null, ready: true });
}

export const useAuth = () => useSyncExternalStore(subscribe, () => state);
