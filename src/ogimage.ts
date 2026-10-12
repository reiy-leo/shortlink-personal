// 社交预览图：通过 Service Binding 调 vector-wallpapers 的 OgImage.render(seed) 随机生成壁纸 PNG，
// 存到本 Worker 的 KV（`ogimg:<code>`），再以 /og/<code>.png 公开给爬虫——每张图只渲染一次。
import type { Env } from "./env.ts";

const KEY = (code: string) => `ogimg:${code}`;

export interface WallpaperService {
  render(seed: number, width?: number, height?: number): Promise<{ png: ArrayBuffer; pattern: string; preset?: string }>;
}

export const ogImageReady = (env: Env) => Boolean(env.WALLPAPERS);

/** KV 过期时间跟着短链走：短链过期，图片同时被 KV 自动删除（KV 要求至少 60 秒后）。 */
function expiryOpts(expiresAt: string | undefined): { expiration?: number } {
  if (!expiresAt) return {};
  const t = Math.floor(Date.parse(expiresAt) / 1000);
  return Number.isFinite(t) ? { expiration: Math.max(t, Math.floor(Date.now() / 1000) + 60) } : {};
}

const ownUrl = (origin: string, code: string) => `${origin}/og/${encodeURIComponent(code)}.png`;

/** 随机一张壁纸作为 code 的预览图，返回公开地址（带 ?v=seed，换图后爬虫不会拿到旧缓存）。 */
export async function randomOgImage(env: Env, origin: string, code: string, expiresAt?: string): Promise<{ image: string; pattern: string }> {
  if (!env.WALLPAPERS) throw new Error("没有配置 WALLPAPERS（vector-wallpapers 的 Service Binding）");
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const { png, pattern } = await env.WALLPAPERS.render(seed, 1200, 630);
  await env.LINKS.put(KEY(code), png, { metadata: { seed, pattern }, ...expiryOpts(expiresAt) });
  return { image: `${ownUrl(origin, code)}?v=${seed}`, pattern };
}

export async function serveOgImage(env: Env, code: string): Promise<Response> {
  const png = await env.LINKS.get(KEY(code), "arrayBuffer");
  if (!png) return new Response("Not Found", { status: 404 });
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}

/**
 * 短链保存后同步图片：预览图不再指向自己的 /og/<code>.png（清空或换成别的地址）→ 删图；
 * 否则按短链当前的过期时间重写一次（改了过期时间，图片的 KV 过期时间也跟着改）。
 */
export async function syncOgImage(env: Env, origin: string, code: string, link: { expiresAt?: string; og?: { image?: string } }): Promise<void> {
  if (!link.og?.image?.startsWith(ownUrl(origin, code))) return void (await deleteOgImage(env, code));
  const { value, metadata } = await env.LINKS.getWithMetadata(KEY(code), "arrayBuffer");
  if (value) await env.LINKS.put(KEY(code), value, { ...(metadata ? { metadata } : {}), ...expiryOpts(link.expiresAt) });
}

export const deleteOgImage = (env: Env, code: string) => env.LINKS.delete(KEY(code));
