// 服务端渲染的中文页面：后台、登录页、404。无构建步骤，前端脚本内联。
import type { SessionUser, LoginError } from "./auth.ts";
import type { OgMeta } from "./links.ts";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{color-scheme:light dark;--fg:#1d1d1f;--muted:#6e6e73;--bg:#fff;--card:#f5f5f7;--line:#d2d2d7;--accent:#0066cc;--danger:#d70015}
@media (prefers-color-scheme:dark){:root{--fg:#f5f5f7;--muted:#a1a1a6;--bg:#000;--card:#1c1c1e;--line:#3a3a3c;--accent:#2997ff;--danger:#ff453a}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--fg);background:var(--bg)}
main{max-width:880px;margin:0 auto;padding:32px 20px 64px}h1{font-size:26px;margin:0}header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}
.muted{color:var(--muted)}.card{background:var(--card);border-radius:14px;padding:18px}.new{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);font:inherit}
button,.btn{padding:10px 16px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}
button.ghost{background:transparent;color:var(--accent);padding:4px 8px}button.danger{background:transparent;color:var(--danger);padding:4px 8px}
table{width:100%;border-collapse:collapse;margin-top:20px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
td.url{word-break:break-all;max-width:360px}code{font-family:ui-monospace,Menlo,monospace}.msg{min-height:22px;margin-top:10px}.err{color:var(--danger)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{display:block;font-size:13px;color:var(--muted);margin:10px 0 4px}textarea{width:100%;min-height:64px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);font:13px/1.5 ui-monospace,Menlo,monospace}
details{margin-top:12px}summary{cursor:pointer;color:var(--accent)}fieldset{border:1px solid var(--line);border-radius:12px;padding:4px 14px 14px;margin:12px 0 0}legend{padding:0 6px;font-weight:600}
.tag{display:inline-block;font-size:12px;padding:1px 7px;border-radius:99px;background:var(--line);margin:2px 4px 0 0}.tag.warn{background:#ffcc0055}.tag.off{background:#ff3b3044}
dialog{border:0;border-radius:16px;padding:22px;max-width:720px;width:92vw;background:var(--bg);color:var(--fg)}dialog::backdrop{background:#0006}.bars div{display:flex;align-items:center;gap:8px;font-size:13px;margin:3px 0}.bars i{display:block;height:10px;background:var(--accent);border-radius:4px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:12px}.stats h3{font-size:14px;margin:0 0 6px}.check{display:flex;align-items:center;gap:8px;margin-top:12px}.check input{width:auto}
@media (max-width:680px){.grid2{grid-template-columns:1fr}}
@media (max-width:680px){.new{grid-template-columns:1fr}th.hide,td.hide{display:none}}`;

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


const center = (inner: string) => `<div style="max-width:440px;margin:14vh auto;text-align:center">${inner}</div>`;

export function expiredPage(): Response {
  return layout("链接已过期", center(`<h1>链接已过期</h1><p class="muted">这个短链接已经过了有效期。</p>`), 410);
}

export function passwordPage(code: string, wrong: boolean): Response {
  return layout(
    "需要密码",
    center(`<h1>需要密码</h1><p class="muted">这个链接设置了访问密码。</p>${wrong ? '<p class="err">密码不对，再试一次。</p>' : ""}
<form method="post" action="/${esc(encodeURIComponent(code))}" style="display:flex;gap:10px;margin-top:20px"><input name="password" type="password" placeholder="输入密码" autofocus required><button type="submit">继续</button></form>`),
    wrong ? 401 : 200,
  );
}

export function warningPage(target: string): Response {
  let host = target;
  try { host = new URL(target).hostname; } catch { /* keep */ }
  return layout(
    "安全提示",
    center(`<h1>⚠️ 安全提示</h1><p>你即将前往 <b>${esc(host)}</b>，这个链接被标记为可能不安全。</p>
<p class="muted" style="word-break:break-all;font-size:13px">${esc(target)}</p>
<p style="margin-top:24px"><a class="btn" href="${esc(target)}" rel="noopener noreferrer">我了解风险，继续访问</a></p>`),
  );
}

/** 给社交平台爬虫的预览页：OG / Twitter 标签。protectedTarget=true 时不暴露目标地址。 */
export function previewPage(og: OgMeta, shortUrl: string, target: string | null): Response {
  const title = og.title ?? shortUrl;
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${esc(shortUrl)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    og.description ? `<meta property="og:description" content="${esc(og.description)}"><meta name="description" content="${esc(og.description)}">` : "",
    og.image ? `<meta property="og:image" content="${esc(og.image)}"><meta name="twitter:image" content="${esc(og.image)}">` : "",
    `<meta name="twitter:card" content="${og.image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    target ? `<meta http-equiv="refresh" content="0;url=${esc(target)}">` : "",
  ].join("");
  return new Response(
    `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>${tags}</head><body>${target ? `<a href="${esc(target)}">${esc(title)}</a>` : esc(title)}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } },
  );
}

export function adminPage(user: SessionUser, origin: string, stats: { recording: boolean; queryable: boolean }): Response {
  const statsHint = !stats.recording
    ? "访问统计未开启（缺少 ANALYTICS 绑定或 CLICK_STATS=off）。"
    : !stats.queryable
      ? "访问已在记录，但后台查询还需要配置 CF_ACCOUNT_ID 和 CF_API_TOKEN。"
      : "";
  const body = `
<header><div><h1>短链后台</h1><div class="muted">${esc(origin.replace(/^https?:\/\//, ""))}</div></div>
<form method="post" action="/auth/logout" style="display:flex;align-items:center;gap:10px"><span class="muted">${esc(user.name ?? user.email)}</span><button class="ghost" type="submit">退出登录</button></form></header>
<section class="card">
  <form id="f">
    <div class="new">
      <input name="url" type="url" placeholder="长链接，如 https://example.com/very/long/path" required>
      <input name="code" placeholder="自定义短码（可留空）" pattern="[A-Za-z0-9_\\-]{1,64}">
      <input name="note" placeholder="备注（可选）" maxlength="200">
    </div>
    <details id="adv"><summary>高级设置：链接控制 · 智能跳转 · 社交预览</summary>
      <fieldset><legend>链接控制</legend>
        <div class="grid2">
          <div><label>过期时间（留空 = 永久）</label><input name="expiresAt" type="datetime-local"></div>
          <div><label id="pwLabel">访问密码（留空 = 不设）</label><input name="password" type="password" autocomplete="new-password" maxlength="200"></div>
        </div>
        <div class="check" id="pwClearRow" hidden><input type="checkbox" name="clearPassword" id="cp"><label for="cp" style="margin:0">移除现有密码</label></div>
        <div class="check"><input type="checkbox" name="unsafe" id="un"><label for="un" style="margin:0">跳转前显示「不安全链接」警告页</label></div>
      </fieldset>
      <fieldset><legend>智能跳转</legend>
        <p class="muted" style="margin:6px 0 0;font-size:13px">优先级：设备 → 国家 → 默认长链接。不填就走默认。</p>
        <div class="grid2">
          <div><label>iOS 设备</label><input name="ios" type="url" placeholder="https://apps.apple.com/…"></div>
          <div><label>Android 设备</label><input name="android" type="url" placeholder="https://play.google.com/…"></div>
          <div><label>其它手机</label><input name="mobile" type="url"></div>
          <div><label>桌面电脑</label><input name="desktop" type="url"></div>
        </div>
        <label>按国家（每行一条：两位国家代码 + 空格 + 链接）</label>
        <textarea name="countries" placeholder="CN https://example.cn&#10;JP https://example.jp"></textarea>
      </fieldset>
      <fieldset><legend>社交预览</legend>
        <p class="muted" style="margin:6px 0 0;font-size:13px">微信、Telegram、X、Slack 等抓取链接时显示的标题、描述和图片。</p>
        <label>标题</label><input name="ogTitle" maxlength="200">
        <label>描述</label><input name="ogDescription" maxlength="500">
        <label>图片地址</label><input name="ogImage" type="url" placeholder="https://…/cover.png">
      </fieldset>
    </details>
    <div style="display:flex;gap:10px;margin-top:14px"><button type="submit" id="submit">生成短链</button><button type="button" class="ghost" id="cancel" hidden>取消编辑</button></div>
  </form>
  <div class="msg" id="msg"></div>
</section>
${statsHint ? `<p class="muted" style="font-size:13px">${esc(statsHint)}</p>` : ""}
<table><thead><tr><th>短链</th><th>长链接</th>${stats.queryable ? "<th>近90天</th>" : ""}<th class="hide">创建时间</th><th></th></tr></thead>
<tbody id="rows"><tr><td colspan="5" class="muted">加载中…</td></tr></tbody></table>
<dialog id="dlg"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 id="dlgTitle" style="margin:0;font-size:20px"></h2>
<div><select id="days"><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 90 天</option></select> <button class="ghost" onclick="dlg.close()">关闭</button></div></div><div id="dlgBody"></div></dialog>
<script>
const ORIGIN=${JSON.stringify(origin)},QUERY=${stats.queryable};
const $=s=>document.querySelector(s),msg=$("#msg"),f=$("#f");let links=[],editing=null,statCode=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const fmt=t=>t?new Date(t).toLocaleString("zh-CN",{hour12:false}):"";
const localInput=t=>{if(!t)return"";const d=new Date(t);return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,16)};
async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})}});
  if(r.status===401){location.href="/admin";throw new Error("未登录")}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"请求失败（"+r.status+"）");return d}
