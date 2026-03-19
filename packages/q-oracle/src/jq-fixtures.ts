import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildUpstreamFixtures } from "./corpus.ts";
import { writeManifest, type QManifest } from "./q-process.ts";

const TEST_FILES = [
  "TanOpTest.java",
  "MaxOpTest.java",
  "SqrtOpTest.java",
  "LowerOpTest.java",
  "MdevOpTest.java",
  "AtanOpTest.java",
  "DistinctOpTest.java",
  "FillOpTest.java",
  "LastOpTest.java",
  "AttrOpTest.java",
  "AvgOpTest.java",
  "VarOpTest.java",
  "PrdOpTest.java",
  "MinOpTest.java",
  "SdevOpTest.java",
  "UpperOpTest.java",
  "OpTest.java",
  "TilOpTest.java",
  "SvarOpTest.java",
  "AsinOpTest.java",
  "DevOpTest.java"
];

const BASE_URL =
  "https://raw.githubusercontent.com/timestored/jq/master/jqi/src/test/java/com/kdbtest/";

const outFile = fileURLToPath(new URL("../fixtures/upstream-manifest.json", import.meta.url));

const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
};

const main = async () => {
  const fixtures = [];

  for (const file of TEST_FILES) {
    const source = await fetchText(`${BASE_URL}${file}`);
    fixtures.push(...buildUpstreamFixtures(file.replace(/\.java$/, ""), source));
  }

  const manifest: QManifest = {
    generatedAt: new Date().toISOString(),
    source: "timestored/jq upstream tests",
    fixtures
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeManifest(manifest, outFile);
  process.stdout.write(`${outFile}\n`);
};

if (process.argv.includes("--write")) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}

export { main as extractUpstreamFixtures };
