// 访问统计：Workers Analytics Engine。
//   写：每次真正跳转写一个数据点（爬虫不计）
//     index1 = 短码
//     blob1 短码 · blob2 国家 · blob3 城市 · blob4 设备 · blob5 系统 · blob6 浏览器 · blob7 来源域名
//     double1 = 1
//   读：Analytics Engine SQL API（需要 CF_ACCOUNT_ID + CF_API_TOKEN），数据保留约 90 天。
import { datasetName, statsQueryable, statsRecording, type Env } from "./env.ts";
import { CODE_RE } from "./links.ts";
import type { Visitor } from "./visitor.ts";
import type { LinkStats } from "./shared/types.ts";

export function recordClick(env: Env, code: string, v: Visitor): void {
  if (!statsRecording(env) || v.bot) return;
  env.ANALYTICS!.writeDataPoint({
    indexes: [code],
    blobs: [code, v.country, v.city.slice(0, 64), v.device, v.os, v.browser, v.referer.slice(0, 128)],
    doubles: [1],
  });
}

async function sql<T>(env: Env, query: string): Promise<T[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: query,
  });
  if (!res.ok) throw new Error(`统计查询失败（${res.status}）：${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as { data?: T[] };
  return data.data ?? [];
}

const DIMENSIONS = { countries: "blob2", devices: "blob4", os: "blob5", browsers: "blob6", referers: "blob7" } as const;

const clampDays = (d: number) => (d === 30 || d === 90 ? d : 7);

/** 单个短码近 N 天（7 / 30 / 90）的明细。日期按 UTC。 */
export async function linkStats(env: Env, code: string, daysRaw: number): Promise<LinkStats> {
  if (!CODE_RE.test(code)) throw new Error("短码不合法");
  const days = clampDays(daysRaw);
  const ds = datasetName(env);
  const where = `index1 = '${code}' AND timestamp > NOW() - INTERVAL '${days}' DAY`;
  const [daily, ...tops] = await Promise.all([
    sql<{ day: string; clicks: string | number }>(env,
      `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, SUM(_sample_interval) AS clicks FROM ${ds} WHERE ${where} GROUP BY day ORDER BY day`),
    ...Object.values(DIMENSIONS).map((col) =>
      sql<{ name: string; clicks: string | number }>(env,
        `SELECT ${col} AS name, SUM(_sample_interval) AS clicks FROM ${ds} WHERE ${where} GROUP BY name ORDER BY clicks DESC LIMIT 10`)),
  ]);
  const num = (x: string | number) => Number(x) || 0;
  const top = Object.fromEntries(
    Object.keys(DIMENSIONS).map((k, i) => [k, (tops[i] ?? []).map((r) => ({ name: r.name || "未知", clicks: num(r.clicks) }))]),
  ) as LinkStats["top"];
  const dailyRows = daily.map((r) => ({ day: String(r.day).slice(0, 10), clicks: num(r.clicks) }));
  return { days, total: dailyRows.reduce((s, r) => s + r.clicks, 0), daily: dailyRows, top };
}

/** 全部短码近 90 天点击数，后台列表用。查询失败时返回 null（列表照常显示）。 */
export async function clickTotals(env: Env): Promise<Record<string, number> | null> {
  if (!statsQueryable(env)) return null;
  try {
    const rows = await sql<{ code: string; clicks: string | number }>(env,
      `SELECT index1 AS code, SUM(_sample_interval) AS clicks FROM ${datasetName(env)} WHERE timestamp > NOW() - INTERVAL '90' DAY GROUP BY code`);
    return Object.fromEntries(rows.map((r) => [r.code, Number(r.clicks) || 0]));
  } catch (e) {
    console.error("clickTotals", e);
    return null;
  }
}