function say(t,bad){msg.textContent=t;msg.className="msg"+(bad?" err":"")}
function tags(l){const t=[];if(l.expiresAt)t.push(new Date(l.expiresAt)<=new Date()?'<span class="tag off">已过期</span>':'<span class="tag">'+fmt(l.expiresAt)+' 过期</span>');
  if(l.hasPassword)t.push('<span class="tag">🔒 密码</span>');if(l.unsafe)t.push('<span class="tag warn">⚠️ 警告页</span>');
  if(l.devices||l.countries)t.push('<span class="tag">🔀 分流</span>');if(l.og)t.push('<span class="tag">🖼 预览</span>');if(l.note)t.push('<span class="tag">'+esc(l.note)+'</span>');return t.join("")}
async function load(){const d=await api("/api/links");links=d.links;const rows=$("#rows");
  if(!links.length){rows.innerHTML='<tr><td colspan="5" class="muted">还没有短链，先建一个吧。</td></tr>';return}
  rows.innerHTML=links.map(l=>{const s=ORIGIN+"/"+l.code;return '<tr><td><a href="'+esc(s)+'" target="_blank" rel="noopener"><code>/'+esc(l.code)+'</code></a></td><td class="url">'+esc(l.url)+'<div>'+tags(l)+'</div></td>'+(QUERY?'<td>'+(d.clicks?.[l.code]??0)+'</td>':'')+'<td class="hide muted">'+fmt(l.createdAt)+'</td><td style="white-space:nowrap"><button class="ghost" data-copy="'+esc(s)+'">复制</button>'+(QUERY?'<button class="ghost" data-stats="'+esc(l.code)+'">统计</button>':'')+'<button class="ghost" data-edit="'+esc(l.code)+'">编辑</button><button class="danger" data-del="'+esc(l.code)+'">删除</button></td></tr>'}).join("")}
