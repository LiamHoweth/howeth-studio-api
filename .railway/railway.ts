import { bucket, defineRailway, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const footballEraPostgres = postgres("football-era-postgres", { region: "sfo" });
  const footballEraPostgresData = volume("football-era-postgres-data", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "sfo", sizeMB: 500 });
  const PostgresPITR = bucket("Postgres-PITR", { region: "sjc" });
  const howethStudioWeb = service("howeth-studio-web", {
    build: "npm ci && npm run build",
    start: "npm start",
    healthcheck: "/",
    healthcheckTimeout: 120,
    replicas: { "sfo": 1 },
    domains: ["howethstudio.com"],
    networking: { privateNetworkEndpoint: "calm-encouragement" },
  });
  const footballEraApi = service("football-era-api", {
    build: "npm ci",
    start: "npm start",
    healthcheck: "/health",
    healthcheckTimeout: 120,
    replicas: { "sfo": 1 },
    networking: { privateNetworkEndpoint: "fantastic-analysis" },
    env: {
      ADMIN_API_KEY: preserve(),
      ADMIN_DASHBOARD_PASSWORD: preserve(),
      ADMIN_DASHBOARD_USER: preserve(),
      DATABASE_URL: preserve(),
      FRONTEND_ORIGIN: preserve(),
      TRUST_PROXY: preserve(),
    },
  });

  return project("Howeth Studio Production", {
    resources: [footballEraPostgres, howethStudioWeb, footballEraApi, footballEraPostgresData, PostgresPITR],
  });
});
