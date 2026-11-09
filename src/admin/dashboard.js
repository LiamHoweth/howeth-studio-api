/* Served as an external script under the existing private dashboard CSP. */
"use strict";
const $ = id => document.getElementById(id);
const fmt = value => value == null ? "—" : Number(value).toLocaleString();
const pct = value => value == null ? "—" : (Number(value) * 100).toFixed(1) + "%";
const date = value => value ? new Date(value).toLocaleString() : "—";
let apps = [];
let current = { app: "all", view: "overview" };
let controller;
let generation = 0;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function metrics(items) {
  const grid = element("div", null, "metric-grid");
  for (const [label, value] of items) {
    const card = element("div", null, "metric");
    card.append(element("span", label), element("strong", value));
    grid.append(card);
  }
  return grid;
}
function section(title, description) {
  const node = element("section");
  const head = element("div", null, "section-header");
  const text = element("div");
  const heading = element("h2", title);
  text.append(heading);
  if (description) text.append(element("p", description));
  head.append(text);
  node.append(head);
  node.setAttribute("aria-label", title);
  return node;
}
function empty(title, description) {
  const node = element("div", null, "empty");
  node.append(element("h2", title), element("p", description));
  return node;
}
function table(headers, rows, cells, caption) {
  const wrap = element("div", null, "table-wrap");
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", caption);
  const table = element("table");
  table.append(element("caption", caption));
  const head = element("thead");
  const header = element("tr");
  headers.forEach(label => { const th = element("th", label); th.scope = "col"; header.append(th); });
  head.append(header);
  const body = element("tbody");
  if (!rows.length) {
    const row = element("tr");
    const cell = element("td", "No records to display.", "empty");
    cell.colSpan = headers.length;
    row.append(cell);
    body.append(row);
  }
  rows.forEach(row => {
    const tr = element("tr");
    cells.forEach(render => {
      const value = render(row);
      const td = element("td");
      if (value instanceof Node) td.append(value);
      else td.textContent = value == null ? "—" : String(value);
      if (td.querySelector(".message")) td.className = "message";
      if (td.querySelector("button")) td.className = "actions";
      tr.append(td);
    });
    body.append(tr);
  });
  table.append(head, body);
  wrap.append(table);
  return wrap;
}
async function json(path, { signal, ...init } = {}) {
  const response = await fetch(path, {
    credentials: "same-origin", cache: "no-store", signal,
    ...init, headers: { "content-type": "application/json", ...init.headers }
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Session expired. Reload to sign in." : "Request failed (HTTP " + response.status + ").");
  return response.json();
}
function status(message, error = false) {
  $("status").textContent = message;
  $("status").dataset.error = String(error);
}
function badge(app) {
  return element("span", app.adapter ? "Connected" : app.feedback ? "Feedback only" : "Not connected", "badge " + (app.adapter ? "connected" : app.feedback ? "partial" : ""));
}
function appName(id) { return apps.find(app => app.id === id)?.name || id; }
function renderPortfolio() {
  const connected = apps.filter(app => app.adapter).length;
  $("content").append(metrics([["Projects", fmt(apps.length)], ["Connected data sources", fmt(connected)], ["Feedback sources", fmt(apps.filter(app => app.feedback).length)], ["Awaiting data connection", fmt(apps.filter(app => !app.adapter && !app.feedback).length)]]));
  const panel = section("Your apps & games", "Connection status describes this console, not App Store availability.");
  const search = element("input");
  search.type = "search";
  search.placeholder = "Find an app…";
  search.setAttribute("aria-label", "Find an app");
  panel.firstChild.append(search);
  const results = element("div");
  function draw() {
    const query = search.value.trim().toLocaleLowerCase();
    results.replaceChildren(table(["Project", "Type", "Console connection", "Workspace"], apps.filter(app => app.name.toLocaleLowerCase().includes(query)), [
      app => { const node = element("div", null, "app-name"); node.append(element("span", app.name.split(" ").map(word => word[0]).slice(0, 2).join(""), "app-monogram"), element("span", app.name)); return node; },
      app => app.category, badge,
      app => { const link = element("a", "Open workspace →", "row-link"); link.href = "#/" + app.id + "/overview"; link.setAttribute("aria-label", "Open " + app.name + " workspace"); return link; }
    ], "All projects · each workspace uses its own data source"));
  }
  search.addEventListener("input", draw);
  draw();
  panel.append(results);
  $("content").append(panel);
}
function messagePanel(title, text) { const panel = section(title); panel.append(empty("Data source not connected", text)); $("content").append(panel); }
function placeholder(title, description) {
  const panel = section(title, description);
  panel.append(element("p", "Loading…", "section-body"));
  $("content").append(panel);
  return panel;
}
async function populate(panel, path, render, signal, errors) {
  try {
    const data = await json(path, { signal });
    if (signal.aborted) return;
    panel.lastChild.remove();
    render(data, panel);
  } catch (error) {
    if (signal.aborted) return;
    errors.push(error.message);
    panel.lastChild.remove();
    panel.append(element("p", "This section could not be loaded. " + error.message, "load-error"));
  }
}
async function growth(signal, errors) {
  const panel = section("Activation & retention", "Consenting installations only. Cohorts begin at first growth observation, not installation/download. Existing careers are excluded from new-player activation. Last 90 days; returns require a session in the exact D1 [1,2), D7 [7,8), D30 [30,31) day window, after that entire window has elapsed. Version selects cohort entry version; returns can occur after updating.");
  const labels = { started: "Creation started", completed: "Career saved", NEW_CAREER: "New career", AVATAR: "Avatar", NAME: "Player name", POSITION: "Position", ARCHETYPE: "Archetype", HEIGHT_WEIGHT: "Height & weight", JERSEY_NUMBER: "Jersey number", TEAM_SELECTION: "Team", START_CAREER: "Enter league", under_1m: "Under 1 minute", "1_to_5m": "1–5 minutes", "5_to_15m": "5–15 minutes", "15_to_60m": "15–60 minutes", over_60m: "Over 1 hour", unknown: "Unknown", app_load: "Career data loading", local_save: "Local save", cloud_sync: "Cloud sync", unity_launch: "Field launch acceptance" };
  const form = element("form", null, "toolbar");
  const controls = {};
  for (const [key, title, choices] of [["environment", "Analytics environment", ["production", "development", "test", "unknown"]], ["channel", "Distribution channel", ["app_store", "testflight", "development", "unknown", "all"]]]) {
    const label = element("label", title);
    const select = element("select");
    choices.forEach(value => { const option = element("option", value); option.value = value; select.append(option); });
    controls[key] = select; label.append(select); form.append(label);
  }
  const versionLabel = element("label", "App version (blank = all)");
  const version = element("input"); version.type = "text"; version.maxLength = 32;
  version.pattern = "[A-Za-z0-9._-]{1,32}"; versionLabel.append(version); form.append(versionLabel);
  const button = element("button", "Apply filters", "small"); button.type = "submit"; form.append(button);
  const body = element("div"); body.setAttribute("aria-live", "polite");
  panel.append(form, body); $("content").append(panel);
  let request = 0;
  async function refresh() {
    const token = ++request;
    body.replaceChildren(element("p", "Loading growth statistics…", "section-body"));
    button.disabled = true;
    const query = new URLSearchParams({ environment: controls.environment.value, channel: controls.channel.value, version: version.value });
    try {
      const data = await json("/api/v1/admin/stats/growth?" + query, { signal });
      if (signal.aborted || request !== token) return;
      const s = data.summary;
      body.replaceChildren(metrics([["Observed cohort", fmt(s.observed)], ["Existing progress at entry", fmt(s.existing)], ["No careers at cohort entry", fmt(s.new_players)], ["First game within 24h", pct(s.activationRate)], ["Mature 24h denominator", fmt(s.activation_eligible)]]));
      body.append(table(["Return window", "Eligible", "Returned", "Rate"], data.retention, [r => "Day " + r.horizon, r => fmt(r.eligible), r => fmt(r.retained), r => pct(r.rate)], "Fully observed return windows · all cohort installations"));
      const order = ["started", "NEW_CAREER", "AVATAR", "NAME", "POSITION", "ARCHETYPE", "HEIGHT_WEIGHT", "JERSEY_NUMBER", "TEAM_SELECTION", "START_CAREER", "completed"];
      const counts = new Map(data.onboarding.map(r => [r.step, r.attempts]));
      const steps = order.map(step => ({ step, attempts: counts.get(step) || 0 }));
      body.append(table(["Creation milestone", "Distinct observed attempts", "% of starts"], steps, [r => labels[r.step] || r.step, r => fmt(r.attempts), r => pct(counts.get("started") > 0 ? r.attempts / counts.get("started") : null)], "Career creation · forward step confirmations and durably saved careers; attempts may begin on a resumed step"));
      body.append(table(["Position", "Started as", "Installations", "Games started", "Games completed", "Completion rate"], data.modes, [r => r.position, r => r.mode, r => fmt(r.installations), r => fmt(r.started), r => fmt(r.completed), r => pct(r.completionRate)], "Career gameplay · matched opaque attempts; batch simulation is measured at durable completion; open games are not proven abandonment"));
      const timingOrder = ["under_1m", "1_to_5m", "5_to_15m", "15_to_60m", "over_60m", "unknown"];
      const timing = new Map(data.timing.map(r => [r.bucket, r.installations]));
      body.append(table(["Elapsed wall time", "New-player installations"], timingOrder.map(bucket => ({ bucket, installations: timing.get(bucket) || 0 })), [r => labels[r.bucket] || r.bucket, r => fmt(r.installations)], "Time from consented observation to first durably completed game · includes background time"));
      body.append(table(["Operation", "Result", "Timing category", "Observations", "Affected installations"], data.reliability, [r => labels[r.operation] || r.operation, r => r.result, r => r.latency_bucket, r => fmt(r.observations), r => fmt(r.installations)], "Reliability diagnostics · each operation/result/timing category sampled once per session; not crash rate or per-operation success rate"));
      const details = element("details"); details.append(element("summary", "Measurement coverage · includes legacy and test data"), table(["Environment", "Channel", "Occurrence version", "Events"], data.coverage, [r => r.environment, r => r.channel, r => r.version, r => fmt(r.events)], "All 90-day telemetry coverage · independent of selected growth filters")); body.append(details);
    } catch (error) {
      if (signal.aborted || request !== token) return;
      errors.push(error.message); body.replaceChildren(element("p", "Growth statistics could not load. " + error.message, "load-error"));
    } finally { if (!signal.aborted && request === token) button.disabled = false; }
  }
  form.addEventListener("submit", event => { event.preventDefault(); void refresh(); });
  await refresh();
}
async function football(signal, errors) {
  const overview = placeholder("Audience", "Consented API registrations and account records. These are not App Store downloads.");
  const growthTask = growth(signal, errors);
  const retention = placeholder("Return activity", "Legacy registration cohorts: fully elapsed D1/D7/D30 return windows, any observed event. Separate from the filtered growth cohorts below and from App Store downloads. Missing rates are shown as a dash.");
  const funnel = placeholder("Career activity", "All-time independent installation counts. These do not establish ordered conversion.");
  const balance = placeholder("Position balance", "Average recorded career statistics by position.");
  const health = placeholder("Leaderboard health", "Published careers and rejected submissions.");
  const base = "/api/v1/admin/stats/";
  await Promise.all([
    growthTask,
    populate(overview, base + "overview", (data, panel) => panel.append(metrics([["Registered installations", fmt(data.installations)], ["Accounts", fmt(data.accounts)], ["Last contact · 1 day", fmt(data.dau)], ["Last contact · 7 days", fmt(data.wau)], ["Last contact · 30 days", fmt(data.mau)], ["Events", fmt(data.events)], ["Cloud slots", fmt(data.cloud_slots)], ["Careers", fmt(data.careers)], ["Public careers", fmt(data.public_careers)], ["Most common version", data.current_app_version || "—"]])), signal, errors),
    populate(retention, base + "retention", (data, panel) => {
      panel.append(metrics([["Day 1 return", pct(data.d1.rate)], ["Day 7 return", pct(data.d7.rate)], ["Day 30 return", pct(data.d30.rate)], ["Peak observed activity · 30 days", fmt(Math.max(0, ...data.dailyActiveInstallations.map(row => Number(row.count))))]]));
      const body = element("div", null, "section-body");
      const bars = element("div", null, "bar-list");
      bars.setAttribute("aria-label", "Daily observed installation activity");
      const daily = data.dailyActiveInstallations;
      const max = Math.max(1, ...daily.map(row => Number(row.count)));
      daily.forEach(row => { const bar = element("div", null, "bar"); bar.style.height = Math.max(2, Number(row.count) / max * 100) + "%"; bar.title = row.day + ": " + fmt(row.count); bars.append(bar); });
      body.append(bars);
      const labels = element("div", null, "chart-caption");
      labels.append(element("span", daily[0]?.day || "No observations"), element("span", daily.at(-1)?.day || ""));
      body.append(labels);
      const details = element("details");
      details.append(element("summary", "View daily counts"), table(["Day", "Active installations"], daily, [row => row.day, row => fmt(row.count)], "Observed daily activity"));
      body.append(details);
      panel.append(body);
    }, signal, errors),
    populate(funnel, base + "funnel", (data, panel) => {
      const grid = element("div", null, "funnel");
      data.steps.filter(step => !step.group || step.group === "career_activity").forEach(step => { const node = element("div", null, "funnel-step"); node.append(element("strong", fmt(step.installations)), element("span", step.label + " · " + pct(step.conversion))); grid.append(node); });
      panel.append(grid);
    }, signal, errors),
    populate(balance, base + "balance", (data, panel) => panel.append(table(["Position", "Careers", "Games", "Yards", "TD", "OVR", "Win rate"], data.positions, [r => r.position, r => fmt(r.careers), r => Number(r.avg_games || 0).toFixed(1), r => fmt(Math.round(r.avg_yards || 0)), r => Number(r.avg_touchdowns || 0).toFixed(1), r => Number(r.avg_overall || 0).toFixed(1), r => pct(r.win_rate)], "Recorded career averages")), signal, errors),
    populate(health, base + "leaderboard-health", (data, panel) => panel.append(metrics([["Public careers", fmt(data.public_careers)], ["Active · 7 days", fmt(data.active_public_careers)], ["Rejected · 24 hours", fmt(data.rejected_24h)], ["Rejected · all time", fmt(data.rejected_total)]]), table(["Reason", "Rejected submissions"], data.rejection_reasons, [r => r.reason, r => fmt(r.count)], "Rejection reasons")), signal, errors)
  ]);
}
async function elevenward(signal, errors) {
  const operations = placeholder("Operations", "Elevenward account, sync, entitlement and event records.");
  const releases = placeholder("Content releases", "Read-only release inventory. Publishing and rollback remain in the existing staff tools.");
  await Promise.all([
    populate(operations, "/v1/elevenward/admin/operations", (data, panel) => {
      const s = data.summary;
      if (!s) { panel.append(empty("No operational summary", "This source has not supplied summary data.")); return; }
      panel.append(metrics([["Accounts", fmt(s.accounts)], ["Active sessions", fmt(s.activeSessions)], ["Career slots", fmt(s.careerSlots)], ["Pending sync conflicts", fmt(s.pendingConflicts)], ["Active entitlements", fmt(s.activeEntitlements)], ["Events · 24 hours", fmt(s.analyticsEvents24h)], ["Unprocessed webhooks", fmt(s.unprocessedWebhooks)], ["Published content", s.publishedRelease || "—"]]));
      panel.append(table(["Time", "Action", "Resource"], data.actions || [], [r => date(r.createdAt || r.created_at), r => r.action, r => r.resourceType || r.resource_type], "Recent staff activity · up to 25 actions"));
    }, signal, errors),
    populate(releases, "/v1/elevenward/admin/content/releases", (data, panel) => panel.append(table(["Release", "Status", "Minimum client", "Maximum client", "Published"], data.releases, [r => r.releaseVersion, r => r.status, r => r.compatibleClient?.minimum, r => r.compatibleClient?.maximum || "—", r => date(r.publishedAt)], "Content release history")), signal, errors)
  ]);
}
function actionButton(label, action, className = "") {
  const button = element("button", label, "small " + className);
  button.type = "button";
  button.addEventListener("click", async () => {
    const token = generation;
    button.disabled = true;
    try { const changed = await action(); if (token === generation && changed !== false) await load(); }
    catch (error) { if (token === generation) status("Action failed. " + error.message, true); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  return button;
}
async function feedback(app, signal, errors) {
  if (app && !app.feedback) { messagePanel("Feedback", app.name + " does not yet send feedback to this console."); return; }
  const panel = placeholder("Feedback inbox", "Up to 100 most recent submissions from " + (app ? app.name : "connected feedback sources") + ".");
  const query = app ? "?product=" + encodeURIComponent(app.id) : "";
  await populate(panel, "/api/v1/admin/feedback" + query, (data, node) => {
    node.append(metrics([["Unread", fmt(data.summary.unread)], ["All submissions", fmt(data.summary.total)]]));
    const toolbar = element("div", null, "toolbar");
    const searchLabel = element("label", "Search messages");
    const search = element("input"); search.type = "search"; search.placeholder = "Message, app, support code…"; searchLabel.append(search);
    const statusLabel = element("label", "Status");
    const filter = element("select");
    [["all", "All statuses"], ["new", "New"], ["reviewed", "Reviewed"], ["resolved", "Resolved"]].forEach(([value, label]) => { const option = element("option", label); option.value = value; filter.append(option); });
    statusLabel.append(filter); toolbar.append(searchLabel, statusLabel); node.append(toolbar);
    const results = element("div"); node.append(results);
    function draw() {
      const q = search.value.toLocaleLowerCase();
      const rows = data.submissions.filter(row => (filter.value === "all" || row.status === filter.value) && [row.message, appName(row.product), row.support_code, row.category].some(value => String(value || "").toLocaleLowerCase().includes(q)));
      results.replaceChildren(table(["Received", "App", "Category / source", "Message", "Support code", "Reply email", "Status", "Actions"], rows, [
        r => date(r.created_at), r => appName(r.product || "football_era"), r => r.category + " / " + r.source + (r.app_version ? " · " + r.app_version : ""),
        r => { const message = element("div", r.message, "message"); if (r.diagnostics && Object.keys(r.diagnostics).length) { const details = element("details"); details.append(element("summary", "Reviewed diagnostics"), element("pre", JSON.stringify(r.diagnostics, null, 2))); message.append(details); } return message; },
        r => r.support_code || "—", r => r.contact_email || "—", r => element("span", r.status, "badge"),
        r => { const actions = element("div"); for (const [state, label] of [["reviewed", "Mark reviewed"], ["resolved", "Resolve"]]) { if (r.status !== state) actions.append(actionButton(label, () => json("/api/v1/admin/feedback/" + encodeURIComponent(r.id), { method: "PATCH", body: JSON.stringify({ status: state }) }))); } return actions; }
      ], "Recent feedback · filtered within the loaded 100 submissions"));
    }
    search.addEventListener("input", draw); filter.addEventListener("change", draw); draw();
  }, signal, errors);
}
async function moderation(app, signal, errors) {
  const sources = app ? [app].filter(source => source.adapter) : apps.filter(source => source.adapter);
  if (!sources.length) { messagePanel("Username moderation", app.name + " has no moderation source connected to this console."); return; }
  await Promise.all(sources.map(async source => {
    const panel = placeholder(source.name + " · username reports", "New reports and previous suspensions. Actions apply only to " + source.name + ".");
    const base = source.adapter === "football" ? "/api/v1/admin/username-reports" : "/v1/elevenward/admin/username-reports";
    try {
      const [pending, actioned] = await Promise.all([json(base, { signal }), json(base + "?status=actioned", { signal })]);
      if (signal.aborted) return;
      panel.lastChild.remove();
      const rows = [...pending.reports, ...actioned.reports];
      panel.append(table(["Reported", "Username", "Reason", "Status", "Actions"], rows, [r => date(r.created_at), r => r.public_username || "Generated alias", r => r.reason, r => element("span", r.status, "badge"), r => {
        const node = element("div");
        const actions = r.username_suspended_at ? [["restore", "Restore username"]] : [["dismiss", "Dismiss"], ["suspend", "Suspend username"]];
        actions.forEach(([action, label]) => node.append(actionButton(label, () => {
          if (action === "suspend" && !confirm("Suspend this " + source.name + " public username and use generated leaderboard aliases?")) return false;
          return json(base + "/" + encodeURIComponent(r.id), { method: "PATCH", body: JSON.stringify({ action }) });
        }, action === "suspend" ? "danger" : "")));
        return node;
      }], "Up to 100 new and 100 actioned reports · " + source.name));
    } catch (error) {
      if (signal.aborted) return;
      errors.push(error.message); panel.lastChild.remove(); panel.append(element("p", error.message, "load-error"));
    }
  }));
}
function route() {
  const [app, view] = location.hash.replace(/^#\//, "").split("/");
  return { app: apps.some(item => item.id === app) ? app : "all", view: ["overview", "feedback", "moderation"].includes(view) ? view : "overview" };
}
async function load() {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  const token = ++generation;
  const previous = current;
  current = route();
  if (previous.app !== current.app || previous.view !== current.view) window.scrollTo(0, 0);
  const app = apps.find(item => item.id === current.app);
  const name = app?.name || "All apps";
  $("app-select").value = current.app;
  $("breadcrumb").textContent = name;
  $("page-eyebrow").textContent = app ? app.category + " workspace" : "Portfolio";
  $("page-title").textContent = current.view === "overview" ? (app?.name || "Studio overview") : current.view === "feedback" ? "Feedback inbox" : "Username moderation";
  $("page-description").textContent = app ? "Manage " + app.name + " in your studio workspace." : "One workspace for your apps and games.";
  document.title = (app?.name || "Beopity") + " — Studio Console";
  document.querySelectorAll("nav a[data-view]").forEach(link => {
    link.href = "#/" + current.app + "/" + link.dataset.view;
    if (link.dataset.view === current.view) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $("content").replaceChildren();
  $("content").setAttribute("aria-busy", "true");
  $("refresh").disabled = true;
  status("Refreshing " + name + "…");
  const errors = [];
  try {
    if (current.view === "feedback") await feedback(app, signal, errors);
    else if (current.view === "moderation") await moderation(app, signal, errors);
    else if (!app) renderPortfolio();
    else if (app.adapter === "football") await football(signal, errors);
    else if (app.adapter === "elevenward") await elevenward(signal, errors);
    else if (app.feedback) {
      const panel = section("Studio website"); panel.append(empty("Feedback workspace", "Open Feedback to review submissions sent through the studio website.")); $("content").append(panel);
    } else messagePanel(app.name + " workspace", app.name + " is in your project list. Its analytics and admin tools have not been connected here yet.");
    if (token !== generation) return;
    const hasSource = current.view === "overview" ? Boolean(app?.adapter) : current.view === "feedback" ? !app || app.feedback : !app || Boolean(app.adapter);
    status(errors.length ? errors.length + " section(s) unavailable. Other loaded sections remain usable. " + errors[0] : hasSource ? "Updated " + new Date().toLocaleString() + " · " + name : app && !app.adapter && !app.feedback ? "Workspace ready · no data source connected" : "Project inventory · data connections shown below", errors.length > 0);
  } catch (error) { if (!signal.aborted) status("Workspace unavailable. " + error.message, true); }
  finally { if (token === generation) { $("content").setAttribute("aria-busy", "false"); $("refresh").disabled = false; } }
}
async function init() {
  try {
    const data = await json("/api/v1/admin/apps");
    apps = data.apps;
    apps.forEach(app => { const option = element("option", app.name); option.value = app.id; $("app-select").append(option); });
    $("app-select").addEventListener("change", () => { location.hash = "#/" + $("app-select").value + "/" + current.view; });
    $("refresh").addEventListener("click", load);
    document.querySelector(".skip-link").addEventListener("click", event => {
      event.preventDefault();
      $("main").focus();
      $("main").scrollIntoView();
    });
    window.addEventListener("hashchange", load);
    await load();
  } catch (error) {
    $("content").setAttribute("aria-busy", "false");
    status("Could not load the app directory. " + error.message, true);
    const retry = actionButton("Retry connection", () => { location.reload(); return false; });
    $("content").append(retry);
    $("refresh").disabled = true;
  }
}
init();
