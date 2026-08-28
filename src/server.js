import { createApp } from "./app.js";
import { createDatabase } from "./database.js";

const port = Number(process.env.PORT) || 8787;
const database = createDatabase();
const app = createApp({ database });

void database.purgeExpiredData().catch((error) => console.error("Retention cleanup failed", error));
const cleanup = setInterval(() => {
  void database.purgeExpiredData().catch((error) => console.error("Retention cleanup failed", error));
}, 24 * 60 * 60 * 1000);
cleanup.unref();

app.listen(port, "0.0.0.0", () => {
  console.info(`howethstudio-api listening on :${port}`);
});
