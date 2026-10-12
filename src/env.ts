export interface Env {
  /** KV：`link:<code>` -> LinkRecord（JSON）。 */
  LINKS: KVNamespace;
  /** Workers Analytics Engine：每次跳转写一个数据点。 */
  ANALYTICS?: AnalyticsEngineDataset;

  // secrets
  SESSION_SECRET?: string;
  /** Google OAuth 2.0 Web client（Google Cloud Console → Credentials）。 */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** 查询统计用的 Cloudflare API Token（权限：Account → Account Analytics → Read）。 */
  CF_API_TOKEN?: string;

  // vars
  /** 允许进后台的 Google 邮箱，逗号分隔。 */
  ADMIN_EMAILS?: string;
  /** 访问统计："off" 关闭，其它值开启（默认开启）。 */
  CLICK_STATS?: string;
  /** Cloudflare 账号 ID（统计查询用）。 */
  CF_ACCOUNT_ID?: string;
  /** Analytics Engine 数据集名，需与 wrangler.jsonc 里的 dataset 一致。 */
  ANALYTICS_DATASET?: string;
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

/** 是否记录访问（需要 ANALYTICS 绑定）。 */
export const statsRecording = (env: Env) => (env.CLICK_STATS ?? "on").trim().toLowerCase() !== "off" && Boolean(env.ANALYTICS);
/** 是否能在后台查询统计（还需要账号 ID + API Token）。 */
export const statsQueryable = (env: Env) => statsRecording(env) && Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN);

export const datasetName = (env: Env) => env.ANALYTICS_DATASET || "shortlink_personal_clicks";

export const codeLength = (env: Env) => Math.min(32, Math.max(4, Number(env.CODE_LENGTH ?? "6") || 6));
