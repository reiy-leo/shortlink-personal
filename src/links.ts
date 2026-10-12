// 短链存储：Workers KV，key `link:<code>`，value 为 LinkRecord 的 JSON。
// metadata 只放 createdAt，用于排序；后台列表直接 get 每条（个人用量足够）。
import { codeLength, type Env } from "./env.ts";
import { hashPassword, type PasswordHash } from "./password.ts";

export interface DeviceRules { ios?: string; android?: string; mobile?: string; desktop?: string }
export interface OgMeta { title?: string; description?: string; image?: string }

export interface LinkRecord {
  url: string;
  createdAt: string;
  updatedAt?: string;
  note?: string;
  /** ISO 时间，过期后返回 410。 */
  expiresAt?: string;
  password?: PasswordHash;
  /** 跳转前显示「不安全链接」警告页。 */
  unsafe?: boolean;
  /** 智能跳转：按设备。 */
  devices?: DeviceRules;
  /** 智能跳转：按国家（ISO 两位代码，大写）。 */
  countries?: Record<string, string>;
  /** 社交预览（爬虫访问时返回 OG 标签）。 */
  og?: OgMeta;
}

/** 给后台看的视图：去掉密码哈希。 */
export type LinkView = Omit<LinkRecord, "password"> & { code: string; hasPassword: boolean };

/** 新建 / 编辑的输入。编辑时缺省字段 = 保持不变；空字符串 / null = 清除。 */
export interface LinkInput {
  url?: string;
  code?: string;
  note?: string | null;
  expiresAt?: string | null;
  /** 新密码；null = 移除密码。 */
  password?: string | null;
  unsafe?: boolean;
  devices?: DeviceRules | null;
  countries?: Record<string, string> | null;
  og?: OgMeta | null;
}

const PREFIX = "link:";
export const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** 被路由占用、不能当短码的路径。 */
export const RESERVED = new Set(["admin", "auth", "api", "favicon.ico", "robots.txt", "health"]);
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混的 0 O o 1 l I

export class InputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateCode(code: string): void {
  if (!CODE_RE.test(code)) throw new InputError("短码只能包含字母、数字、- 和 _，最长 64 位");
  if (RESERVED.has(code.toLowerCase())) throw new InputError(`「${code}」是系统保留路径`);
}

export function cleanUrl(raw: unknown, label = "长链接"): string {
  if (typeof raw !== "string" || !raw.trim()) throw new InputError(`${label}不能为空`);
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new InputError(`${label}格式不对，需要以 http:// 或 https:// 开头`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new InputError(`${label}只支持 http / https`);
  if (u.toString().length > 4096) throw new InputError(`${label}太长（上限 4096 字符）`);
  return u.toString();
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

function cleanDevices(d: DeviceRules | null | undefined): DeviceRules | undefined {
  if (!d) return undefined;
  const out: DeviceRules = {};
  const names: Record<keyof DeviceRules, string> = { ios: "iOS 链接", android: "Android 链接", mobile: "手机链接", desktop: "桌面链接" };
  for (const k of Object.keys(names) as (keyof DeviceRules)[]) {
    if (typeof d[k] === "string" && d[k]!.trim()) out[k] = cleanUrl(d[k], names[k]);
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanCountries(c: Record<string, string> | null | undefined): Record<string, string> | undefined {
  if (!c) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) {
    const cc = k.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) throw new InputError(`国家代码「${k}」不对，要用两位 ISO 代码，如 CN、US、JP`);
    out[cc] = cleanUrl(v, `${cc} 的链接`);
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanOg(o: OgMeta | null | undefined): OgMeta | undefined {
  if (!o) return undefined;
  const out: OgMeta = {};
  const t = text(o.title, 200), d = text(o.description, 500);
  if (t) out.title = t;
  if (d) out.description = d;
  if (typeof o.image === "string" && o.image.trim()) out.image = cleanUrl(o.image, "预览图片");
  return Object.keys(out).length ? out : undefined;
}

function cleanExpiry(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new InputError("过期时间格式不对");
  return new Date(t).toISOString();
}

/** 把输入合并到已有记录（新建时 base 为 null）。 */
async function apply(base: LinkRecord | null, input: LinkInput): Promise<LinkRecord> {
  const now = new Date().toISOString();
  const rec: LinkRecord = base ? { ...base, updatedAt: now } : { url: "", createdAt: now };
  if (input.url !== undefined || !base) rec.url = cleanUrl(input.url);
  if (input.note !== undefined) rec.note = text(input.note, 200);
  if (input.expiresAt !== undefined) rec.expiresAt = cleanExpiry(input.expiresAt);
  if (input.password !== undefined) {
    if (input.password === null || input.password === "") rec.password = undefined;
    else if (input.password.length > 200) throw new InputError("密码太长");
    else rec.password = await hashPassword(input.password);
  }
  if (input.unsafe !== undefined) rec.unsafe = input.unsafe ? true : undefined;
  if (input.devices !== undefined) rec.devices = cleanDevices(input.devices);
  if (input.countries !== undefined) rec.countries = cleanCountries(input.countries);
  if (input.og !== undefined) rec.og = cleanOg(input.og);
  // 去掉 undefined，KV 里保持干净
  return JSON.parse(JSON.stringify(rec));
}

export const isExpired = (l: LinkRecord, at = Date.now()) => Boolean(l.expiresAt && Date.parse(l.expiresAt) <= at);

export function toView(code: string, l: LinkRecord): LinkView {
  const { password, ...rest } = l;
  return { code, ...rest, hasPassword: Boolean(password) };
}

export async function getLink(env: Env, code: string): Promise<LinkRecord | null> {
  const raw = await env.LINKS.get(PREFIX + code);
  if (raw === null) return null;
  if (!raw.startsWith("{")) return { url: raw, createdAt: "" }; // 兼容早期纯字符串 value
  try {
    return JSON.parse(raw) as LinkRecord;
  } catch {
    return null;
  }
}

const save = (env: Env, code: string, rec: LinkRecord) =>
  env.LINKS.put(PREFIX + code, JSON.stringify(rec), { metadata: { createdAt: rec.createdAt } });

export function randomCode(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export async function createLink(env: Env, input: LinkInput): Promise<LinkView> {
  const rec = await apply(null, input);
  let code = input.code?.trim();
  if (code) {
    validateCode(code);
    if ((await getLink(env, code)) !== null) throw new InputError(`短码「${code}」已被占用`, 409);
  } else {
    for (let i = 0; ; i++) {
      code = randomCode(codeLength(env) + Math.floor(i / 3));
      if ((await getLink(env, code)) === null) break;
    }
  }
  await save(env, code, rec);
  return toView(code, rec);
}

export async function updateLink(env: Env, code: string, input: LinkInput): Promise<LinkView> {
  const base = await getLink(env, code);
  if (!base) throw new InputError("短码不存在", 404);
  const rec = await apply(base, input);
  await save(env, code, rec);
  return toView(code, rec);
}

export async function deleteLink(env: Env, code: string): Promise<boolean> {
  if ((await getLink(env, code)) === null) return false;
  await env.LINKS.delete(PREFIX + code);
  return true;
}

/** 列出全部短链（翻完所有分页；按创建时间倒序）。 */
export async function listLinks(env: Env): Promise<LinkView[]> {
  const codes: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.LINKS.list({ prefix: PREFIX, cursor });
    for (const k of page.keys) codes.push(k.name.slice(PREFIX.length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const recs = await Promise.all(codes.map((c) => getLink(env, c)));
  const out: LinkView[] = [];
  recs.forEach((r, i) => r && out.push(toView(codes[i]!, r)));
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
