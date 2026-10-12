// 服务端渲染的中文页面：后台、登录页、404。无构建步骤，前端脚本内联。
import type { SessionUser, LoginError } from "./auth.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{color-scheme:light dark;--fg:#1d1d1f;--muted:#6e6e73;--bg:#fff;--card:#f5f5f7;--line:#d2d2d7;--accent:#0066cc;--danger:#d70015}
@media (prefers-color-scheme:dark){:root{--fg:#f5f5f7;--muted:#a1a1a6;--bg:#000;--card:#1c1c1e;--line:#3a3a3c;--accent:#2997ff;--danger:#ff453a}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--fg);background:var(--bg)}
main{max-width:880px;margin:0 auto;padding:32px 20px 64px}h1{font-size:26px;margin:0}header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}
.muted{color:var(--muted)}.card{background:var(--card);border-radius:14px;padding:18px}form.new{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);font:inherit}
button,.btn{padding:10px 16px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}
button.ghost{background:transparent;color:var(--accent);padding:4px 8px}button.danger{background:transparent;color:var(--danger);padding:4px 8px}
table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
td.url{word-break:break-all;max-width:360px}code{font-family:ui-monospace,Menlo,monospace}.msg{min-height:22px;margin-top:10px}.err{color:var(--danger)}
@media (max-width:680px){form.new{grid-template-columns:1fr}th.hide,td.hide{display:none}}`;

const layout = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } },
  );

const LOGIN_ERRORS: Record<LoginError, string> = {
  unconfigured: "Google 登录尚未配置（缺少 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET）。",
  denied: "你取消了 Google 授权。",
  state: "登录状态已过期，请重新登录。",
  token: "向 Google 换取凭证失败，请重试。",
  id_token: "Google 返回的身份信息无效，请重试。",
  unverified: "这个 Google 账号的邮箱尚未验证。",
  forbidden: "这个 Google 账号没有后台权限。",
};

export function loginPage(error: string | null): Response {
  const msg = error && error in LOGIN_ERRORS ? `<p class="err">${LOGIN_ERRORS[error as LoginError]}</p>` : "";
  return layout(
    "登录 · 短链后台",
    `<div style="max-width:420px;margin:12vh auto;text-align:center"><h1>短链后台</h1><p class="muted">仅限管理员，使用 Google 账号登录。</p>${msg}<p style="margin-top:28px"><a class="btn" href="/auth/login?returnTo=/admin">使用 Google 登录</a></p></div>`,
  );
}

export function notFoundPage(): Response {
  return layout("链接不存在", `<div style="max-width:420px;margin:15vh auto;text-align:center"><h1>链接不存在</h1><p class="muted">这个短链接不存在或已被删除。</p></div>`, 404);
}

export function homePage(): Response {
  return layout("s.rei8t.dev", `<div style="max-width:420px;margin:15vh auto;text-align:center"><h1>s.rei8t.dev</h1><p class="muted">Rei 的个人短链服务。</p></div>`);
}

export function adminPage(user: SessionUser, origin: string, clickStats: boolean): Response {
  const body = `
<header><div><h1>短链后台</h1><div class="muted">${esc(origin.replace(/^https?:\/\//, ""))}</div></div>
<form method="post" action="/auth/logout" style="display:flex;align-items:center;gap:10px"><span class="muted">${esc(user.name ?? user.email)}</span><button class="ghost" type="submit">退出登录</button></form></header>
<section class="card">
  <form class="new" id="new">
    <input name="url" type="url" placeholder="长链接，如 https://example.com/very/long/path" required>
    <input name="code" placeholder="自定义短码（可留空）" pattern="[A-Za-z0-9_\\-]{1,64}">
    <input name="note" placeholder="备注（可选）" maxlength="200">
    <button type="submit">生成短链</button>
  </form>
  <div class="msg" id="msg"></div>
</section>
<table><thead><tr><th>短链</th><th>长链接</th><th class="hide">备注</th>${clickStats ? "<th>点击</th>" : ""}<th class="hide">创建时间</th><th></th></tr></thead>
<tbody id="rows"><tr><td colspan="6" class="muted">加载中…</td></tr></tbody></table>
<script>
const ORIGIN=${JSON.stringify(origin)},STATS=${clickStats};
const $=s=>document.querySelector(s),msg=$("#msg");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const fmt=t=>t?new Date(t).toLocaleString("zh-CN",{hour12:false}):"";
async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})}});
  if(r.status===401){location.href="/admin";throw new Error("未登录")}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"请求失败（"+r.status+"）");return d}
function say(t,bad){msg.textContent=t;msg.className="msg"+(bad?" err":"")}
async function load(){const {links}=await api("/api/links");const rows=$("#rows");
  if(!links.length){rows.innerHTML='<tr><td colspan="6" class="muted">还没有短链，先建一个吧。</td></tr>';return}
  rows.innerHTML=links.map(l=>{const s=ORIGIN+"/"+l.code;return '<tr><td><a href="'+esc(s)+'" target="_blank" rel="noopener"><code>/'+esc(l.code)+'</code></a></td><td class="url">'+esc(l.url)+'</td><td class="hide">'+esc(l.note)+'</td>'+(STATS?'<td>'+(l.clicks??0)+'</td>':'')+'<td class="hide muted">'+fmt(l.createdAt)+'</td><td style="white-space:nowrap"><button class="ghost" data-copy="'+esc(s)+'">复制</button><button class="danger" data-del="'+esc(l.code)+'">删除</button></td></tr>'}).join("")}
$("#new").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);
  try{const {link}=await api("/api/links",{method:"POST",body:JSON.stringify({url:f.get("url"),code:f.get("code")||undefined,note:f.get("note")||undefined})});
    const s=ORIGIN+"/"+link.code;e.target.reset();await navigator.clipboard?.writeText(s).catch(()=>{});say("已生成并复制："+s);load()}catch(err){say(err.message,true)}});
$("#rows").addEventListener("click",async e=>{const c=e.target.dataset.copy,d=e.target.dataset.del;
  if(c){await navigator.clipboard.writeText(c);say("已复制："+c)}
  if(d&&confirm("确定删除 /"+d+" 吗？删除后无法恢复。")){try{await api("/api/links/"+encodeURIComponent(d),{method:"DELETE"});say("已删除 /"+d);load()}catch(err){say(err.message,true)}}});
load().catch(err=>say(err.message,true));
</script>`;
  return layout("短链后台", body);
}
