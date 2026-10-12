// 用内存 KV 跑一遍核心流程：node --experimental-strip-types test/run-tests.ts
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

const waits: Promise<unknown>[] = [];
const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
const env = { LINKS: new MemKV(), AUTH_DISABLED: "true", CLICK_STATS: "on", ADMIN_EMAILS: "reiy.leoz@gmail.com" } as unknown as Env;
const L = "http://localhost:8787";
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(L + path, init) as any, env, ctx);
const post = (body: unknown) => call("/api/links", { method: "POST", headers: { "Content-Type": "application/json", Origin: L }, body: JSON.stringify(body) });

let r = await post({ url: "https://example.com/a?b=1", code: "hi", note: "测试" });
assert.equal(r.status, 201);
assert.equal((await post({ url: "https://example.com", code: "hi" })).status, 409);
assert.equal((await post({ url: "javascript:alert(1)" })).status, 400);
assert.equal((await post({ url: "https://x.com", code: "admin" })).status, 400);
r = await post({ url: "https://example.com/auto" });
const auto = ((await r.json()) as any).link.code;
assert.equal(auto.length, 6);

r = await call("/hi");
assert.equal(r.status, 302);
assert.equal(r.headers.get("Location"), "https://example.com/a?b=1");
await Promise.all(waits);
const { links } = (await (await call("/api/links")).json()) as any;
assert.equal(links.length, 2);
assert.equal(links.find((l: any) => l.code === "hi").clicks, 1);

assert.equal((await call("/api/links/hi", { method: "DELETE", headers: { Origin: "https://evil.com" } })).status, 403);
assert.equal((await call("/api/links/hi", { method: "DELETE", headers: { Origin: L } })).status, 200);
assert.equal((await call("/hi")).status, 404);

// 线上域名不吃 AUTH_DISABLED，没有 cookie 一律 401
const prod = await worker.fetch(new Request("https://s.rei8t.dev/api/links") as any, env, ctx);
assert.equal(prod.status, 401);
assert.equal((await worker.fetch(new Request("https://s.rei8t.dev/admin") as any, env, ctx)).status, 200); // 登录页
console.log("✓ all tests passed");
