# shortlink-personal

Rei 的个人短链服务，跑在单个 Cloudflare Worker 上，域名 **s.rei8t.dev**。

- `https://s.rei8t.dev/<短码>` → 302 跳转到长链接（Workers KV 存 `短码 -> 长链接`）
- `https://s.rei8t.dev/admin` → 中文后台，**只有 Rei 能进**（Google OAuth 登录 + 邮箱白名单）

## 功能

- **短链跳转**：自定义短码或自动生成，302 跳转
- **访问统计**：Workers Analytics Engine 记录每次跳转（爬虫不计），后台看近 7 / 30 / 90 天的每日趋势、国家/地区、设备、系统、浏览器、来源
- **链接控制**：过期时间（过期后返回 410）、访问密码（PBKDF2 哈希存储）、「不安全链接」警告页
- **智能跳转**：按设备（iOS / Android / 其它手机 / 桌面）或国家跳不同地址，优先级 设备 → 国家 → 默认
- **社交预览**：自定义 OG 标题、描述、图片；微信、Telegram、X、Slack 等爬虫抓取时返回预览页。设了密码的链接，预览页不暴露目标地址

## 技术栈

- **Worker**：TypeScript + Wrangler，无框架。负责跳转、API、登录，并把「该显示哪个页面 + 数据」注入 HTML
- **前端**：React 19 + [Kumo](https://github.com/cloudflare/kumo)（Cloudflare 设计系统）+ Tailwind v4，Vite 构建到 `public/`，由 Workers Static Assets 提供。后台、登录、密码、安全提示、过期、404 全部是同一套 Kumo 组件
- 社交爬虫拿到的 OG 预览页是唯一的服务端纯 HTML

```
src/                    Worker
  index.ts              路由：/:code 跳转、/admin、/auth/*、/api/*
  html.ts               读 public/index.html 注入页面数据；OG 预览页
  links.ts              KV 读写、输入校验、短码生成
  visitor.ts            设备 / 系统 / 浏览器 / 爬虫识别，智能跳转规则
  analytics.ts          Analytics Engine 写入与 SQL 查询
  password.ts           链接密码哈希
  auth.ts / session.ts  Google OAuth 2.0 + 管理员白名单，HMAC 签名 cookie
  shared/types.ts       Worker 与前端共用的类型（含 PageData）
web/                    前端（React + Kumo）
  src/App.tsx           按 PageData.kind 渲染页面；后台懒加载
  src/pages/            访客与登录页（Kumo Empty / SensitiveInput / ClipboardText / Banner）
  src/admin/            后台：Table、DropdownMenu、Dialog、Tabs、Switch、Badge、Toast；
                        统计用 TimeseriesChart（ECharts，单独分包）+ Meter
scripts/kumo-lint.mjs   kumo-design 规则静态检查
test/run-tests.ts       内存 KV + 假 Analytics Engine + 假 Assets 跑全流程
```

## 设计规范

遵循 [kumo-design](https://github.com/cloudflare/kumo) agent skill（已装在 `.agents/skills/kumo-design`）：正文 14px、标题 sentence case、不用 `font-bold` / `tracking-*`、hover 不做颜色过渡、阴影配 `ring` 不配 `border`、吸顶元素用 `border-b`、LayerCard 不嵌套、Dialog 永远挂载用 `open` 控制。只用 `kumo-*` 语义色，深浅色跟随系统（`<html data-mode>`）。
能自动判断的规则由 `pnpm lint`（`scripts/kumo-lint.mjs`）检查，`pnpm test` 会先跑它。

## 跳转流程

`GET /:code`：不存在 → 404 ｜ 已过期 → 410 ｜ 社交爬虫且设了预览 → OG 预览页 ｜ 有密码 → 密码页（`POST /:code` 提交）｜ 按设备/国家选目标 ｜ 记一次访问 ｜ 标记不安全 → 警告页，否则 302。

## API（需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/links` | 列出短链，附近 90 天点击数 |
| POST | `/api/links` | 新建 |
| PUT | `/api/links/:code` | 编辑（缺省字段保持不变，`null` 清除） |
| DELETE | `/api/links/:code` | 删除 |
| GET | `/api/links/:code/stats?days=7\|30\|90` | 访问统计明细 |

请求体：

```json
{
  "url": "https://example.com",
  "code": "hi",
  "note": "备注",
  "expiresAt": "2026-12-31T16:00:00.000Z",
  "password": "可选，null = 移除",
  "unsafe": false,
  "devices": { "ios": "https://apps.apple.com/…", "android": "https://play.google.com/…", "mobile": "", "desktop": "" },
  "countries": { "CN": "https://example.cn" },
  "og": { "title": "标题", "description": "描述", "image": "https://…/cover.png" }
}
```

写操作校验 `Origin` 同源，配合 `SameSite=Lax` cookie 防 CSRF。短码：字母、数字、`-`、`_`，最长 64 位，区分大小写；`admin`、`auth`、`api`、`health`、`robots.txt`、`favicon.ico` 为保留路径。自动短码默认 6 位，去掉了 `0 O o 1 l I` 这类易混字符。

## 存储

- **KV** `link:<code>` → 链接记录 JSON（上面的字段 + `createdAt` / `updatedAt`，密码只存盐和哈希）
- **Analytics Engine** 数据集 `shortlink_personal_clicks`：`index1` = 短码；`blob1–7` = 短码、国家、城市、设备、系统、浏览器、来源域名；`double1` = 1。数据保留约 90 天，统计日期按 UTC。

`CLICK_STATS` 设为 `"off"` 可关闭统计记录。

## 配置

`wrangler.jsonc`：

- `name: "shortlink-personal"`，`account_id: 9151f72e404dd53f20b8e6667893237d`
- `workers_dev: false`，`routes: [{ pattern: "s.rei8t.dev", custom_domain: true }]`（zone `rei8t.dev`）
- bindings：KV `LINKS`、Analytics Engine `ANALYTICS`
- vars：`ADMIN_EMAILS`（后台白名单，多个用逗号隔开，默认 `reiy.leoz@gmail.com`）、`CLICK_STATS`、`ANALYTICS_DATASET`、`CF_ACCOUNT_ID`、`CODE_LENGTH`

Secrets（`wrangler secret put <NAME>` 或 CF 控制台 → Worker → 设置 → 变量和机密）：

| 名称 | 说明 |
| --- | --- |
| `SESSION_SECRET` | 必填，随机长字符串（`openssl rand -base64 32`） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth Web client |
| `CF_API_TOKEN` | 后台查看统计用；在 CF 控制台建 API Token，权限 Account → Account Analytics → Read。不填也会记录，只是后台看不到 |

缺任何一个，后台登录页都会提示「Google 登录尚未配置」，但短链跳转不受影响。

### Google OAuth

在 Google Cloud Console → APIs & Services → Credentials 新建（或复用）一个 **Web application** OAuth client，授权回调地址加上：

- `https://s.rei8t.dev/auth/callback`
- `http://localhost:8787/auth/callback`（本地调试）

## 本地开发

```bash
pnpm install
cp .dev.vars.example .dev.vars   # AUTH_DISABLED=true 时本地跳过登录（只对 localhost 生效）
pnpm dev                          # 构建前端 + wrangler dev → http://localhost:8787/admin
pnpm dev:web                      # 只调前端（Vite 热更新，/api 代理到 8787），?page=password 等可预览各页面
pnpm typecheck && pnpm test       # 类型检查（Worker + 前端）、kumo-lint、全流程测试
```

`wrangler dev` 会把请求 host 改写成路由域名 s.rei8t.dev，所以 `pnpm dev` 带了 `--local-upstream localhost:8787`，让 `AUTH_DISABLED` 能识别本地请求。

## 部署（尚未部署）

```bash
npx wrangler kv namespace create shortlink-personal-KV   # 把返回的 id 填进 wrangler.jsonc
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put CF_API_TOKEN
pnpm deploy                                              # 先 vite build 再 wrangler deploy；首次部署自动绑定 s.rei8t.dev
```

## 管理员

Google 只证明「你是这个邮箱」，能否进后台由 `ADMIN_EMAILS` 白名单决定：回调时不在名单里直接拒绝，之后每次请求也重新对照名单，移出名单的人登录立即失效。

## 路线图

功能取自 [Sink](https://github.com/miantiao-me/Sink)：

- [x] 访问统计（Analytics Engine）
- [x] 链接控制：过期、密码、警告页
- [x] 智能跳转：设备 / 国家
- [x] 社交预览：自定义 OG
- [x] 全站界面改用 Kumo 组件，遵循 kumo-design
- [ ] 二维码、导入导出、API Token 调用（待定）

## 部署（API Token / 内联资源）

用 API Token 部署时 Static Assets 上传接口会 401，所以线上用内联版本：

```bash
pnpm deploy:inline   # vite build → public/ 内联进 worker-inline/assets.generated.ts → wrangler deploy -c wrangler.inline.jsonc
```

- KV：`shortlink-personal-KV`（id 已写入 wrangler.jsonc）
- 已设 secret：`SESSION_SECRET`；Google 登录需再加 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- 访问统计：需先在 Cloudflare 控制台启用 Analytics Engine，再取消 wrangler.inline.jsonc 中 `analytics_engine_datasets` 的注释并设置 `CF_API_TOKEN`
