// 页面输出：所有界面都是同一个 React + Kumo 前端（web/ → public/），
// Worker 只负责挑页面、带上数据和正确的状态码。社交爬虫的 OG 预览页是唯一的服务端纯 HTML。
import type { Env } from "./env.ts";
import type { OgMeta, PageData } from "./shared/types.ts";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

/** 前端还没构建（public/ 为空）时的兜底，至少把信息说清楚。 */
const FALLBACK_TEXT: Record<PageData["kind"], string> = {
  admin: "后台前端尚未构建，请先运行 pnpm build。",
  login: "后台前端尚未构建，请先运行 pnpm build。",
  password: "这个链接需要密码。",
  warning: "这个链接被标记为可能不安全。",
  expired: "链接已过期。",
  notfound: "链接不存在。",
  home: "s.rei8t.dev",
};

/** 读 public/index.html，把页面数据塞进 <script id="page-data">。 */
export async function renderPage(env: Env, req: Request, data: PageData, status = 200): Promise<Response> {
  const headers = { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS };
  const shell = env.ASSETS ? await env.ASSETS.fetch(new URL("/index.html", req.url)).catch(() => null) : null;
  if (!shell || !shell.ok) {
    return new Response(`<!doctype html><meta charset="utf-8"><title>s.rei8t.dev</title><p>${esc(FALLBACK_TEXT[data.kind])}</p>`, { status, headers });
  }
  // JSON 放进 <script>：转义 < 防止 </script> 截断，同时挡住 U+2028/2029
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const html = (await shell.text()).replace(
    "<!--PAGE_DATA-->",
    `<script id="page-data" type="application/json">${json}</script>`,
  );
  return new Response(html, { status, headers });
}

/** 给社交平台爬虫的预览页：OG / Twitter 标签。target 为 null 时（有密码）不暴露目标地址。 */
export function previewPage(og: OgMeta, shortUrl: string, target: string | null): Response {
  const title = og.title ?? shortUrl;
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${esc(shortUrl)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    og.description ? `<meta property="og:description" content="${esc(og.description)}"><meta name="description" content="${esc(og.description)}">` : "",
    og.image ? `<meta property="og:image" content="${esc(og.image)}"><meta name="twitter:image" content="${esc(og.image)}">` : "",
    `<meta name="twitter:card" content="${og.image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    target ? `<meta http-equiv="refresh" content="0;url=${esc(target)}">` : "",
  ].join("");
  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>${tags}</head><body>${target ? `<a href="${esc(target)}">${esc(title)}</a>` : esc(title)}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } },
  );
}
