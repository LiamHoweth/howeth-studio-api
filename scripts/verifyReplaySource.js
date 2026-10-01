import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
const root = resolve("vendor/elevenward_core");
const manifest = JSON.parse(
  readFileSync(resolve(root, "SOURCE_MANIFEST.json")),
);
if (
  manifest.rulesVersion !== "2026.5" ||
  manifest.contentVersion !== "2026.4.0"
)
  throw new Error("Unexpected replay version pin");
for (const [file, expected] of Object.entries(manifest.files)) {
  const target = resolve(root, file);
  if (!target.startsWith(root + sep)) throw new Error("Invalid manifest path");
  const actual = createHash("sha256")
    .update(readFileSync(target))
    .digest("hex");
  if (actual !== expected)
    throw new Error(`Replay source checksum mismatch: ${file}`);
}
console.log(
  `Verified ${Object.keys(manifest.files).length} pinned Dart replay source files.`,
);
