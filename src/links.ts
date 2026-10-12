// 短码 -> 长链接，存在 Workers KV。
//   key   link:<code>
//   value 长链接（纯字符串，跳转只需一次 get）
//   meta  { createdAt, note? }（list 时直接带回，后台列表不用逐条 get）
// 点击统计（CLICK_STATS=on 时，预留）：clicks:<code> -> 次数。KV 不是原子计数，高并发下会少计；
// 需要精确统计时换成 Analytics Engine 或 D1（见 README）。
import { codeLength, type Env } from "./env.ts";

export interface LinkMeta { createdAt: string; note?: string }
export interface Link extends LinkMeta { code: string; url: string; clicks?: number }

const LINK_PREFIX = "link:";
const CLICKS_PREFIX = "clicks:";
export const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** 被路由占用、不能当短码的路径。 */
export const RESERVED = new Set(["admin", "auth", "api", "favicon.ico", "robots.txt", "health"]);
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混的 0 O o 1 l I

export function validateCode(code: string): string | null {
  if (!CODE_RE.test(code)) return "短码只能包含字母、数字、- 和 _，最长 64 位";
  if (RESERVED.has(code.toLowerCase())) return `「${code}」是系统保留路径`;
  return null;
}

export function validateUrl(raw: string): { url: string } | { error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: "长链接格式不对，需要以 http:// 或 https:// 开头" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "只支持 http / https 链接" };
  if (u.toString().length > 4096) return { error: "长链接太长（上限 4096 字符）" };
  return { url: u.toString() };
}

export function randomCode(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const resolve = (env: Env, code: string) => env.LINKS.get(LINK_PREFIX + code);

export async function createLink(
  env: Env,
  input: { url: string; code?: string; note?: string },
): Promise<{ link: Link } | { error: string; status: number }> {
  const checked = validateUrl(input.url ?? "");
  if ("error" in checked) return { error: checked.error, status: 400 };
  const note = input.note?.trim().slice(0, 200) || undefined;

  let code = input.code?.trim();
  if (code) {
    const bad = validateCode(code);
    if (bad) return { error: bad, status: 400 };
    if ((await resolve(env, code)) !== null) return { error: `短码「${code}」已被占用`, status: 409 };
  } else {
    for (let i = 0; ; i++) {
      code = randomCode(codeLength(env) + Math.floor(i / 3));
      if ((await resolve(env, code)) === null) break;
    }
  }
  const meta: LinkMeta = { createdAt: new Date().toISOString(), ...(note ? { note } : {}) };
  await env.LINKS.put(LINK_PREFIX + code, checked.url, { metadata: meta });
  return { link: { code, url: checked.url, ...meta } };
}

export async function deleteLink(env: Env, code: string): Promise<boolean> {
  if ((await resolve(env, code)) === null) return false;
  await Promise.all([env.LINKS.delete(LINK_PREFIX + code), env.LINKS.delete(CLICKS_PREFIX + code)]);
  return true;
}

/** 列出全部短链（个人用量，翻完所有分页；按创建时间倒序）。 */
export async function listLinks(env: Env, withClicks: boolean): Promise<Link[]> {
  const out: Link[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.LINKS.list<LinkMeta>({ prefix: LINK_PREFIX, cursor });
    const urls = await Promise.all(page.keys.map((k) => env.LINKS.get(k.name)));
    page.keys.forEach((k, i) => {
      const url = urls[i];
      if (url == null) return;
      out.push({ code: k.name.slice(LINK_PREFIX.length), url, createdAt: k.metadata?.createdAt ?? "", ...(k.metadata?.note ? { note: k.metadata.note } : {}) });
    });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  if (withClicks) {
    const counts = await Promise.all(out.map((l) => env.LINKS.get(CLICKS_PREFIX + l.code)));
    out.forEach((l, i) => (l.clicks = Number(counts[i] ?? 0) || 0));
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 点击 +1（预留功能，在 waitUntil 里跑，不拖慢跳转）。 */
export async function countClick(env: Env, code: string): Promise<void> {
  const key = CLICKS_PREFIX + code;
  const n = Number((await env.LINKS.get(key)) ?? 0) || 0;
  await env.LINKS.put(key, String(n + 1));
}
