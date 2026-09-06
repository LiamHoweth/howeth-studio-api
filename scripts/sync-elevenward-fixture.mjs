// Regenerate the API contract fixture from the canonical game bundle.
// The committed result makes backend CI independent of neighboring checkouts.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { validateContentBundle } from '../src/elevenwardValidation.js';
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/sync-elevenward-fixture.mjs /path/to/launch-bundle.json');
const bundle = JSON.parse(await readFile(source, 'utf8'));
const result = validateContentBundle(bundle);
if (!result.valid) throw new Error(result.errors.join('\n'));
const directory = new URL('../test/fixtures/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('elevenward-launch.json', directory), JSON.stringify(bundle));
