export const fmtTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

/** ISO → <input type="datetime-local"> 的本地时间值 */
export const toLocalInput = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const isExpired = (iso?: string) => Boolean(iso && new Date(iso).getTime() <= Date.now());

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

const DEVICE_NAMES: Record<string, string> = { ios: "iOS", android: "Android", mobile: "其它手机", desktop: "桌面" };
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
