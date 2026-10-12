// 访客识别：设备 / 系统 / 浏览器 / 爬虫，以及按规则挑选跳转目标。
import type { LinkRecord } from "./links.ts";

export type Device = "ios" | "android" | "mobile" | "desktop";

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

export function deviceOf(ua: string): Device {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Mobi|Mobile|Phone/i.test(ua)) return "mobile";
  return "desktop";
}

function osOf(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/HarmonyOS/i.test(ua)) return "HarmonyOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "其他";
}

function browserOf(ua: string): string {
  if (/MicroMessenger/i.test(ua)) return "微信";
  if (/QQ\//i.test(ua)) return "QQ";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox|FxiOS/i.test(ua)) return "Firefox";
  if (/Chrome|CriOS/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  return "其他";
}

export function visitorOf(req: Request): Visitor {
  const ua = req.headers.get("User-Agent") ?? "";
  const cf = (req as Request & { cf?: { country?: string; city?: string } }).cf;
  let referer = "(直接访问)";
  try {
    const r = req.headers.get("Referer");
    if (r) referer = new URL(r).hostname || referer;
  } catch { /* ignore */ }
  return {
    device: deviceOf(ua),
    os: osOf(ua),
    browser: browserOf(ua),
    country: (cf?.country ?? "XX").toUpperCase(),
    city: cf?.city ?? "",
    referer,
    bot: !ua || BOT_RE.test(ua),
  };
}

/** 跳转目标：设备规则优先，其次国家规则，最后默认长链接。 */
export function pickTarget(link: LinkRecord, v: Pick<Visitor, "device" | "country">): string {
  const d = link.devices;
  if (d) {
    if (v.device === "ios" && d.ios) return d.ios;
    if (v.device === "android" && d.android) return d.android;
    if ((v.device === "ios" || v.device === "android" || v.device === "mobile") && d.mobile) return d.mobile;
    if (v.device === "desktop" && d.desktop) return d.desktop;
  }
  const c = link.countries?.[v.country];
  return c ?? link.url;
}
