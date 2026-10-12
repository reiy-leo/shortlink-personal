// 用内存 KV / 假 Analytics Engine 跑核心流程：node --experimental-strip-types test/run-tests.ts
import assert from "node:assert/strict";
import worker from "../src/index.ts";
import type { Env } from "../src/env.ts";

class MemKV {
  m = new Map<string, { v: string; meta?: unknown }>();
  async get(k: string) { return this.m.get(k)?.v ?? null; }
  async put(k: string, v: string, o?: { metadata?: unknown }) { this.m.set(k, { v, meta: o?.metadata }); }
  async delete(k: string) { this.m.delete(k); }
  async list({ prefix = "" }: { prefix?: string }) {
    return { keys: [...this.m].filter(([k]) => k.startsWith(prefix)).map(([name, e]) => ({ name, metadata: e.meta })), list_complete: true, cursor: "" };
  }
}
const points: any[] = [];
const waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
// 假的 Static Assets：只提供前端壳 index.html
const SHELL = "<!doctype html><html><head><!--PAGE_DATA--></head><body><div id=root></div></body></html>";
const ASSETS = { fetch: async (u: string | URL | Request) => new URL(u instanceof Request ? u.url : u).pathname === "/index.html" ? new Response(SHELL) : new Response("nf", { status: 404 }) };
/** 从页面里取出 Worker 注入的数据 */
const pageOf = async (r: Response) => JSON.parse((await r.text()).match(/<script id="page-data" type="application\/json">(.*?)<\/script>/)![1]!);

const env = {
  LINKS: new MemKV(), ASSETS, ANALYTICS: { writeDataPoint: (p: unknown) => points.push(p) },
  AUTH_DISABLED: "true", ADMIN_EMAILS: "reiy.leoz@gmail.com",
} as unknown as Env;
const L = "http://localhost:8787";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const visit = (path: string, ua = MAC, extra: RequestInit & { cf?: unknown } = {}) => {
  const req = new Request(L + path, { ...extra, headers: { "User-Agent": ua, ...(extra.headers ?? {}) } });
  if (extra.cf) Object.defineProperty(req, "cf", { value: extra.cf });
  return worker.fetch(req as any, env, ctx);
};
const api = (path: string, method = "GET", body?: unknown) =>
  worker.fetch(new Request(L + path, { method, headers: { "Content-Type": "application/json", Origin: L }, body: body ? JSON.stringify(body) : undefined }) as any, env, ctx);

// 基本：新建、冲突、校验
assert.equal((await api("/api/links", "POST", { url: "https://example.com/a?b=1", code: "hi", note: "测试" })).status, 201);
assert.equal((await api("/api/links", "POST", { url: "https://example.com", code: "hi" })).status, 409);
assert.equal((await api("/api/links", "POST", { url: "javascript:alert(1)" })).status, 400);
assert.equal((await api("/api/links", "POST", { url: "https://x.com", code: "admin" })).status, 400);
assert.equal((await api("/api/links", "POST", { url: "https://x.com", countries: { CHN: "https://x.cn" } })).status, 400);
const auto = ((await (await api("/api/links", "POST", { url: "https://example.com/auto" })).json()) as any).link.code;
assert.equal(auto.length, 6);

let r = await visit("/hi");
assert.equal(r.status, 302);
assert.equal(r.headers.get("Location"), "https://example.com/a?b=1");
await Promise.all(waits);
assert.equal(points.length, 1);
assert.deepEqual(points[0].indexes, ["hi"]);

// 智能跳转：设备优先，其次国家
await api("/api/links/hi", "PUT", { devices: { ios: "https://apps.apple.com/x" }, countries: { cn: "https://example.cn" } });
assert.equal((await visit("/hi", IPHONE, { cf: { country: "CN" } })).headers.get("Location"), "https://apps.apple.com/x");
assert.equal((await visit("/hi", MAC, { cf: { country: "CN" } })).headers.get("Location"), "https://example.cn/");
assert.equal((await visit("/hi", MAC, { cf: { country: "SG" } })).headers.get("Location"), "https://example.com/a?b=1");

// 爬虫照常跳转，但不计入统计
const before = points.length;
r = await visit("/hi", "TelegramBot (like TwitterBot)");
assert.equal(r.status, 302);
await Promise.all(waits);
assert.equal(points.length, before);

// 链接控制：密码
await api("/api/links/hi", "PUT", { password: "s3cret" });
const list = ((await (await api("/api/links")).json()) as any).links;
const hi = list.find((l: any) => l.code === "hi");
assert.equal(hi.hasPassword, true);
assert.equal(hi.password, undefined);
r = await visit("/hi");
assert.equal(r.status, 200);
assert.deepEqual(await pageOf(r), { kind: "password", code: "hi", wrong: false });
assert.doesNotMatch(await (await visit("/hi", "Slackbot-LinkExpanding 1.0")).text(), /example\.com\/a\?b=1|refresh/); // 预览不泄露目标
const form = (pw: string) => visit("/hi", MAC, { method: "POST", body: new URLSearchParams({ password: pw }) });
r = await form("nope");
assert.equal(r.status, 401);
assert.equal((await pageOf(r)).wrong, true);
r = await form("s3cret");
assert.equal(r.status, 302);
assert.equal(r.headers.get("Location"), "https://example.com/a?b=1");
await api("/api/links/hi", "PUT", { password: null });
assert.equal((await visit("/hi")).status, 302);

