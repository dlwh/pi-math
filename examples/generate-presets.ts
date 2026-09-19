import { mkdir, writeFile } from "node:fs/promises";
import { PRESETS, PRESET_REVISION } from "../src/presets.ts";
const destination = new URL("./providers/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const p of PRESETS) {
    await writeFile(new URL(`${p.id}.models.json`, destination), JSON.stringify({ providers: p.providers }, null, 2) + "\n");
    await writeFile(new URL(`${p.id}.math.json`, destination), JSON.stringify(p.settings, null, 2) + "\n");
}
await writeFile(new URL("manifest.json", destination), JSON.stringify({ revision: PRESET_REVISION, presets: PRESETS.map(({ providers: _providers, settings: _settings, ...metadata }) => metadata) }, null, 2) + "\n");
console.log(`Generated ${PRESETS.length} provider/settings pairs; no model calls.`);
