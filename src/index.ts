// shortlink-personal：Rei 的个人短链服务（s.rei8t.dev）
//
//   GET  /:code              跳转（过期 → 410；密码 → 输入页；警告页；设备/国家分流；爬虫 → OG 预览）
//   POST /:code              提交访问密码
//   GET  /admin              后台（仅 ADMIN_EMAILS 里的 Google 账号）
//   GET  /auth/login | /auth/callback, POST /auth/logout   Google OAuth
//   GET  /api/links                     列出短链（+ 近 90 天点击）
//   POST /api/links                     新建
//   PUT  /api/links/:code               编辑
//   DELETE /api/links/:code             删除
//   GET  /api/links/:code/stats?days=7  访问统计明细
//   POST /api/links/:code/og-image      随机一张 vector-wallpapers 壁纸做预览图
//   GET  /og/:code.png                  预览图（公开，给爬虫）
import { clickTotals, linkStats, recordClick } from "./analytics.ts";
import { callback, getAdmin, login, logout } from "./auth.ts";
import { statsQueryable, statsRecording, type Env } from "./env.ts";
import { CODE_RE, createLink, deleteLink, getLink, InputError, isExpired, listLinks, updateLink, type LinkInput } from "./links.ts";
import { previewPage, renderPage } from "./html.ts";
import type { LoginError } from "./shared/types.ts";
import { checkPassword } from "./password.ts";
import { pickTarget, visitorOf } from "./visitor.ts";
import { deleteOgImage, randomOgImage, serveOgImage, syncOgImage } from "./ogimage.ts";

const LOGIN_ERRORS = new Set(["unconfigured", "denied", "state", "token", "id_token", "unverified", "forbidden"]);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

/** 写操作要求同源（Origin 头），配合 SameSite=Lax cookie 防 CSRF。 */
const sameOrigin = (req: Request) => {
  const o = req.headers.get("Origin");
  return o === null ? req.method === "GET" : o === new URL(req.url).origin;
};

async function readInput(req: Request): Promise<LinkInput> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("请求体需要是 JSON 对象");
  return body as LinkInput;
}

async function handleApi(req: Request, env: Env, path: string): Promise<Response> {
  if (!(await getAdmin(req, env))) return json({ error: "未登录或无权限" }, 401);
  if (req.method !== "GET" && !sameOrigin(req)) return json({ error: "来源不合法" }, 403);
  try {
    if (path === "/api/links") {
      if (req.method === "GET") {
        const [links, clicks] = await Promise.all([listLinks(env), clickTotals(env)]);
        return json({ links, clicks });
      }
      if (req.method === "POST") return json({ link: await createLink(env, await readInput(req)) }, 201);
      return json({ error: "不支持的方法" }, 405);
    }
    const stats = path.match(/^\/api\/links\/([^/]+)\/stats$/);
    if (stats && req.method === "GET") {
      if (!statsQueryable(env)) return json({ error: "统计查询未配置（需要 ANALYTICS 绑定、CF_ACCOUNT_ID、CF_API_TOKEN）" }, 503);
      const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
      return json(await linkStats(env, decodeURIComponent(stats[1]!), days));
    }
    const og = path.match(/^\/api\/links\/([^/]+)\/og-image$/);
    if (og && req.method === "POST") {
      const code = decodeURIComponent(og[1]!);
      const link = await getLink(env, code);
      if (!link) return json({ error: "短码不存在" }, 404);
      return json(await randomOgImage(env, new URL(req.url).origin, code, link.expiresAt));
    }
    const one = path.match(/^\/api\/links\/([^/]+)$/);
    if (one) {
      const code = decodeURIComponent(one[1]!);
      if (req.method === "PUT") {
        const link = await updateLink(env, code, await readInput(req));
        await syncOgImage(env, new URL(req.url).origin, code, link);
        return json({ link });
      }
      if (req.method === "DELETE") {
        if (!(await deleteLink(env, code))) return json({ error: "短码不存在" }, 404);
        await deleteOgImage(env, code);
        return json({ ok: true });
      }
      return json({ error: "不支持的方法" }, 405);
    }
    return json({ error: "未找到" }, 404);
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, e.status);
    console.error("api error", e);
    return json({ error: e instanceof Error ? e.message : "服务器错误" }, 500);
  }
}

async function handleRedirect(req: Request, env: Env, ctx: ExecutionContext, code: string): Promise<Response> {
  const link = await getLink(env, code);
  if (!link) return renderPage(env, req, { kind: "notfound" }, 404);
  if (isExpired(link)) return renderPage(env, req, { kind: "expired" }, 410);

  const v = visitorOf(req);
  const shortUrl = new URL("/" + code, req.url).toString();

  // 社交平台爬虫：有自定义预览就返回 OG 页；有密码时不暴露目标地址
  if (v.bot && link.og && req.method !== "POST") return previewPage(link.og, shortUrl, link.password ? null : pickTarget(link, v, req.headers.get("User-Agent") ?? ""));

  if (link.password) {
    if (req.method !== "POST") return renderPage(env, req, { kind: "password", code, wrong: false });
    const form = await req.formData().catch(() => null);
    const pw = form?.get("password");
    if (typeof pw !== "string" || !(await checkPassword(pw, link.password))) {
      return renderPage(env, req, { kind: "password", code, wrong: true }, 401);
    }
  }

  const target = pickTarget(link, v, req.headers.get("User-Agent") ?? "");
  ctx.waitUntil(Promise.resolve().then(() => recordClick(env, code, v)).catch((e) => console.error("recordClick", e)));
  if (link.unsafe) return renderPage(env, req, { kind: "warning", target });
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer-when-downgrade" },
  });
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
      if (user) {
        return renderPage(env, req, {
          kind: "admin",
          user: { email: user.email, ...(user.name ? { name: user.name } : {}), ...(user.picture ? { picture: user.picture } : {}) },
          origin: url.origin,
          stats: { recording: statsRecording(env), queryable: statsQueryable(env), missing: (["CF_ACCOUNT_ID", "CF_API_TOKEN"] as const).filter((k) => !env[k]) },
        });
      }
      const err = url.searchParams.get("login_error");
      return renderPage(env, req, { kind: "login", error: LOGIN_ERRORS.has(err ?? "") ? (err as LoginError) : null });
    }
    const ogPng = path.match(/^\/og\/([^/]+)\.png$/);
    if (ogPng && (req.method === "GET" || req.method === "HEAD")) {
      let code = "";
      try { code = decodeURIComponent(ogPng[1]!); } catch { /* bad escape */ }
      return CODE_RE.test(code) ? serveOgImage(env, code) : new Response("Not Found", { status: 404 });
    }
    if (path === "/health") return json({ ok: true });
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain" } });
    if (path === "/" && (req.method === "GET" || req.method === "HEAD")) return renderPage(env, req, { kind: "home" });
    // 前端静态资源（正常情况下由 Static Assets 直接响应，不会走到这里）
    if (path.startsWith("/assets/") && env.ASSETS) return env.ASSETS.fetch(req);

    if (req.method === "GET" || req.method === "HEAD" || req.method === "POST") {
      let code = "";
      try { code = decodeURIComponent(path.slice(1).replace(/\/$/, "")); } catch { /* bad escape */ }
      if (CODE_RE.test(code)) return handleRedirect(req, env, ctx, code);
      return renderPage(env, req, { kind: "notfound" }, 404);
    }
    return new Response("Method Not Allowed", { status: 405 });
  },
} satisfies ExportedHandler<Env>;
