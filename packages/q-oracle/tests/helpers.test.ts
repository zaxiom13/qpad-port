import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyBrowserSafety,
  normalizeQError,
  normalizeQProgram,
  normalizeQText,
  runQSession
} from "../src/q-process.ts";
import {
  extractProgramsFromQBlock,
  extractQBlocks,
  groupFixturesBySession
} from "../src/corpus.ts";

test("normalizeQText trims line endings but preserves content", () => {
  assert.equal(normalizeQText("1\r\n2\r\n"), "1\n2");
});

test("normalizeQProgram removes leading and trailing whitespace", () => {
  assert.equal(normalizeQProgram("  avg 1 2 3  \n"), "avg 1 2 3");
});

test("normalizeQError strips noisy stack lines", () => {
  assert.equal(normalizeQError("type\n  at some/file.ts:1:1"), "type");
});

test("browser safety classification catches host-only helpers", () => {
  assert.equal(classifyBrowserSafety("hopen 10", ".z.h"), false);
  assert.equal(classifyBrowserSafety(".Q.hp[\"http://google.com\"]\"my question\"", "dotq"), false);
  assert.equal(classifyBrowserSafety(".Q.host 2130706433i", "dotq"), false);
  assert.equal(classifyBrowserSafety(".Q.MAP[]", "dotq"), false);
  assert.equal(classifyBrowserSafety(".Q.par[`:.;2010.02.02;`quote]", "dotq"), false);
  assert.equal(classifyBrowserSafety(".Q.qp B", "dotq"), false);
  assert.equal(classifyBrowserSafety(".Q.bt[]", "dotq"), false);
  assert.equal(classifyBrowserSafety(".Q.res,key`.q", "dotq"), false);
  assert.equal(classifyBrowserSafety(".z.x", "dotz"), false);
  assert.equal(classifyBrowserSafety("avg 1 2 3", "avg"), true);
});

test("q block extraction pulls executable lines from docs html", () => {
  const html =
    '<pre class="highlight"><code class="language-q">q)1+2\n3\nq)avg 1 2 3\n2f\n</code></pre>';
  const blocks = extractQBlocks(html);
  assert.equal(blocks.length, 1);
  assert.deepEqual(extractProgramsFromQBlock(blocks[0] ?? ""), ["1+2", "avg 1 2 3"]);
});

test("grouping fixtures by session keeps reference blocks together", () => {
  assert.deepEqual(
    groupFixturesBySession([
      {
        id: "page#0.0",
        origin: "reference",
        page: "page",
        sessionId: "page#0",
        program: "a:1",
        browserSafe: true
      },
      {
        id: "page#0.1",
        origin: "reference",
        page: "page",
        sessionId: "page#0",
        program: "a+1",
        browserSafe: true
      }
    ]).map((group) => group.fixtures.map((fixture) => fixture.id)),
    [["page#0.0", "page#0.1"]]
  );
});

test("runQSession preserves state across sequential programs", async () => {
  const results = await runQSession(["v:10 20 30", "show v", "v[1]"], {
    timeoutMs: 10000,
    settleMs: 25
  });
  assert.equal(results.length, 3);
  assert.equal(normalizeQText(results[0]?.stdout ?? results[0]?.stderr ?? ""), "");
  assert.equal(normalizeQText(results[1]?.stdout ?? results[1]?.stderr ?? ""), "10 20 30");
  assert.equal(normalizeQText(results[2]?.stdout ?? results[2]?.stderr ?? ""), "20");
});
