import {
  classifyBrowserSafety,
  dedupeFixtures,
  normalizeQProgram,
  sortFixtures,
  type QFixture,
  type QManifest
} from "./q-process.ts";

const HTML_ENTITY_REPLACEMENTS = [
  [/&nbsp;/g, " "],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&amp;/g, "&"]
] as const;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const Q_BLOCK_PATTERN =
  /<pre class="highlight"><code class="language-q">([\s\S]*?)<\/code><\/pre>/g;
const Q_PROMPT_PATTERN = /^q\)(.*)$/;
const UPSTREAM_FIXTURE_PATTERN = /check\("((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\)/;
const IGNORE_ANNOTATION = "@Ignore";
const SYNTAX_REFERENCE_PAGE = "https://code.kx.com/q/basics/syntax/";
const SHARED_SYNTAX_BLOCK_RANGE = { start: 12, end: 15 } as const;

export const stripHtml = (html: string) =>
  HTML_ENTITY_REPLACEMENTS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    html
  ).replace(HTML_TAG_PATTERN, "");

export const extractQBlocks = (html: string) =>
  Array.from(html.matchAll(Q_BLOCK_PATTERN), (match) => stripHtml(match[1] ?? ""));

export const extractProgramsFromQBlock = (block: string) => {
  const programs: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const qPrompt = line.trimEnd().match(Q_PROMPT_PATTERN);
    if (!qPrompt) {
      continue;
    }

    const program = normalizeQProgram(qPrompt[1] ?? "");
    if (program) {
      programs.push(program);
    }
  }
  return programs;
};

export const buildReferenceFixtures = (
  page: string,
  html: string,
  origin: QFixture["origin"] = "reference"
) =>
  sortFixtures(
    dedupeFixtures(
      extractQBlocks(html).flatMap((block, blockIndex) =>
        extractProgramsFromQBlock(block).map((program, programIndex) => ({
          id: `${page}#${blockIndex}.${programIndex}`,
          origin,
          page,
          sessionId: `${page}#${blockIndex}`,
          program,
          browserSafe: classifyBrowserSafety(program, page)
        }))
      )
    )
  );

const hasIgnoreAnnotation = (lines: string[], lineIndex: number) =>
  lines
    .slice(Math.max(0, lineIndex - 4), lineIndex)
    .some((previousLine) => previousLine.includes(IGNORE_ANNOTATION));

export const buildUpstreamFixtures = (
  suite: string,
  source: string,
  origin: QFixture["origin"] = "upstream"
) => {
  const fixtures: QFixture[] = [];
  const lines = source.split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    const match = line.match(UPSTREAM_FIXTURE_PATTERN);
    if (!match) {
      continue;
    }

    const ignored = hasIgnoreAnnotation(lines, lineIndex);
    const program = match[1].replace(/\\"/g, '"');
    fixtures.push({
      id: `${suite}:${lineIndex + 1}`,
      origin,
      suite,
      program,
      browserSafe: classifyBrowserSafety(program, suite),
      ignored,
      notes: ignored ? "Upstream jq test marked @Ignore" : undefined
    });
  }
  return sortFixtures(dedupeFixtures(fixtures));
};

export const mergeManifests = (...manifests: QManifest[]) => {
  const fixtures = manifests.flatMap((manifest) => manifest.fixtures);
  return {
    generatedAt: new Date().toISOString(),
    source: manifests.map((manifest) => manifest.source).join(" + "),
    fixtures: sortFixtures(dedupeFixtures(fixtures))
  } satisfies QManifest;
};

const isBrowserSafeFixture = (fixture: QFixture) =>
  classifyBrowserSafety(fixture.program, fixture.page ?? fixture.suite ?? "");

export const browserSafeFixtures = (manifest: QManifest) =>
  manifest.fixtures.filter((fixture) => !fixture.ignored && isBrowserSafeFixture(fixture));

export const hostOnlyFixtures = (manifest: QManifest) =>
  manifest.fixtures.filter((fixture) => fixture.ignored || !isBrowserSafeFixture(fixture));

const sharedSyntaxSessionKey = (fixture: QFixture) => {
  if (fixture.page !== SYNTAX_REFERENCE_PAGE) {
    return null;
  }

  const match = fixture.id.match(/#(\d+)\./);
  const block = Number(match?.[1] ?? Number.NaN);
  return block >= SHARED_SYNTAX_BLOCK_RANGE.start && block <= SHARED_SYNTAX_BLOCK_RANGE.end
    ? `${fixture.page}#${SHARED_SYNTAX_BLOCK_RANGE.start}-${SHARED_SYNTAX_BLOCK_RANGE.end}`
    : null;
};

const referenceFixtureSessionKey = (fixture: QFixture) => {
  const blockMatch = fixture.id.match(/^(.*#\d+)\.\d+$/);
  return blockMatch?.[1] ?? fixture.id;
};

export const fixtureSessionKey = (fixture: QFixture) => {
  const syntaxKey = sharedSyntaxSessionKey(fixture);
  if (syntaxKey) {
    return syntaxKey;
  }

  if (fixture.sessionId) {
    return fixture.sessionId;
  }

  if (fixture.origin === "reference") {
    return referenceFixtureSessionKey(fixture);
  }

  return fixture.id;
};

export const groupFixturesBySession = (fixtures: QFixture[]) => {
  const groups = new Map<string, QFixture[]>();
  for (const fixture of fixtures) {
    const key = fixtureSessionKey(fixture);
    const group = groups.get(key) ?? [];
    group.push(fixture);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([sessionId, groupedFixtures]) => ({
    sessionId,
    fixtures: groupedFixtures.sort((a, b) => compareFixtureOrder(a, b))
  }));
};

const compareFixtureOrder = (a: QFixture, b: QFixture) => {
  const aMatch = a.id.match(/^(.*#(\d+))\.(\d+)$/);
  const bMatch = b.id.match(/^(.*#(\d+))\.(\d+)$/);
  if (aMatch && bMatch && aMatch[1] === bMatch[1]) {
    return Number(aMatch[3] ?? 0) - Number(bMatch[3] ?? 0);
  }
  return a.id.localeCompare(b.id);
};
