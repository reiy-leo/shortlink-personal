// 用内存 KV / 假 Analytics Engine 跑核心流程：node --experimental-strip-types test/run-tests.ts
import assert from "node:assert/strict";
import worker from "../src/index.ts";
import type { Env } from "../src/env.ts";
import { adminPage } from "../src/pages.ts";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

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
const env = {
  LINKS: new MemKV(), ANALYTICS: { writeDataPoint: (p: unknown) => points.push(p) },
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

// 社交预览：爬虫拿到 OG 标签，且不计入统计
await api("/api/links/hi", "PUT", { og: { title: "你好 <世界>", image: "https://img.example.com/a.png" } });
const before = points.length;
r = await visit("/hi", "TelegramBot (like TwitterBot)");
const html = await r.text();
assert.equal(r.status, 200);
assert.match(html, /og:title" content="你好 &lt;世界&gt;"/);
assert.match(html, /og:image" content="https:\/\/img.example.com\/a.png"/);
await Promise.all(waits);
assert.equal(points.length, before);

// 链接控制：密码
await api("/api/links/hi", "PUT", { password: "s3cret" });
const list = ((await (await api("/api/links")).json()) as any).links;
const hi = list.find((l: any) => l.code === "hi");
assert.equal(hi.hasPassword, true);
assert.equal(hi.password, undefined);
assert.equal((await visit("/hi")).status, 200); // 密码页
assert.doesNotMatch(await (await visit("/hi", "Slackbot-LinkExpanding 1.0")).text(), /example\.com\/a\?b=1|refresh/); // 预览不泄露目标
const form = (pw: string) => visit("/hi", MAC, { method: "POST", body: new URLSearchParams({ password: pw }) });
assert.equal((await form("nope")).status, 401);
r = await form("s3cret");
assert.equal(r.status, 302);
assert.equal(r.headers.get("Location"), "https://example.com/a?b=1");
await api("/api/links/hi", "PUT", { password: null });
assert.equal((await visit("/hi")).status, 302);

// 链接控制：警告页、过期
await api("/api/links/hi", "PUT", { unsafe: true });
r = await visit("/hi");
assert.equal(r.status, 200);
assert.match(await r.text(), /安全提示/);
await api("/api/links/hi", "PUT", { unsafe: false, expiresAt: new Date(Date.now() - 1000).toISOString() });
assert.equal((await visit("/hi")).status, 410);
await api("/api/links/hi", "PUT", { expiresAt: null });
assert.equal((await visit("/hi")).status, 302);

// 删除 + CSRF
assert.equal((await worker.fetch(new Request(L + "/api/links/hi", { method: "DELETE", headers: { Origin: "https://evil.com" } }) as any, env, ctx)).status, 403);
assert.equal((await api("/api/links/hi", "DELETE")).status, 200);
assert.equal((await visit("/hi")).status, 404);

// 线上域名不吃 AUTH_DISABLED
assert.equal((await worker.fetch(new Request("https://s.rei8t.dev/api/links") as any, env, ctx)).status, 401);
assert.equal((await worker.fetch(new Request("https://s.rei8t.dev/admin") as any, env, ctx)).status, 200);

// 后台内联脚本语法检查
const page = await adminPage({ sub: "x", email: "x", exp: 0 }, "https://s.rei8t.dev", { recording: true, queryable: true }).text();
const script = page.match(/<script>([\s\S]*)<\/script>/)![1]!;
writeFileSync("/tmp/sl-admin.js", script);
execFileSync(process.execPath, ["--check", "/tmp/sl-admin.js"]);

console.log("✓ all tests passed");
