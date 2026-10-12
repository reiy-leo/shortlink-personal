const pad = (n: number) => String(n).padStart(2, "0");

/** 时区偏移（分钟，东正西负）→ "+0800" */
export const fmtOffset = (min: number) => `${min < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;
/** 时区偏移（分钟）→ "+08:00"，用于存储 */
export const isoOffset = (min: number) => `${min < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;
/** 浏览器当前时区偏移（分钟） */
export const localOffset = (at = new Date()) => -at.getTimezoneOffset();

/** 时间字符串里自带的偏移（+08:00 这类）；UTC（Z）或没有偏移则用浏览器时区 */
export const offsetOf = (iso: string) => {
  const m = iso.match(/([+-])(\d{2}):?(\d{2})$/);
  if (m) return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return localOffset(new Date(iso));
};

/** 在指定偏移下的墙上时间各部分 */
export const wallParts = (iso: string, offset = offsetOf(iso)) => {
  const d = new Date(Date.parse(iso) + offset * 60_000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
};

/** "2026/10/13 12:48 +0800"；带偏移的时间按其自身时区显示，否则按浏览器时区 */
export const fmtTime = (iso?: string, offset?: number) => {
  if (!iso) return "";
  const off = offset ?? offsetOf(iso);
  const p = wallParts(iso, off);
  return `${p.y}/${pad(p.mo)}/${pad(p.d)} ${pad(p.h)}:${pad(p.mi)} ${fmtOffset(off)}`;
};

/** 剩余时间："3天 4小时 12分钟"；已过返回 null */
export const countdown = (iso: string, now = Date.now()) => {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return null;
  const total = Math.floor(ms / 60_000);
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60;
  if (!d && !h && !m) return "不到 1 分钟";
  return [d && `${d}天`, h && `${h}小时`, m && `${m}分钟`].filter(Boolean).join(" ");
};

/** 存储值 → 表单值 "YYYY-MM-DDTHH:mm+08:00"（保留原时区；旧数据按浏览器时区） */
export const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  const off = offsetOf(iso);
  const p = wallParts(iso, off);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}${isoOffset(off)}`;
};

export const isExpired = (iso?: string) => Boolean(iso && new Date(iso).getTime() <= Date.now());

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const DEVICE_NAMES: Record<string, string> = {
  iphone: "iPhone", ipad: "iPad", ios: "iOS", android: "Android", harmonyos: "鸿蒙",
  mobile: "其它手机/平板", macos: "macOS", windows: "Windows", desktop: "其它电脑",
};
export const deviceName = (k: string) => DEVICE_NAMES[k] ?? k;

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["zh-CN"], { type: "region" }) : null;
export const countryName = (cc: string) => {
  if (!/^[A-Z]{2}$/.test(cc) || cc === "XX") return cc === "XX" ? "未知" : cc;
  try {
    return `${regionNames?.of(cc) ?? cc}（${cc}）`;
  } catch {
    return cc;
  }
};
