// 访客识别：设备 / 系统 / 浏览器 / 爬虫，以及按规则挑选跳转目标。
import Bowser from "bowser";
import type { LinkRecord } from "./links.ts";

// 设备 = 跳转规则里能选的类型；识别用 bowser（MIT），鸿蒙单独判断（HarmonyOS 4 及以前 UA 里同时有 Android）。
export type Device = "iphone" | "ipad" | "android" | "harmonyos" | "mobile" | "macos" | "windows" | "desktop";

export interface Visitor {
  device: Device;
  os: string;
  browser: string;
  country: string; // ISO 3166-1 alpha-2，未知为 "XX"
  city: string;
  referer: string; // 来源域名，直接访问为 "(直接访问)"
  bot: boolean;
}

const BOT_RE =
  /bot\b|crawler|spider|facebookexternalhit|facebookcatalog|slackbot|telegrambot|whatsapp|discordbot|linkedinbot|twitterbot|embedly|pinterest|redditbot|skypeuripreview|vkshare|applebot|google-pagerenderer|bingpreview|mastodon|bluesky|iframely|preview/i;

const isHarmony = (ua: string) => /HarmonyOS|OpenHarmony|ArkWeb/i.test(ua);

export function deviceOf(ua: string): Device {
  if (isHarmony(ua)) return "harmonyos";
  const p = Bowser.parse(ua);
  const type = p.platform.type;
  switch (p.os.name) {
    case "iOS":
      return type === "tablet" || /iPad/i.test(ua) ? "ipad" : "iphone";
    case "Android":
      return "android";
    case "macOS":
      return "macos";
    case "Windows":
      return type === "mobile" || type === "tablet" ? "mobile" : "windows";
  }
  return type === "mobile" || type === "tablet" ? "mobile" : "desktop";
}

const OS_NAMES: Record<string, string> = { "Chrome OS": "ChromeOS" };
function osOf(ua: string, p: Bowser.Parser.ParsedResult): string {
  if (isHarmony(ua)) return "HarmonyOS";
  const n = p.os.name;
  return n ? (OS_NAMES[n] ?? n) : "其他";
}

const BROWSER_NAMES: Record<string, string> = { WeChat: "微信", "QQ Browser": "QQ", "QQ Browser Lite": "QQ", "Microsoft Edge": "Edge", "UC Browser": "UC", "Samsung Internet for Android": "Samsung", "Huawei Browser": "华为浏览器" };
function browserOf(ua: string, p: Bowser.Parser.ParsedResult): string {
  if (/MicroMessenger/i.test(ua)) return "微信";
  const n = p.browser.name;
  return n ? (BROWSER_NAMES[n] ?? n) : "其他";
}

export function visitorOf(req: Request): Visitor {
  const ua = req.headers.get("User-Agent") ?? "";
  const cf = (req as Request & { cf?: { country?: string; city?: string } }).cf;
  let referer = "(直接访问)";
  try {
    const r = req.headers.get("Referer");
    if (r) referer = new URL(r).hostname || referer;
  } catch { /* ignore */ }
  const p = Bowser.parse(ua);
  return {
    device: deviceOf(ua),
    os: osOf(ua, p),
    browser: browserOf(ua, p),
    country: (cf?.country ?? "XX").toUpperCase(),
    city: cf?.city ?? "",
    referer,
    bot: !ua || BOT_RE.test(ua),
  };
}

/** 每种设备依次尝试的规则：先精确，再大类（ios / mobile / desktop 为通用规则，兼容旧数据）。 */
const FALLBACK: Record<Device, (keyof NonNullable<LinkRecord["devices"]>)[]> = {
  iphone: ["iphone", "ios", "mobile"],
  ipad: ["ipad", "ios", "mobile"],
  android: ["android", "mobile"],
  harmonyos: ["harmonyos", "mobile"],
  mobile: ["mobile"],
  macos: ["macos", "desktop"],
  windows: ["windows", "desktop"],
  desktop: ["desktop"],
};

/** 跳转目标：设备规则优先，其次国家规则，最后默认长链接。 */
export function pickTarget(link: LinkRecord, v: Pick<Visitor, "device" | "country">, ua = ""): string {
  const d = link.devices;
  if (d) {
    for (const k of FALLBACK[v.device] ?? []) if (d[k]) return d[k]!;
    // 老鸿蒙（UA 带 Android）没配鸿蒙规则时，按 Android 处理
    if (v.device === "harmonyos" && /Android/i.test(ua) && d.android) return d.android;
  }
  const c = link.countries?.[v.country];
  return c ?? link.url;
}
