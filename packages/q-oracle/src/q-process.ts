import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

export interface QProcessOptions {
  qBinary?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface QProcessResult {
  binary: string;
  program: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

export interface QSession {
  evaluate: (program: string, options?: Omit<QProcessOptions, "qBinary">) => Promise<QProcessResult>;
  close: () => Promise<void>;
}

export interface QFixture {
  id: string;
  origin: "reference" | "upstream" | "manual";
  page?: string;
  suite?: string;
  sessionId?: string;
  program: string;
  browserSafe: boolean;
  ignored?: boolean;
  notes?: string;
}

export interface QManifest {
  generatedAt: string;
  source: string;
  fixtures: QFixture[];
}

interface SpawnedQProcess {
  child: ChildProcessWithoutNullStreams;
  stdout: { value: string };
  stderr: { value: string };
}

interface BufferedOutput {
  value: string;
}

interface MarkedResponseOptions {
  child: ChildProcessWithoutNullStreams;
  stdout: BufferedOutput;
  stderr: BufferedOutput;
  binary: string;
  program: string;
  marker: string;
  timeoutMs?: number;
}

const UTF8_ENCODING: BufferEncoding = "utf8";
const Q_EXIT_COMMAND = "\\\\\n";
const Q_PROBE_PROGRAM = "1+1";
const SESSION_MARKER_PREFIX = "__QPAD_END_";
const FIXTURE_KEY_SEPARATOR = ":";

const BROWSER_HOST_ONLY_PATTERNS = [
  "hopen",
  "hclose",
  "hcount",
  "hdel",
  "read0",
  "read1",
  "system \"",
  "\\l",
  ".z.f",
  ".z.h",
  ".z.w",
  ".z.ws",
  ".z.wo",
  ".z.wc",
  ".z.pq",
  ".z.pc",
  ".z.po",
  ".z.pg",
  ".z.ps",
  ".z.ph",
  ".z.pp",
  ".z.pw",
  ".q.chk",
  ".q.dd",
  ".q.dpft",
  ".q.bv",
  ".q.vp",
  ".q.en",
  "tables[]",
  "get `:",
  ".q.addr",
  ".q.w[",
  ".q.gc",
  ".q.gz",
  ".q.host",
  ".q.hp",
  ".q.hg",
  ".q.fs",
  ".q.ft",
  ".q.ff",
  ".q.fu",
  ".q.fc",
  ".q.map",
  ".q.par",
  ".q.qp",
  ".q.bt",
  "key`.q",
  ".z.u",
  ".z.x"
] as const;

export const normalizeQText = (text: string) =>
  text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trimEnd();

export const normalizeQProgram = (program: string) =>
  program.replace(/\r\n/g, "\n").replace(/^\s+|\s+$/g, "");

export const normalizeQError = (stderr: string) =>
  normalizeQText(stderr)
    .replace(/^\s*at .+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

export const classifyBrowserSafety = (program: string, context = "") => {
  const text = `${context}\n${program}`.toLowerCase();
  return !BROWSER_HOST_ONLY_PATTERNS.some((pattern) => text.includes(pattern));
};

const spawnQProcess = (binary: string, options: Pick<QProcessOptions, "cwd" | "env"> = {}): SpawnedQProcess => {
  const child = spawn(binary, ["-q"], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stdout = { value: "" };
  const stderr = { value: "" };

  child.stdout.on("data", (chunk) => {
    stdout.value += chunk.toString(UTF8_ENCODING);
  });

  child.stderr.on("data", (chunk) => {
    stderr.value += chunk.toString(UTF8_ENCODING);
  });

  return { child, stdout, stderr };
};

const createTimeout = (timeoutMs: number | undefined, callback: () => void) =>
  timeoutMs && timeoutMs > 0 ? setTimeout(callback, timeoutMs) : null;

const delay = (timeoutMs: number | undefined) =>
  timeoutMs && timeoutMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)) : Promise.resolve();

const createSessionMarker = () =>
  `${SESSION_MARKER_PREFIX}_${Date.now()}_${Math.random().toString(36).slice(2)}__`;

const outputBeforeMarker = (output: string, marker: string) => {
  const markerIndex = output.indexOf(marker);
  return markerIndex >= 0 ? output.slice(0, markerIndex) : null;
};

const tryReadMarkedResponse = ({
  stdout,
  stderr,
  binary,
  program,
  marker,
  stdoutStart,
  stderrStart
}: MarkedResponseOptions & { stdoutStart: number; stderrStart: number }) => {
  const stdoutChunk = stdout.value.slice(stdoutStart);
  const stderrChunk = stderr.value.slice(stderrStart);
  const resolvedStdout = outputBeforeMarker(stdoutChunk, marker);
  const resolvedStderr = outputBeforeMarker(stderrChunk, marker);

  if (resolvedStdout === null && resolvedStderr === null) {
    return null;
  }

  return {
    binary,
    program,
    stdout: resolvedStdout ?? stdoutChunk,
    stderr: resolvedStderr ?? stderrChunk,
    exitCode: null,
    signal: null
  } satisfies QProcessResult;
};

const waitForMarkedResponse = ({
  child,
  stdout,
  stderr,
  binary,
  program,
  marker,
  timeoutMs
}: MarkedResponseOptions) =>
  new Promise<QProcessResult>((resolve, reject) => {
    const stdoutStart = stdout.value.length;
    const stderrStart = stderr.value.length;
    let settled = false;
    const timer = createTimeout(timeoutMs, () => {
      settle(() => reject(new Error(`[oracle timeout] ${program}`)));
    });

    const cleanup = () => {
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("error", onError);
      if (timer) {
        clearTimeout(timer);
      }
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const onData = () => {
      const result = tryReadMarkedResponse({
        child,
        stdout,
        stderr,
        binary,
        program,
        marker,
        timeoutMs,
        stdoutStart,
        stderrStart
      });
      if (result) {
        settle(() => resolve(result));
      }
    };

    const onError = (error: Error) => {
      settle(() => reject(error));
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", onError);

    child.stdin.write(`${program}\n`);
    child.stdin.write(`-1 "${marker}"\n`);
  });

const fixtureDedupeKey = (fixture: Pick<QFixture, "origin" | "page" | "suite" | "program">) =>
  [
    fixture.origin,
    fixture.page ?? "",
    fixture.suite ?? "",
    normalizeQProgram(fixture.program)
  ].join(FIXTURE_KEY_SEPARATOR);

const fixtureSortKey = (fixture: Pick<QFixture, "origin" | "page" | "suite" | "id">) =>
  [
    fixture.origin,
    fixture.page ?? "",
    fixture.suite ?? "",
    fixture.id
  ].join(FIXTURE_KEY_SEPARATOR);

export const resolveQBinary = async (preferred?: string) => {
  const candidates = [
    preferred,
    process.env.Q_BIN,
    process.env.Q,
    "/Users/zak1726/.kx/bin/q",
    "q"
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate.includes("/")) {
      try {
        await access(candidate, fsConstants.X_OK);
        const probe = await probeQBinary(candidate).catch(() => null);
        if (probe) {
          return candidate;
        }
        continue;
      } catch {
        continue;
      }
    }

    const probe = await probeQBinary(candidate).catch(() => null);
    if (probe) {
      return candidate;
    }
  }

  throw new Error("Unable to locate a usable q binary. Set Q_BIN to override.");
};

export const runQ = async (
  program: string,
  options: QProcessOptions = {}
): Promise<QProcessResult> => {
  const binary = await resolveQBinary(options.qBinary);
  const { child, stdout, stderr } = spawnQProcess(binary, options);
  let timedOut = false;
  const timer = createTimeout(options.timeoutMs, () => {
    timedOut = true;
    child.kill("SIGKILL");
  });

  return await new Promise<QProcessResult>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        binary,
        program,
        stdout: stdout.value,
        stderr: timedOut ? `${stderr.value}\n[oracle timeout]` : stderr.value,
        exitCode,
        signal
      });
    });

    child.stdin.write(`${program}\n${Q_EXIT_COMMAND}`);
    child.stdin.end();
  });
};