function parseCountries(t){const o={};for(const line of t.split("\\n")){const s=line.trim();if(!s)continue;const m=s.match(/^([A-Za-z]{2})[\\s,=:：]+(\\S+)$/);if(!m)throw new Error("国家规则这一行看不懂："+s);o[m[1].toUpperCase()]=m[2]}return o}
function payload(){const g=n=>f.elements[n].value.trim();const p={url:g("url"),note:g("note")||null,expiresAt:g("expiresAt")?new Date(g("expiresAt")).toISOString():null,unsafe:f.elements.unsafe.checked,
  devices:{ios:g("ios"),android:g("android"),mobile:g("mobile"),desktop:g("desktop")},countries:parseCountries(f.elements.countries.value),og:{title:g("ogTitle"),description:g("ogDescription"),image:g("ogImage")}};
  const pw=f.elements.password.value;if(pw)p.password=pw;else if(editing&&f.elements.clearPassword.checked)p.password=null;else if(!editing)p.password=null;
  if(!editing&&g("code"))p.code=g("code");return p}
function resetForm(){editing=null;f.reset();f.elements.code.disabled=false;$("#submit").textContent="生成短链";$("#cancel").hidden=true;$("#pwClearRow").hidden=true;$("#pwLabel").textContent="访问密码（留空 = 不设）";$("#adv").open=false}
function startEdit(code){const l=links.find(x=>x.code===code);if(!l)return;resetForm();editing=code;const e=f.elements;
  e.url.value=l.url;e.code.value=l.code;e.code.disabled=true;e.note.value=l.note||"";e.expiresAt.value=localInput(l.expiresAt);e.unsafe.checked=!!l.unsafe;
  for(const k of["ios","android","mobile","desktop"])e[k].value=l.devices?.[k]||"";e.countries.value=Object.entries(l.countries||{}).map(([k,v])=>k+" "+v).join("\\n");
  e.ogTitle.value=l.og?.title||"";e.ogDescription.value=l.og?.description||"";e.ogImage.value=l.og?.image||"";
  if(l.hasPassword){$("#pwClearRow").hidden=false;$("#pwLabel").textContent="访问密码（留空 = 保持不变）"}
  $("#adv").open=!!(l.expiresAt||l.hasPassword||l.unsafe||l.devices||l.countries||l.og);$("#submit").textContent="保存 /"+code;$("#cancel").hidden=false;say("正在编辑 /"+code);scrollTo({top:0,behavior:"smooth"})}
