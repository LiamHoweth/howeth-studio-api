export function renderAdminDashboard() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>Football Era — Developer Dashboard</title>
    <link rel="stylesheet" href="/admin/dashboard.css">
  </head>
  <body>
    <header>
      <div><span class="eyebrow">Howeth Studio · Private</span><h1>Football Era telemetry</h1></div>
      <button id="refresh" type="button">Refresh data</button>
    </header>
    <main>
      <p id="status" class="status">Loading production aggregates…</p>
      <section aria-labelledby="overview-title"><h2 id="overview-title">Audience</h2><div id="overview" class="metric-grid"></div></section>
      <section aria-labelledby="retention-title"><h2 id="retention-title">Retention</h2><div id="retention" class="metric-grid"></div><div id="daily" class="bar-list"></div></section>
      <section aria-labelledby="funnel-title"><h2 id="funnel-title">Career funnel</h2><div id="funnel" class="funnel"></div></section>
      <section aria-labelledby="balance-title"><h2 id="balance-title">Position balance</h2><div class="table-wrap"><table><thead><tr><th>Position</th><th>Careers</th><th>Games</th><th>Yards</th><th>TD</th><th>OVR</th><th>Win rate</th></tr></thead><tbody id="balance"></tbody></table></div></section>
      <section aria-labelledby="leaderboards-title"><h2 id="leaderboards-title">Leaderboard health</h2><div id="leaderboards" class="metric-grid"></div><div class="table-wrap"><table><thead><tr><th>Reason</th><th>Rejected submissions</th></tr></thead><tbody id="rejections"></tbody></table></div></section>
      <section aria-labelledby="feedback-title"><h2 id="feedback-title">Player feedback</h2><div id="feedback-summary" class="metric-grid"></div><div class="table-wrap"><table><thead><tr><th>Received</th><th>Category</th><th>Source</th><th>Message</th><th>Reply email</th><th>Status</th><th>Action</th></tr></thead><tbody id="feedback"></tbody></table></div></section>
      <section aria-labelledby="moderation-title"><h2 id="moderation-title">Username moderation</h2><div class="table-wrap"><table><thead><tr><th>Reported</th><th>Username</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody id="username-reports"></tbody></table></div></section>
    </main>
    <script src="/admin/dashboard.js" defer></script>
  </body>
