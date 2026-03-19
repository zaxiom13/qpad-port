import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { runQ } from "../src/index.ts";

interface LocalCorpusTarget {
  label: string;
  path: string;
  mode: "defs" | "calls";
  prefix?: string;
  selected: string[];
}

interface LocalSnippet {
  name: string;
  program: string;
}

const home = process.env.HOME ?? "/Users/zak1726";

const localTargets: LocalCorpusTarget[] = [
  {
    label: "electronqsketch test_harness.q",
    path: path.join(home, "Desktop/electronqsketch/test/test_harness.q"),
    mode: "defs",
    selected: [".test.reset", ".test.run", ".test.tick", ".test.setMouse", ".test.summary"]
  },
  {
    label: "electronqsketch runtime_tests.q",
    path: path.join(home, "Desktop/electronqsketch/test/runtime_tests.q"),
    mode: "calls",
    prefix: ".test.run[",
    selected: ["state_define", "scene_clear", "ui_slider"]
  },
  {
    label: "raylib-q-project tutorial_snippets_test.q",
    path: path.join(home, "Desktop/coding/raylib-q-project/tests/tutorial_snippets_test.q"),
    mode: "calls",
    prefix: "runSnippet[",
    selected: [
      "L5.Snippet5 default circles",
      "L5.Snippet5b custom colors",
      "L5.Snippet6 generic draw rect",
      "L6.Snippet9a missing required col",
      "L6.Snippet9b extra cols tolerated",
      "L6.Snippet9c bad color format",
      "L7.Snippet10 scene lifecycle",
      "L7.Snippet12 symbol refs rejected",
      "L7.Snippet12b lambda refs draw-time",
      "L8.Snippet13 animate.circle frames",
      "L8.Snippet14a tween.table frame count",
      "L8.Snippet14b keyframesTable frame count",
      "L8.Snippet16 frame callbacks with step",
      "L9.Snippet18 events callback on/off",
      "L9.Snippet20 timer capture/restore",
      "L10.Snippet21 ui.hit.rect booleans",
      "L10.Snippet22 ui.button commands",
      "L11.Snippet24 mock transport capture",
      "QuickRef callable surface"
    ]
  }
];

const availableTargets = localTargets.filter((target) => existsSync(target.path));

const adjustBalance = (line: string) => {
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

const stripCommentsAndDirectives = (source: string) =>
  source.replace(/^\\.*$/gm, "").replace(/^\/\/.*$/gm, "").replace(/^\/.*$/gm, "");

const extractTopLevelDefs = (source: string): LocalSnippet[] => {
  const lines = stripCommentsAndDirectives(source).split(/\r?\n/);
  const snippets: string[] = [];
  let current: string[] = [];
  let depth = 0;
  const isTopLevel = (line: string) => /^[A-Za-z_.][A-Za-z0-9_.]*\s*::?/.test(line);

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }
    if (current.length === 0) {
      if (isTopLevel(line)) {
        current = [line];
        depth = adjustBalance(line);
      }
      continue;
    }
    if (depth <= 0 && isTopLevel(line)) {
      snippets.push(current.join("\n"));
      current = [line];
      depth = adjustBalance(line);
      continue;
    }
    current.push(line);
    depth += adjustBalance(line);
  }

  if (current.length > 0) {
    snippets.push(current.join("\n"));
  }

  return snippets.map((program) => ({
    name: program.match(/^([A-Za-z_.][A-Za-z0-9_.]*)\s*::?/)?.[1] ?? program,
    program
  }));
};

const extractBalancedCalls = (source: string, prefix: string): LocalSnippet[] => {
  const snippets: LocalSnippet[] = [];
  let start = 0;

  while ((start = source.indexOf(prefix, start)) !== -1) {
    let end = start;
    let depth = 0;
    let inString = false;
    let started = false;

    for (; end < source.length; end += 1) {
      const char = source[end]!;
      if (char === "\"" && source[end - 1] !== "\\") {
        inString = !inString;
      }
      if (inString) {
        continue;
      }
      if ("([{".includes(char)) {
        depth += 1;
        started = true;
      } else if (")]}".includes(char)) {
        depth -= 1;
      }
      if (started && depth === 0 && char === "]") {
        end += 1;
        break;
      }
    }

    const program = source.slice(start, end);
    const name =
      program.match(/^runSnippet\["([^"]+)"/)?.[1] ??
      program.match(/^\.test\.run\[`([^;]+);/)?.[1] ??
      program.split("\n")[0]!;

    snippets.push({ name, program });
    start = end;
  }

  return snippets;
};

const loadSnippets = (target: LocalCorpusTarget): LocalSnippet[] => {
  const source = readFileSync(target.path, "utf8");
  return target.mode === "defs"
    ? extractTopLevelDefs(source)
    : extractBalancedCalls(source, target.prefix ?? "");
};

test("local-machine q corpora are optional", () => {
  assert.ok(true, `discovered ${availableTargets.length} local q test corpora`);
});

if (availableTargets.length === 0) {
  test("no local q test corpora discovered", () => {
    assert.ok(true);
  });
} else {
  test("selected local-machine snippets are discoverable", () => {
    for (const target of availableTargets) {
      const snippets = loadSnippets(target);
      const names = new Set(snippets.map((snippet) => snippet.name));
      for (const selected of target.selected) {
        assert.ok(names.has(selected), `${target.label} missing ${selected}`);
      }
    }
  });

  test("selected local-machine snippets parse in real q", async () => {
    for (const target of availableTargets) {
      const snippets = loadSnippets(target).filter((snippet) => target.selected.includes(snippet.name));
      for (const snippet of snippets) {
        const oracle = await runQ(`parse ${JSON.stringify(snippet.program)}`, { timeoutMs: 10000 });
        assert.equal(
          oracle.exitCode,
          0,
          `${target.label}:${snippet.name}\n${oracle.stderr || oracle.stdout}`
        );
      }
    }
  });

  test("selected local-machine snippets parse in the engine", async () => {
    const { parse } = await import("@qpad/engine");

    for (const target of availableTargets) {
      const snippets = loadSnippets(target).filter((snippet) => target.selected.includes(snippet.name));
      for (const snippet of snippets) {
        assert.doesNotThrow(
          () => parse(snippet.program),
          `${target.label}:${snippet.name}\n${snippet.program}`
        );
      }
    }
  });
}
