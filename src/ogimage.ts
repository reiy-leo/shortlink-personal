// 社交预览图：通过 Service Binding 调 vector-wallpapers 的 OgImage.render(seed) 随机生成壁纸 PNG，
// 存到本 Worker 的 KV（`ogimg:<code>`），再以 /og/<code>.png 公开给爬虫——每张图只渲染一次。
import type { Env } from "./env.ts";

const KEY = (code: string) => `ogimg:${code}`;

export interface WallpaperService {
  render(seed: number, width?: number, height?: number): Promise<{ png: ArrayBuffer; pattern: string; preset?: string }>;
}

export const ogImageReady = (env: Env) => Boolean(env.WALLPAPERS);

/** 随机一张壁纸作为 code 的预览图，返回公开地址（带 ?v=seed，换图后爬虫不会拿到旧缓存）。 */
export async function randomOgImage(env: Env, origin: string, code: string): Promise<{ image: string; pattern: string }> {
  if (!env.WALLPAPERS) throw new Error("没有配置 WALLPAPERS（vector-wallpapers 的 Service Binding）");
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const { png, pattern } = await env.WALLPAPERS.render(seed, 1200, 630);
  await env.LINKS.put(KEY(code), png, { metadata: { seed, pattern } });
  return { image: `${origin}/og/${encodeURIComponent(code)}.png?v=${seed}`, pattern };
}

export async function serveOgImage(env: Env, code: string): Promise<Response> {
  const png = await env.LINKS.get(KEY(code), "arrayBuffer");
  if (!png) return new Response("Not Found", { status: 404 });
  return new Response(png, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}

export const deleteOgImage = (env: Env, code: string) => env.LINKS.delete(KEY(code));