export const runQText = async (program: string, options: QProcessOptions = {}) => {
  const result = await runQ(program, options);
  return normalizeQText(result.stdout || result.stderr);
};

export const createQSession = async (options: QProcessOptions = {}): Promise<QSession> => {
  const binary = await resolveQBinary(options.qBinary);
  const { child, stdout, stderr } = spawnQProcess(binary, options);
  let chain = Promise.resolve();
  let closed = false;

  const evaluate: QSession["evaluate"] = (program, executionOptions = {}) =>
    (chain = chain.then(
      async () => {
        if (closed) {
          throw new Error("q session is closed");
        }

        return waitForMarkedResponse({
          child,
          stdout,
          stderr,
          binary,
          program,
          marker: createSessionMarker(),
          timeoutMs: executionOptions.timeoutMs
        });
      }
    ));

  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    child.stdin.write(Q_EXIT_COMMAND);
    child.stdin.end();
    await new Promise<void>((resolve) => {
      child.once("close", () => resolve());
    });
  };

  return { evaluate, close };
};

export interface QSessionResult extends QProcessResult {}

export interface QSessionOptions extends QProcessOptions {
  settleMs?: number;
}

export const runQSession = async (
  programs: readonly string[],
  options: QSessionOptions = {}
): Promise<QSessionResult[]> => {
  const binary = await resolveQBinary(options.qBinary);
  if (programs.length === 0) {
    return [];
  }

  const results: QSessionResult[] = [];
  let prefix = "";
  let previousTranscript = "";

  for (const [index, program] of programs.entries()) {
    prefix = prefix ? `${prefix}\n${program}` : program;
    const result = await runQ(prefix, { ...options, qBinary: binary });
    const transcript = normalizeQText(result.stdout || result.stderr);
    const delta = transcript.startsWith(previousTranscript)
      ? transcript.slice(previousTranscript.length).replace(/^\n/, "")
      : transcript;

    results.push({
      binary,
      program,
      stdout: result.stdout ? normalizeQText(delta) : "",
      stderr: result.stdout ? "" : normalizeQText(delta),
      exitCode: result.exitCode,
      signal: result.signal
    });

    previousTranscript = transcript;

    if (options.settleMs && index < programs.length - 1) {
      await delay(options.settleMs);
    }
  }

  return results;
};