</html>`;
}

export const adminDashboardCss = `
:root{color-scheme:dark;--bg:#090e18;--panel:#121a2a;--rule:#2b364a;--ink:#f4f0e7;--muted:#93a0b5;--green:#68c58d;--gold:#d7b466;--danger:#ef8b8b}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}header,main{width:min(1180px,calc(100% - 32px));margin:auto}header{display:flex;align-items:end;justify-content:space-between;gap:24px;padding:48px 0 30px;border-bottom:1px solid var(--rule)}h1{margin:.25rem 0 0;font-family:system-ui,sans-serif;font-size:clamp(2rem,5vw,4rem);letter-spacing:-.06em}.eyebrow,h2{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}button{border:1px solid var(--green);background:var(--green);color:#07120c;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}button.small{padding:7px 9px;margin:2px;font-size:.72rem}button.secondary{background:transparent;color:var(--ink);border-color:var(--rule)}button.danger{background:transparent;color:var(--danger);border-color:var(--danger)}main{padding:18px 0 80px}.status{color:var(--muted);min-height:1.5em}section{margin-top:36px}.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid var(--rule);border-left:1px solid var(--rule)}.metric{padding:20px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);background:var(--panel)}.metric span{display:block;color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.1em}.metric strong{display:block;margin-top:8px;font:700 1.7rem system-ui,sans-serif}.funnel{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.funnel-step{background:var(--panel);border:1px solid var(--rule);padding:20px}.funnel-step strong{display:block;font:700 2rem system-ui,sans-serif}.funnel-step span{color:var(--muted)}.table-wrap{overflow:auto;border:1px solid var(--rule)}table{width:100%;border-collapse:collapse;background:var(--panel)}th,td{text-align:left;padding:14px;border-bottom:1px solid var(--rule);white-space:nowrap}td.message{white-space:normal;min-width:280px;max-width:520px;line-height:1.45}th{color:var(--muted);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}.bar-list{display:flex;align-items:end;gap:4px;height:120px;margin-top:12px}.bar{flex:1;min-width:4px;background:var(--green);opacity:.8}.empty{color:var(--muted);padding:18px}@media(max-width:760px){header{align-items:start;flex-direction:column}.metric-grid,.funnel{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export const adminDashboardJs = `
const $ = (id) => document.getElementById(id);
const fmt = (value) => Number(value ?? 0).toLocaleString();
const pct = (value) => value == null ? "—" : (Number(value) * 100).toFixed(1) + "%";
function metric(label,value){const el=document.createElement("div");el.className="metric";const name=document.createElement("span");name.textContent=label;const number=document.createElement("strong");number.textContent=value;el.append(name,number);return el}
function fillMetrics(target,items){target.replaceChildren(...items.map(([label,value])=>metric(label,value)))}
function fillRows(target,rows,cells){target.replaceChildren(...rows.map(row=>{const tr=document.createElement("tr");for(const cell of cells){const td=document.createElement("td");td.textContent=cell(row);tr.append(td)}return tr}))}
async function json(path,init={}){const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...init,headers:{"content-type":"application/json",...(init.headers||{})}});if(!response.ok)throw new Error(path+" returned "+response.status);return response.json()}
function button(label,className,onClick){const el=document.createElement("button");el.type="button";el.className="small "+className;el.textContent=label;el.addEventListener("click",onClick);return el}
function renderFeedback(data){fillMetrics($("feedback-summary"),[["Unread",fmt(data.summary.unread)],["All submissions",fmt(data.summary.total)]]);$("feedback").replaceChildren(...data.submissions.map(row=>{const tr=document.createElement("tr");const values=[new Date(row.created_at).toLocaleString(),row.category,row.source+(row.app_version?" · "+row.app_version:""),row.message,row.contact_email||"—",row.status];values.forEach((value,index)=>{const td=document.createElement("td");td.textContent=value;if(index===3)td.className="message";tr.append(td)});const actions=document.createElement("td");if(row.status!=="reviewed")actions.append(button("Reviewed","secondary",()=>updateFeedback(row.id,"reviewed")));if(row.status!=="resolved")actions.append(button("Resolve","secondary",()=>updateFeedback(row.id,"resolved")));tr.append(actions);return tr}))}
function renderReports(data){$("username-reports").replaceChildren(...data.reports.map(row=>{const tr=document.createElement("tr");[new Date(row.created_at).toLocaleString(),row.public_username||"Generated alias",row.reason,row.status].forEach(value=>{const td=document.createElement("td");td.textContent=value;tr.append(td)});const actions=document.createElement("td");if(row.username_suspended_at){actions.append(button("Restore username","secondary",()=>updateReport(row.id,"restore")))}else{actions.append(button("Dismiss","secondary",()=>updateReport(row.id,"dismiss")),button("Suspend username","danger",()=>updateReport(row.id,"suspend")))}tr.append(actions);return tr}))}
async function updateFeedback(id,status){await json("/api/v1/admin/feedback/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status})});await load()}
async function updateReport(id,action){if(action==="suspend"&&!confirm("Suspend this public username and return its leaderboard entries to generated aliases?"))return;await json("/api/v1/admin/username-reports/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({action})});await load()}
async function load(){
  $("status").textContent="Refreshing production aggregates…";
  try{
    const [overview,retention,funnel,balance,health,feedback,reports,actionedReports]=await Promise.all([
      json("/api/v1/admin/stats/overview"),json("/api/v1/admin/stats/retention"),json("/api/v1/admin/stats/funnel"),json("/api/v1/admin/stats/balance"),json("/api/v1/admin/stats/leaderboard-health"),json("/api/v1/admin/feedback"),json("/api/v1/admin/username-reports"),json("/api/v1/admin/username-reports?status=actioned")
    ]);
    fillMetrics($("overview"),[["Installations",fmt(overview.installations)],["Accounts",fmt(overview.accounts)],["DAU",fmt(overview.dau)],["WAU",fmt(overview.wau)],["MAU",fmt(overview.mau)],["Events",fmt(overview.events)],["Cloud slots",fmt(overview.cloud_slots)],["Careers",fmt(overview.careers)],["Public careers",fmt(overview.public_careers)],["Current version",overview.current_app_version||"—"]]);
    fillMetrics($("retention"),[["D1",pct(retention.d1.rate)],["D7",pct(retention.d7.rate)],["D30",pct(retention.d30.rate)],["30-day peak DAU",fmt(Math.max(0,...retention.dailyActiveInstallations.map(x=>x.count)))]]);
    const daily=retention.dailyActiveInstallations;const max=Math.max(1,...daily.map(x=>Number(x.count)));$("daily").replaceChildren(...daily.map(row=>{const bar=document.createElement("div");bar.className="bar";bar.style.height=(Math.max(3,Number(row.count)/max*100))+"%";bar.title=row.day+": "+row.count;return bar}));
    $("funnel").replaceChildren(...funnel.steps.map(step=>{const el=document.createElement("div");el.className="funnel-step";const count=document.createElement("strong");count.textContent=fmt(step.installations);const label=document.createElement("span");label.textContent=step.label+" · "+pct(step.conversion);el.append(count,label);return el}));
    fillRows($("balance"),balance.positions,[r=>r.position,r=>fmt(r.careers),r=>Number(r.avg_games||0).toFixed(1),r=>fmt(Math.round(r.avg_yards||0)),r=>Number(r.avg_touchdowns||0).toFixed(1),r=>Number(r.avg_overall||0).toFixed(1),r=>pct(r.win_rate)]);
    fillMetrics($("leaderboards"),[["Opted-in careers",fmt(health.public_careers)],["Active in 7 days",fmt(health.active_public_careers)],["Rejected in 24h",fmt(health.rejected_24h)],["Rejected all time",fmt(health.rejected_total)]]);
    fillRows($("rejections"),health.rejection_reasons,[r=>r.reason,r=>fmt(r.count)]);
    renderFeedback(feedback);renderReports({reports:[...reports.reports,...actionedReports.reports]});
    $("status").textContent="Updated "+new Date().toLocaleString();
  }catch(error){$("status").textContent="Dashboard unavailable: "+error.message}
}
$("refresh").addEventListener("click",load);load();
`;