f.addEventListener("submit",async e=>{e.preventDefault();try{const p=payload();
  if(editing){await api("/api/links/"+encodeURIComponent(editing),{method:"PUT",body:JSON.stringify(p)});say("已保存 /"+editing)}
  else{const {link}=await api("/api/links",{method:"POST",body:JSON.stringify(p)});const s=ORIGIN+"/"+link.code;await navigator.clipboard?.writeText(s).catch(()=>{});say("已生成并复制："+s)}
  resetForm();load()}catch(err){say(err.message,true)}});
$("#cancel").onclick=()=>{resetForm();say("")};
const bars=(title,rows)=>{const max=Math.max(1,...rows.map(r=>r.clicks));return '<div><h3>'+title+'</h3><div class="bars">'+(rows.length?rows.map(r=>'<div><span style="width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(r.name)+'</span><i style="width:'+Math.round(r.clicks/max*120)+'px"></i>'+r.clicks+'</div>').join(""):'<span class="muted">暂无数据</span>')+'</div></div>'};
async function showStats(){const body=$("#dlgBody");body.innerHTML='<p class="muted">加载中…</p>';
  try{const s=await api("/api/links/"+encodeURIComponent(statCode)+"/stats?days="+$("#days").value);
    body.innerHTML='<p style="font-size:28px;margin:12px 0 0">'+s.total+' <span class="muted" style="font-size:14px">次访问（日期按 UTC）</span></p><div class="stats">'+bars("每天",s.daily.map(d=>({name:d.day,clicks:d.clicks})))+bars("国家/地区",s.top.countries)+bars("设备",s.top.devices)+bars("系统",s.top.os)+bars("浏览器",s.top.browsers)+bars("来源",s.top.referers)+'</div>'}
  catch(err){body.innerHTML='<p class="err">'+esc(err.message)+'</p>'}}
$("#days").onchange=showStats;
$("#rows").addEventListener("click",async e=>{const t=e.target.dataset;
  if(t.copy){await navigator.clipboard.writeText(t.copy);say("已复制："+t.copy)}
  if(t.edit)startEdit(t.edit);
  if(t.stats){statCode=t.stats;$("#dlgTitle").textContent="/"+t.stats+" 访问统计";$("#dlg").showModal();showStats()}
  if(t.del&&confirm("确定删除 /"+t.del+" 吗？删除后无法恢复。")){try{await api("/api/links/"+encodeURIComponent(t.del),{method:"DELETE"});if(editing===t.del)resetForm();say("已删除 /"+t.del);load()}catch(err){say(err.message,true)}}});
load().catch(err=>say(err.message,true));
</script>`;
  return layout("短链后台", body);
}
