import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function renderAdminDashboard() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Beopity — Studio Console</title>
  <link rel="stylesheet" href="/admin/dashboard.css?v=${assetVersion}">
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <aside class="sidebar">
    <a class="brand" href="#/all/overview"><span class="brand-mark" aria-hidden="true">b.</span><span>beopity<span class="brand-caption">STUDIO CONSOLE</span></span></a>
    <div class="workspace-control"><label for="app-select">Workspace</label><select id="app-select"><option value="all">All apps</option></select></div>
    <p class="nav-label">Manage</p>
    <nav aria-label="Console"><a data-view="overview" href="#/all/overview" aria-current="page"><span aria-hidden="true">01</span> Overview</a><a data-view="feedback" href="#/all/feedback"><span aria-hidden="true">02</span> Feedback</a><a data-view="moderation" href="#/all/moderation"><span aria-hidden="true">03</span> Moderation</a></nav>
    <div class="sidebar-footer"><span class="private-label">Private workspace</span><p>App data stays scoped to its source.</p></div>
  </aside>
  <div class="workspace">
    <header class="topbar"><span>Studio / <span id="breadcrumb">All apps</span></span><span class="private-label">ADMIN</span></header>
    <main id="main" tabindex="-1">
      <div class="page-header"><div><p class="eyebrow" id="page-eyebrow">Portfolio</p><h1 id="page-title">Studio overview</h1><p id="page-description">One workspace for your apps and games.</p></div><button id="refresh" type="button">Refresh data <span aria-hidden="true">↻</span></button></div>
      <div class="status-line"><p id="status" role="status" aria-live="polite">Loading workspace…</p></div>
      <div id="content" aria-busy="true"></div>
      <noscript><p class="notice">Enable JavaScript to view console data.</p></noscript>
      <footer class="page-footer">Beopity Studio Console <span>Private · Source-scoped data</span></footer>
    </main>
  </div>
  <script src="/admin/dashboard.js?v=${assetVersion}" defer></script>
</body>
</html>`;
}

export const adminDashboardCss = readFileSync(new URL("./admin/dashboard.css", import.meta.url), "utf8");
export const adminDashboardJs = readFileSync(new URL("./admin/dashboard.js", import.meta.url), "utf8");

const assetVersion = createHash("sha256").update(adminDashboardCss).update(adminDashboardJs).digest("hex").slice(0, 12);
