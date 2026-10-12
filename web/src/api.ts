import type { LinkInput, LinkStats, LinkView, ListResponse } from "../../src/shared/types.ts";

export class ApiError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (res.status === 401) {
    location.href = "/admin";
    throw new ApiError("登录已失效");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `请求失败（${res.status}）`);
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  list: () => request<ListResponse>("/api/links"),
  create: (input: LinkInput) => request<{ link: LinkView }>("/api/links", { method: "POST", body: JSON.stringify(input) }),
  randomOgImage: (code: string) => request<{ image: string; pattern: string }>(`/api/links/${enc(code)}/og-image`, { method: "POST" }),
  update: (code: string, input: LinkInput) => request<{ link: LinkView }>(`/api/links/${enc(code)}`, { method: "PUT", body: JSON.stringify(input) }),
  remove: (code: string) => request<{ ok: true }>(`/api/links/${enc(code)}`, { method: "DELETE" }),
  stats: (code: string, days: number) => request<LinkStats>(`/api/links/${enc(code)}/stats?days=${days}`),
};
