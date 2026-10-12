# shortlink-personal

Rei 的个人短链服务，跑在单个 Cloudflare Worker 上，域名 **s.rei8t.dev**。

- `https://s.rei8t.dev/<短码>` → 302 跳转到长链接（Workers KV 存 `短码 -> 长链接`）
- `https://s.rei8t.dev/admin` → 中文后台，**只有 Rei 能进**（Google OAuth 登录 + 邮箱白名单）

## 技术栈

TypeScript + Wrangler，无框架、无前端构建；后台页面由 Worker 服务端渲染。

```
src/
  index.ts     路由：/:code 跳转、/admin、/auth/*、/api/*
  links.ts     KV 读写、短码校验与生成、点击计数（预留）
  auth.ts      Google OAuth 2.0（authorization-code）+ 管理员白名单
  session.ts   HMAC-SHA256 签名 cookie
  pages.ts     中文页面（后台、登录、404）
  env.ts       环境变量与绑定
test/run-tests.ts  内存 KV 跑核心流程
```

## 路由

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/:code` | 302 跳转；不存在返回 404 页 |
| GET | `/admin` | 后台（未登录显示登录页） |
| GET | `/auth/login`、`/auth/callback` | Google 登录 |
| POST | `/auth/logout` | 退出 |
| GET | `/api/links` | 列出短链（需登录） |
| POST | `/api/links` | 新建 `{ url, code?, note? }`，code 留空自动生成 |
| DELETE | `/api/links/:code` | 删除 |

短码规则：字母、数字、`-`、`_`，最长 64 位，区分大小写；`admin`、`auth`、`api`、`health`、`robots.txt`、`favicon.ico` 为保留路径。自动短码默认 6 位，去掉了 `0 O o 1 l I` 这类易混字符。

## KV 数据结构

| key | value | metadata |
| --- | --- | --- |
| `link:<code>` | 长链接 | `{ createdAt, note? }` |
| `clicks:<code>` | 点击次数（仅 `CLICK_STATS=on`） | — |

## 点击统计（预留，默认关闭）

`wrangler.jsonc` 里 `CLICK_STATS` 改成 `"on"` 即开启：每次跳转在 `waitUntil` 里给 `clicks:<code>` +1，后台列表多出「点击」列。
KV 不是原子计数器，并发访问时会少计，适合粗略看看。需要精确数字或按来源/国家/设备细分时，改用 Workers Analytics Engine 或 D1。

## 配置

`wrangler.jsonc`：

- `name: "shortlink-personal"`，`account_id: 9151f72e404dd53f20b8e6667893237d`
- `workers_dev: false`，`routes: [{ pattern: "s.rei8t.dev", custom_domain: true }]`（zone `rei8t.dev`）
- vars：`ADMIN_EMAILS`（后台白名单，默认 `reiy.leoz@gmail.com`）、`CLICK_STATS`、`CODE_LENGTH`

Secrets（`wrangler secret put <NAME>` 或 CF 控制台 → Worker → 设置 → 变量和机密）：

| 名称 | 说明 |
| --- | --- |
| `SESSION_SECRET` | 必填，随机长字符串（`openssl rand -base64 32`） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth Web client |

缺任何一个，后台登录页都会提示「Google 登录尚未配置」，但短链跳转不受影响。

### Google OAuth

在 Google Cloud Console → APIs & Services → Credentials 新建（或复用）一个 **Web application** OAuth client，授权回调地址加上：

- `https://s.rei8t.dev/auth/callback`
- `http://localhost:8787/auth/callback`（本地调试）

## 本地开发

```bash
pnpm install
cp .dev.vars.example .dev.vars   # AUTH_DISABLED=true 时本地跳过登录（只对 localhost 生效）
pnpm dev                          # http://localhost:8787/admin
pnpm typecheck && pnpm test
```

## 部署（尚未部署）

```bash
npx wrangler kv namespace create shortlink-personal-KV   # 把返回的 id 填进 wrangler.jsonc
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
pnpm deploy                                              # 首次部署会自动绑定 s.rei8t.dev
```

## 路线图

借鉴 [Sink](https://github.com/miantiao-me/Sink)，计划加入：

- [ ] 访问统计：改用 Workers Analytics Engine，按天 / 国家 / 设备 / 来源细分
- [ ] 链接控制：过期时间、访问密码、不安全链接警告页
- [ ] 智能跳转：按设备（iOS / Android / 桌面）或国家跳不同地址
- [ ] 社交预览：自定义 OG 标题、描述、图片
