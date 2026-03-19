import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReferenceFixtures } from "./corpus.ts";
import { writeManifest, type QManifest } from "./q-process.ts";

const ROOT_URL = "https://code.kx.com/q/";
const CARD_URL = "https://code.kx.com/q/ref/";
const EXTRA_URLS = [
  "https://code.kx.com/q/basics/syntax/",
  "https://code.kx.com/q/basics/variadic/",
  "https://code.kx.com/q/basics/control/",
  "https://code.kx.com/q/basics/namespaces/",
  "https://code.kx.com/q/ref/dotq/",
  "https://code.kx.com/q/ref/dotz/"
];

const outFile = fileURLToPath(new URL("../fixtures/reference-manifest.json", import.meta.url));

const extractLinks = (html: string) => {
  const links = new Set<string>();
  for (const match of html.matchAll(/href="(\/q\/ref\/[^"#?]+\/?)"/g)) {
    links.add(new URL(match[1] ?? "", ROOT_URL).toString());
  }
  return [...links].sort();
};

const fetchText = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
};

const main = async () => {
  const card = await fetchText(CARD_URL);
  const pageUrls = new Set([...extractLinks(card), ...EXTRA_URLS]);
  const manifests: QManifest[] = [];

  for (const pageUrl of pageUrls) {
    const html = await fetchText(pageUrl);
    manifests.push({
      generatedAt: new Date().toISOString(),
      source: pageUrl,
      fixtures: buildReferenceFixtures(pageUrl, html)
    });
  }

  const manifest: QManifest = {
    generatedAt: new Date().toISOString(),
    source: "official KX reference pages",
    fixtures: manifests.flatMap((m) => m.fixtures)
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

export { main as extractReferenceFixtures };
