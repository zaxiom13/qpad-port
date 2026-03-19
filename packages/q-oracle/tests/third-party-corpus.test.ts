import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

interface ThirdPartyCorpusFile {
  label: string;
  path: string;
  repo: string;
  commit: string;
  license: string;
  selected: string[];
}

interface ExtractedSnippet {
  name: string;
  head: string;
  program: string;
}

const corpusFiles: ThirdPartyCorpusFile[] = [
  {
    label: "KxSystems/ml stats.q",
    path: "fixtures/third-party/KxSystems/ml/stats/stats.q",
    repo: "https://github.com/KxSystems/ml",
    commit: "5509fa6cfc454c68bf3441672fe1a26cb5a19088",
    license: "Apache-2.0",
    selected: [
      "stats.OLS.fit",
      "stats.OLS.predict",
      "stats.WLS.predict",
      "stats.describeFuncs",
      "stats.percentile"
    ]
  },
  {
    label: "KxSystems/ml utils.q",
    path: "fixtures/third-party/KxSystems/ml/stats/utils.q",
    repo: "https://github.com/KxSystems/ml",
    commit: "5509fa6cfc454c68bf3441672fe1a26cb5a19088",
    license: "Apache-2.0",
    selected: [
      "stats.i.checkLen",
      "stats.i.OLSstats",
      "stats.i.logLikelihood",
      "stats.i.coefStats",
      "stats.i.coefStdErr",
      "stats.i.CI95",
      "infTypes",
      "stats.i.infinity",
      "stats.i.updFuncDict"
    ]
  },
  {
    label: "KxSystems/ml optimize.q",
    path: "fixtures/third-party/KxSystems/ml/optimize/optimize.q",
    repo: "https://github.com/KxSystems/ml",
    commit: "5509fa6cfc454c68bf3441672fe1a26cb5a19088",
    license: "Apache-2.0",
    selected: ["optimize.BFGS"]
  },
  {
    label: "KxSystems/ml graph/pipeline.q",
    path: "fixtures/third-party/KxSystems/ml/graph/pipeline.q",
    repo: "https://github.com/KxSystems/ml",
    commit: "5509fa6cfc454c68bf3441672fe1a26cb5a19088",
    license: "Apache-2.0",
    selected: ["graphDebug", "updDebug", "execPipeline"]
  },
  {
    label: "KxSystems/kdb stat.q",
    path: "fixtures/third-party/KxSystems/kdb/stat.q",
    repo: "https://github.com/KxSystems/kdb",
    commit: "844514c58ba7c3e1d37995e48bf595d8da4cae5b",
    license: "Apache-2.0",
    selected: ["pi", "nx", "xn", "nor", "mode", "cvm", "crm", "qtln", "qtl", "iqr"]
  }
];

const stripCommentsAndDirectives = (source: string) =>
  source.replace(/^\\.*$/gm, "").replace(/^\/\/.*$/gm, "").replace(/^\/.*$/gm, "");

const isTopLevelStart = (line: string) => /^[A-Za-z_.][A-Za-z0-9_.]*\s*::?/.test(line);

const balanceDelta = (line: string) => {
  let delta = 0;
  let inString = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === "\"" && line[index - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if ("([{".includes(char)) {
      delta += 1;
    } else if (")]}".includes(char)) {
      delta -= 1;
    }
  }

  return delta;
};

const snippetName = (head: string) => head.match(/^([A-Za-z_.][A-Za-z0-9_.]*)\s*::?/)?.[1] ?? head;

const extractTopLevelSnippets = (source: string): ExtractedSnippet[] => {
  const lines = stripCommentsAndDirectives(source).split(/\r?\n/);
  const snippets: string[] = [];
  let current: string[] = [];
  let depth = 0;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    if (current.length === 0) {
      if (isTopLevelStart(line)) {
        current = [line];
        depth = balanceDelta(line);
      }
      continue;
    }

    if (depth <= 0 && isTopLevelStart(line)) {
      snippets.push(current.join("\n"));
      current = [line];
      depth = balanceDelta(line);
      continue;
    }

    current.push(line);
    depth += balanceDelta(line);
  }

  if (current.length > 0) {
    snippets.push(current.join("\n"));
  }

  return snippets.map((program) => {
    const head = program.split("\n")[0] ?? program;
    return { name: snippetName(head), head, program };
  });
};

const corpusRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readCorpusFile = async (entry: ThirdPartyCorpusFile) =>
  readFile(path.resolve(corpusRoot, entry.path), "utf8");

test("vendored third-party statistical corpus is present and well-attributed", async () => {
  let selectedCount = 0;

  for (const entry of corpusFiles) {
    const source = await readCorpusFile(entry);
    assert.ok(source.length > 0, entry.label);
    assert.ok(entry.repo.startsWith("https://github.com/"), entry.label);
    assert.ok(entry.commit.length >= 40, entry.label);
    assert.ok(entry.license.length > 0, entry.label);
    selectedCount += entry.selected.length;
  }

  assert.ok(selectedCount >= 24, `expected a meaningful corpus, saw ${selectedCount} snippets`);
});

test("selected third-party statistical snippets extract cleanly", async () => {
  for (const entry of corpusFiles) {
    const extracted = extractTopLevelSnippets(await readCorpusFile(entry));
    const names = new Set(extracted.map((snippet) => snippet.name));

    for (const selected of entry.selected) {
      assert.ok(
        names.has(selected),
        `${entry.label} is missing ${selected}; extracted: ${[...names].join(", ")}`
      );
    }
  }
});

test("selected third-party statistical snippets parse with the engine", async () => {
  const { parse } = await import("@qpad/engine");
  const seen = new Set<string>();

  for (const entry of corpusFiles) {
    const extracted = extractTopLevelSnippets(await readCorpusFile(entry));
    const selected = extracted.filter((snippet) => entry.selected.includes(snippet.name));

    assert.equal(
      selected.length,
      entry.selected.length,
      `${entry.label} selection drifted: expected ${entry.selected.length}, saw ${selected.length}`
    );

    for (const snippet of selected) {
      const id = `${entry.label}:${snippet.name}`;
      assert.ok(!seen.has(id), `duplicate snippet id ${id}`);
      seen.add(id);
      assert.doesNotThrow(
        () => parse(snippet.program),
        `${id}\n${snippet.head}\n${snippet.program}`
      );
    }
  }
});
