// shortlink-personal：Rei 的个人短链服务（s.rei8t.dev）
//
//   GET  /:code              302 跳转到长链接（KV），不存在则 404
//   GET  /admin              后台（仅 ADMIN_EMAILS 里的 Google 账号）
//   GET  /auth/login | /auth/callback, POST /auth/logout   Google OAuth
//   GET  /api/links          列出短链        POST /api/links { url, code?, note? }   新建
//   DELETE /api/links/:code  删除
import { callback, getAdmin, login, logout } from "./auth.ts";
import { clickStatsEnabled, type Env } from "./env.ts";
import { CODE_RE, countClick, createLink, deleteLink, listLinks, resolve } from "./links.ts";
import { adminPage, homePage, loginPage, notFoundPage } from "./pages.ts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/** 写操作要求同源（Origin 头），配合 SameSite=Lax cookie 防 CSRF。 */
const sameOrigin = (req: Request) => {
  const o = req.headers.get("Origin");
  return o === null ? req.method === "GET" : o === new URL(req.url).origin;
};

async function handleApi(req: Request, env: Env, path: string): Promise<Response> {
  if (!(await getAdmin(req, env))) return json({ error: "未登录或无权限" }, 401);
  if (req.method !== "GET" && !sameOrigin(req)) return json({ error: "来源不合法" }, 403);

  if (path === "/api/links") {
    if (req.method === "GET") return json({ links: await listLinks(env, clickStatsEnabled(env)) });
    if (req.method === "POST") {
      const body = (await req.json().catch(() => null)) as { url?: string; code?: string; note?: string } | null;
      if (!body || typeof body.url !== "string") return json({ error: "缺少长链接 url" }, 400);
      const r = await createLink(env, { url: body.url, code: typeof body.code === "string" ? body.code : undefined, note: typeof body.note === "string" ? body.note : undefined });
      return "error" in r ? json({ error: r.error }, r.status) : json({ link: r.link }, 201);
    }
    return json({ error: "不支持的方法" }, 405);
  }
  const m = path.match(/^\/api\/links\/([^/]+)$/);
  if (m && req.method === "DELETE") {
    const code = decodeURIComponent(m[1]!);
    return (await deleteLink(env, code)) ? json({ ok: true }) : json({ error: "短码不存在" }, 404);
  }
  return json({ error: "未找到" }, 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/auth/login" && req.method === "GET") return login(req, env);
    if (path === "/auth/callback" && req.method === "GET") return callback(req, env);
    if (path === "/auth/logout" && req.method === "POST") return logout(req);
    if (path.startsWith("/api/")) return handleApi(req, env, path);
    if (path === "/admin" || path === "/admin/") {
      const user = await getAdmin(req, env);
      return user ? adminPage(user, url.origin, clickStatsEnabled(env)) : loginPage(url.searchParams.get("login_error"));
    }
    if (path === "/health") return json({ ok: true });
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
    if (path === "/" && (req.method === "GET" || req.method === "HEAD")) return homePage();

    // /:code → 302
    if (req.method === "GET" || req.method === "HEAD") {
      const code = decodeURIComponent(path.slice(1).replace(/\/$/, ""));
      if (CODE_RE.test(code)) {
        const target = await resolve(env, code);
        if (target) {
          if (clickStatsEnabled(env)) ctx.waitUntil(countClick(env, code).catch((e) => console.error("countClick", e)));
          return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "private, max-age=0", "Referrer-Policy": "no-referrer-when-downgrade" } });
        }
      }
      return notFoundPage();
    }
    return new Response("Method Not Allowed", { status: 405 });
  },
} satisfies ExportedHandler<Env>;
