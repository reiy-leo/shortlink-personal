// Worker 与前端共用的纯类型（不依赖 Workers / DOM 类型）。

export interface DeviceRules { ios?: string; android?: string; mobile?: string; desktop?: string }
export interface OgMeta { title?: string; description?: string; image?: string }

/** 给后台看的短链视图（不含密码哈希）。 */
export interface LinkView {
  code: string;
  url: string;
  createdAt: string;
  updatedAt?: string;
  note?: string;
  expiresAt?: string;
  hasPassword: boolean;
  unsafe?: boolean;
  devices?: DeviceRules;
  countries?: Record<string, string>;
  og?: OgMeta;
}

/** 新建 / 编辑的输入。编辑时缺省字段 = 保持不变；空字符串 / null = 清除。 */
export interface LinkInput {
  url?: string;
  code?: string;
  note?: string | null;
  expiresAt?: string | null;
  /** 新密码；null = 移除密码。 */
  password?: string | null;
  unsafe?: boolean;
  devices?: DeviceRules | null;
  countries?: Record<string, string> | null;
  og?: OgMeta | null;
}

export type StatsRow = { name: string; clicks: number };
export type StatsDimension = "countries" | "devices" | "os" | "browsers" | "referers";
export interface LinkStats {
  days: number;
  total: number;
  daily: { day: string; clicks: number }[];
  top: Record<StatsDimension, StatsRow[]>;
}

export interface ListResponse { links: LinkView[]; clicks: Record<string, number> | null }

export type LoginError = "unconfigured" | "denied" | "state" | "token" | "id_token" | "unverified" | "forbidden";

/** Worker 注入到 HTML 里的页面数据，前端据此渲染对应页面。 */
export type PageData =
  | { kind: "admin"; user: { email: string; name?: string; picture?: string }; origin: string; stats: { recording: boolean; queryable: boolean } }
  | { kind: "login"; error: LoginError | null }
  | { kind: "password"; code: string; wrong: boolean }
  | { kind: "warning"; target: string }
  | { kind: "expired" }
  | { kind: "notfound" }
  | { kind: "home" };