// 链接控制：警告页、过期
await api("/api/links/hi", "PUT", { unsafe: true });
r = await visit("/hi");
assert.equal(r.status, 200);
assert.deepEqual(await pageOf(r), { kind: "warning", target: "https://example.com/a?b=1" });
await api("/api/links/hi", "PUT", { unsafe: false, expiresAt: new Date(Date.now() - 1000).toISOString() });
r = await visit("/hi");
assert.equal(r.status, 410);
assert.equal((await pageOf(r)).kind, "expired");
await api("/api/links/hi", "PUT", { expiresAt: null });
assert.equal((await visit("/hi")).status, 302);

// 删除 + CSRF
assert.equal((await worker.fetch(new Request(L + "/api/links/hi", { method: "DELETE", headers: { Origin: "https://evil.com" } }) as any, env, ctx)).status, 403);
assert.equal((await api("/api/links/hi", "DELETE")).status, 200);
r = await visit("/hi");
assert.equal(r.status, 404);
assert.equal((await pageOf(r)).kind, "notfound");

// 线上域名不吃 AUTH_DISABLED
assert.equal((await worker.fetch(new Request("https://s.rei8t.dev/api/links") as any, env, ctx)).status, 401);
r = await worker.fetch(new Request("https://s.rei8t.dev/admin?login_error=forbidden") as any, env, ctx);
assert.deepEqual(await pageOf(r), { kind: "login", error: "forbidden" });
r = await worker.fetch(new Request("https://s.rei8t.dev/admin?login_error=<script>") as any, env, ctx);
assert.deepEqual(await pageOf(r), { kind: "login", error: null });

// 本地 AUTH_DISABLED 时后台拿到用户和统计配置
const admin = await pageOf(await visit("/admin"));
assert.equal(admin.kind, "admin");
assert.equal(admin.stats.recording, true);
assert.equal(admin.stats.queryable, false);

// 注入数据里的 </script> 被转义，不会截断
await api("/api/links", "POST", { url: "https://example.com/x?q=</script><script>alert(1)</script>", code: "xss", unsafe: true });
const raw = await (await visit("/xss")).text();
assert.doesNotMatch(raw, /<\/script><script>alert/);
assert.equal((await pageOf(new Response(raw))).target, "https://example.com/x?q=%3C/script%3E%3Cscript%3Ealert(1)%3C/script%3E");

// 前端没构建时有兜底页面
const bare = { ...env, ASSETS: undefined } as unknown as Env;
const fb = await worker.fetch(new Request(L + "/nope-404", { headers: { "User-Agent": MAC } }) as any, bare, ctx);
assert.equal(fb.status, 404);
assert.match(await fb.text(), /链接不存在/);


console.log("✓ all tests passed");

// —— 设备识别与规则回退 ——
{
  const { deviceOf, pickTarget } = await import("../src/visitor.ts");
  const UA = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    ipad: "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    harmony4: "Mozilla/5.0 (Linux; Android 12; HarmonyOS; NOH-AN00; HMSCore 6.11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99 Mobile Safari/537.36",
    harmonyNext: "Mozilla/5.0 (Phone; OpenHarmony 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 ArkWeb/4.1.6.1 Mobile",
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
    mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15",
    win: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  };
  assert.equal(deviceOf(UA.iphone), "iphone");
  assert.equal(deviceOf(UA.ipad), "ipad");
  assert.equal(deviceOf(UA.harmony4), "harmonyos");
  assert.equal(deviceOf(UA.harmonyNext), "harmonyos");
  assert.equal(deviceOf(UA.android), "android");
  assert.equal(deviceOf(UA.mac), "macos");
  assert.equal(deviceOf(UA.win), "windows");
  assert.equal(deviceOf(UA.linux), "desktop");
  const link = { url: "https://d", devices: { ios: "https://ios", android: "https://and", desktop: "https://pc" } } as any;
  const t = (k: keyof typeof UA) => pickTarget(link, { device: deviceOf(UA[k]), country: "XX" }, UA[k]);
  assert.equal(t("ipad"), "https://ios");
  assert.equal(t("harmony4"), "https://and"); // 老鸿蒙回退 Android
  assert.equal(t("harmonyNext"), "https://d");
  assert.equal(t("mac"), "https://pc");
  assert.equal(pickTarget({ ...link, devices: { ...link.devices, ipad: "https://pad" } }, { device: "ipad", country: "XX" }), "https://pad");
}
console.log("✓ 设备识别");
