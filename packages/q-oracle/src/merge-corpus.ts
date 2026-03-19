import { mkdir } from "node:fs/promises";
import { access } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractReferenceFixtures } from "./reference.ts";
import { extractUpstreamFixtures } from "./jq-fixtures.ts";
import { mergeManifests } from "./corpus.ts";
import { readManifest, writeManifest } from "./q-process.ts";

const REF_PATH = fileURLToPath(new URL("../fixtures/reference-manifest.json", import.meta.url));
const JQ_PATH = fileURLToPath(new URL("../fixtures/upstream-manifest.json", import.meta.url));
const OUT_PATH = fileURLToPath(new URL("../fixtures/differential-corpus.json", import.meta.url));

const ensureSourceManifests = async () => {
  const refs = [REF_PATH, JQ_PATH];
  for (const path of refs) {
    try {
      await access(path);
    } catch {
      if (path === REF_PATH) {
        await extractReferenceFixtures();
      } else {
        await extractUpstreamFixtures();
      }
    }
  }
};

const main = async () => {
  await ensureSourceManifests();
  const ref = await readManifest(REF_PATH);
  const jq = await readManifest(JQ_PATH);
  const merged = mergeManifests(ref, jq);
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeManifest(merged, OUT_PATH);
  process.stdout.write(`${OUT_PATH}\n`);
};

if (process.argv.includes("--write")) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}

export { main as mergeCorpora };
