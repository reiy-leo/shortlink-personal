export interface Env {
  /** KV: `link:<code>` -> 长链接（metadata 里存 createdAt / note）；点击统计开启时还有 `clicks:<code>`。 */
  LINKS: KVNamespace;

  // secrets
  SESSION_SECRET?: string;
  /** Google OAuth 2.0 Web client（Google Cloud Console → Credentials）。 */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // vars
  /** 允许进后台的 Google 邮箱，逗号分隔。 */
  ADMIN_EMAILS?: string;
  /** 点击统计（预留）："on" 开启，其它值关闭。 */
  CLICK_STATS?: string;
  /** 自动生成短码长度，默认 6。 */
  CODE_LENGTH?: string;
  /** 可选，默认 <origin>/auth/callback，必须与 Google 授权回调地址一致。 */
  OAUTH_REDIRECT_URI?: string;
  /** "true" = 跳过登录（假用户）。只对 localhost 生效，仅供本地开发。 */
  AUTH_DISABLED?: string;
}

/** AUTH_DISABLED 只对 localhost 请求生效，线上永远不会因为误配而敞开。 */
export const isAuthDisabled = (env: Env, req: Request) => {
  if ((env.AUTH_DISABLED ?? "").trim().toLowerCase() !== "true") return false;
  const host = new URL(req.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

export const googleConfigured = (env: Env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);

export const adminEmails = (env: Env): string[] =>
  (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export const clickStatsEnabled = (env: Env) => (env.CLICK_STATS ?? "").trim().toLowerCase() === "on";

export const codeLength = (env: Env) => Math.min(32, Math.max(4, Number(env.CODE_LENGTH ?? "6") || 6));
