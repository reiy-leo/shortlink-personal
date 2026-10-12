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

TypeScript + Wrangler，无框架、无前端构建；后台页面由 Worker 服务端渲染。

```
src/
  index.ts      路由：/:code 跳转、/admin、/auth/*、/api/*
  links.ts      KV 读写、输入校验、短码生成
  visitor.ts    设备 / 系统 / 浏览器 / 爬虫识别，智能跳转规则
  analytics.ts  Analytics Engine 写入与 SQL 查询
  password.ts   链接密码哈希
  auth.ts       Google OAuth 2.0（authorization-code）+ 管理员白名单
  session.ts    HMAC-SHA256 签名 cookie
  pages.ts      中文页面（后台、登录、密码、警告、过期、预览、404）
  env.ts        环境变量与绑定
test/run-tests.ts  内存 KV + 假 Analytics Engine 跑全流程
```

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
pnpm dev                          # http://localhost:8787/admin
pnpm typecheck && pnpm test
```

## 部署（尚未部署）

```bash
npx wrangler kv namespace create shortlink-personal-KV   # 把返回的 id 填进 wrangler.jsonc
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put CF_API_TOKEN
pnpm deploy                                              # 首次部署会自动绑定 s.rei8t.dev
```

## 管理员

Google 只证明「你是这个邮箱」，能否进后台由 `ADMIN_EMAILS` 白名单决定：回调时不在名单里直接拒绝，之后每次请求也重新对照名单，移出名单的人登录立即失效。

## 路线图

功能取自 [Sink](https://github.com/miantiao-me/Sink)：

- [x] 访问统计（Analytics Engine）
- [x] 链接控制：过期、密码、警告页
- [x] 智能跳转：设备 / 国家
- [x] 社交预览：自定义 OG
- [ ] 二维码、导入导出、API Token 调用（待定）
