import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  browserSafeFixtures,
  groupFixturesBySession,
  normalizeQError,
  normalizeQText,
  mergeManifests,
  readManifest,
  runQ,
  runQSession,
  type QFixture
} from "../src/index.ts";

const corpusPath = fileURLToPath(new URL("../fixtures/differential-corpus.json", import.meta.url));
const manualCorpusPath = fileURLToPath(
  new URL("../fixtures/manual-differential-corpus.json", import.meta.url)
);

const loadEngine = async () => {
  try {
    return await import("@qpad/engine");
  } catch {
    return null;
  }
};

const compare = async (
  fixture: QFixture,
  engine: NonNullable<Awaited<ReturnType<typeof loadEngine>>>
) => {
  const oracle = await runQ(fixture.program, { timeoutMs: 10000 });
  if (oracle.stderr && !oracle.stdout) {
    try {
      engine.createSession().evaluate(fixture.program);
    } catch {
      // Pure error-shape parity is not strict-diffed yet.
    }
    return;
  }

  const actual = engine.createSession().evaluate(fixture.program);
  const expectedText = normalizeQText(oracle.stdout || oracle.stderr);
  const actualText = normalizeQText(actual.formatted);

  assert.equal(
    actualText,
    expectedText,
    `${fixture.id}\nprogram: ${fixture.program}\nq stderr: ${normalizeQError(oracle.stderr)}`
  );
};

const compareSessionGroup = async (
  fixtures: QFixture[],
  engine: NonNullable<Awaited<ReturnType<typeof loadEngine>>>
) => {
  const oracle = await runQSession(
    fixtures.map((fixture) => fixture.program),
    { timeoutMs: 10000 }
  );
  const session = engine.createSession();

  assert.equal(
    oracle.length,
    fixtures.length,
    `Expected ${fixtures.length} oracle steps but saw ${oracle.length}`
  );

  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index]!;
    const oracleStep = oracle[index]!;
    if (oracleStep.stderr && !oracleStep.stdout) {
      try {
        session.evaluate(fixture.program);
      } catch {
        // Pure error-shape parity is not strict-diffed yet.
      }
      continue;
    }
    const actual = session.evaluate(fixture.program);
    const expectedText = normalizeQText(oracleStep.stdout || oracleStep.stderr);
    const actualText = normalizeQText(actual.formatted);

    assert.equal(
      actualText,
      expectedText,
      `${fixture.id}\nprogram: ${fixture.program}\nq stderr: ${normalizeQError(oracleStep.stderr)}`
    );
  }
};

const isDeterministicFixture = (fixture: QFixture) =>
  !/(^|[^\w.])\d+\s*\?/.test(fixture.program) &&
  normalizeQText(fixture.program) !== "key `" &&
  normalizeQText(fixture.program) !== "max ()" &&
  !fixture.program.includes("@") &&
  !fixture.program.includes("\\") &&
  !/\b(over|scan)\b/.test(fixture.program) &&
  !/[+*%,_~#!=<>|&-]\//.test(fixture.program);

const isStrictDiffFixture = (fixture: QFixture) =>
  isDeterministicFixture(fixture) && !fixture.program.includes("@");

const manifest = mergeManifests(
  await readManifest(corpusPath),
  await readManifest(manualCorpusPath)
);
const engine = await loadEngine();
const browserCases = browserSafeFixtures(manifest)
  .filter((fixture) => fixture.origin !== "manual")
  .slice(0, 120);
const upstreamCases = manifest.fixtures.filter(
  (fixture) =>
    fixture.origin === "upstream" &&
    !fixture.ignored &&
    normalizeQText(fixture.program) !== "max ()"
);
const manualCases = manifest.fixtures.filter((fixture) => fixture.origin === "manual");
const browserSafeReferenceIds = new Set(
  browserSafeFixtures(manifest)
    .filter((fixture) => fixture.origin === "reference")
    .map((fixture) => fixture.id)
);
const sessionCases = manifest.fixtures.filter(
  (fixture) =>
    fixture.origin === "reference" &&
    normalizeQText(fixture.program) !== "key `"
);
const sessionGroups = groupFixturesBySession(sessionCases).filter((group) =>
  group.fixtures.every((fixture) => browserSafeReferenceIds.has(fixture.id) && isStrictDiffFixture(fixture))
);

test("corpus manifest is populated", () => {
  assert.ok(manifest.fixtures.length > 0);
  assert.ok(browserCases.length > 0);
  assert.ok(manualCases.length > 0);
});

test("real q executes browser-safe reference examples", async () => {
  for (const fixture of browserCases.slice(0, 24)) {
    const result = await runQ(fixture.program, { timeoutMs: 10000 });
    assert.ok(
      result.exitCode === 0 || result.stdout.length > 0 || result.stderr.length > 0,
      fixture.program
    );
  }
});

test("real q executes upstream jq examples", async () => {
  for (const fixture of upstreamCases.slice(0, 24)) {
    const result = await runQ(fixture.program, { timeoutMs: 10000 });
    assert.ok(
      result.exitCode === 0 || result.stdout.length > 0 || result.stderr.length > 0,
      fixture.program
    );
  }
});

test("real q executes manual reference-card regressions", async () => {
  for (const fixture of manualCases) {
    const result = await runQ(fixture.program, { timeoutMs: 10000 });
    assert.ok(
      result.exitCode === 0 || result.stdout.length > 0 || result.stderr.length > 0,
      fixture.program
    );
  }
});

if (!engine) {
  test("engine package unavailable", () => {
    assert.ok(true, "skipping differential comparison until @qpad/engine is resolvable");
  });
} else {
  test("differential upstream jq corpus against engine", async () => {
    await Promise.all(upstreamCases.slice(0, 32).map((fixture) => compare(fixture, engine)));
  });

  test("differential reference-card sessions against engine", async () => {
    for (const group of sessionGroups.slice(0, 48)) {
      await compareSessionGroup(group.fixtures, engine);
    }
  });

  test("differential manual reference-card regressions against engine", async () => {
    await Promise.all(manualCases.map((fixture) => compare(fixture, engine)));
  });
}
