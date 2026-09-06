import { createApp } from "./app.js";
import { createDatabase } from "./database.js";
import { createElevenwardDatabase } from "./elevenwardDatabase.js";

const port = Number(process.env.PORT) || 8787;
const database = createDatabase();
const elevenwardDatabase = createElevenwardDatabase();
const app = createApp({ database, elevenwardDatabase });

void database.purgeExpiredData().catch((error) => console.error("Retention cleanup failed", error));
void elevenwardDatabase.purgeExpiredData().catch((error) => console.error("Elevenward retention cleanup failed", error));
const cleanup = setInterval(() => {
  void database.purgeExpiredData().catch((error) => console.error("Retention cleanup failed", error));
  void elevenwardDatabase.purgeExpiredData().catch((error) => console.error("Elevenward retention cleanup failed", error));
}, 24 * 60 * 60 * 1000);
cleanup.unref();

app.listen(port, "0.0.0.0", () => {
  console.info(`howethstudio-api listening on :${port}`);
});