export const runQProbe = async (binary: string) => {
  const result = await probeQBinary(binary);
  if (result.exitCode !== 0 && result.exitCode !== null) {
    throw new Error(`q probe failed for ${binary}`);
  }
  if (normalizeQText(result.stdout) !== "2") {
    throw new Error(`q probe returned unexpected output for ${binary}`);
  }
  return result;
};

const probeQBinary = async (binary: string): Promise<QProcessResult> => {
  const { child, stdout, stderr } = spawnQProcess(binary);

  return await new Promise<QProcessResult>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolve({
        binary,
        program: Q_PROBE_PROGRAM,
        stdout: stdout.value,
        stderr: stderr.value,
        exitCode,
        signal
      });
    });

    child.stdin.write(`${Q_PROBE_PROGRAM}\n${Q_EXIT_COMMAND}`);
    child.stdin.end();
  });
};

export const mapLimit = async <T, R>(
  values: readonly T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>
) => {
  const results: R[] = new Array(values.length);
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const current = index++;
      if (current >= values.length) {
        return;
      }
      results[current] = await mapper(values[current], current);
    }
  });
  await Promise.all(workers);
  return results;
};

export const dedupeFixtures = (fixtures: QFixture[]) => {
  const seen = new Set<string>();
  return fixtures.filter((fixture) => {
    const key = fixtureDedupeKey(fixture);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const sortFixtures = (fixtures: QFixture[]) =>
  [...fixtures].sort((a, b) => {
    const aa = fixtureSortKey(a);
    const bb = fixtureSortKey(b);
    return aa.localeCompare(bb);
  });

export const writeManifest = async (manifest: QManifest, path: string) => {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
};

export const readManifest = async (path: string) => {
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(path, "utf8")) as QManifest;
};
