import {
  classifyBrowserSafety,
  dedupeFixtures,
  normalizeQProgram,
  sortFixtures,
  type QFixture,
  type QManifest
} from "./q-process.ts";

export const stripHtml = (html: string) =>
  html
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, "");

export const extractQBlocks = (html: string) => {
  const blocks: string[] = [];
  const re =
    /<pre class="highlight"><code class="language-q">([\s\S]*?)<\/code><\/pre>/g;
  for (const match of html.matchAll(re)) {
    blocks.push(stripHtml(match[1] ?? ""));
  }
  return blocks;
};

export const extractProgramsFromQBlock = (block: string) => {
  const programs: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trimEnd();
    const qPrompt = trimmed.match(/^q\)(.*)$/);
    if (qPrompt) {
      const program = normalizeQProgram(qPrompt[1] ?? "");
      if (program) {
        programs.push(program);
      }
    }
  }
  return programs;
};

export const buildReferenceFixtures = (
  page: string,
  html: string,
  origin: QFixture["origin"] = "reference"
) => {
  const fixtures: QFixture[] = [];
  const blocks = extractQBlocks(html);
  blocks.forEach((block, blockIndex) => {
    const programs = extractProgramsFromQBlock(block);
    programs.forEach((program, programIndex) => {
      fixtures.push({
        id: `${page}#${blockIndex}.${programIndex}`,
        origin,
        page,
        sessionId: `${page}#${blockIndex}`,
        program,
        browserSafe: classifyBrowserSafety(program, page)
      });
    });
  });
  return sortFixtures(dedupeFixtures(fixtures));
};

export const buildUpstreamFixtures = (
  suite: string,
  source: string,
  origin: QFixture["origin"] = "upstream"
) => {
  const fixtures: QFixture[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/check\("((?:[^"\\]|\\.)*)","((?:[^"\\]|\\.)*)"\)/);
    if (!match) {
      continue;
    }
    const ignored = lines.slice(Math.max(0, i - 4), i).some((prior) =>
      prior.includes("@Ignore")
    );
    const program = match[1].replace(/\\"/g, '"');
    fixtures.push({
      id: `${suite}:${i + 1}`,
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

export const browserSafeFixtures = (manifest: QManifest) =>
  manifest.fixtures.filter(
    (fixture) =>
      !fixture.ignored &&
      classifyBrowserSafety(fixture.program, fixture.page ?? fixture.suite ?? "")
  );

export const hostOnlyFixtures = (manifest: QManifest) =>
  manifest.fixtures.filter(
    (fixture) =>
      fixture.ignored ||
      !classifyBrowserSafety(fixture.program, fixture.page ?? fixture.suite ?? "")
  );

export const fixtureSessionKey = (fixture: QFixture) => {
  if (fixture.page === "https://code.kx.com/q/basics/syntax/") {
    const match = fixture.id.match(/#(\d+)\./);
    const block = Number(match?.[1] ?? Number.NaN);
    if (block >= 12 && block <= 15) {
      return `${fixture.page}#12-15`;
    }
  }
  if (fixture.sessionId) {
    return fixture.sessionId;
  }
  if (fixture.origin === "reference") {
    const blockMatch = fixture.id.match(/^(.*#\d+)\.\d+$/);
    if (blockMatch) {
      return blockMatch[1] ?? fixture.id;
    }
  }
  return fixture.id;
};

export const groupFixturesBySession = (fixtures: QFixture[]) => {
  const groups = new Map<string, QFixture[]>();
  for (const fixture of fixtures) {
    const key = fixtureSessionKey(fixture);
    const group = groups.get(key);
    if (group) {
      group.push(fixture);
    } else {
      groups.set(key, [fixture]);
    }
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
