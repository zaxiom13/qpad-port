import { describe, expect, it } from "vitest";
import { createSession, formatValue } from "../src/index";

describe("q engine mutation guards", () => {
  it("keeps builtin aliases behaviorally identical", () => {
    const session = createSession();

    expect(formatValue(session.evaluate("keys `a`b!1 2").value)).toBe("`a`b\n");
    expect(formatValue(session.evaluate("deltas[10 15 27 93]").value)).toBe("10 5 12 66\n");
    expect(formatValue(session.evaluate("-':[10 15 27 93]").value)).toBe("10 5 12 66\n");
  });

  it("refreshes dynamic .z values on each root evaluation", () => {
    let current = new Date("2026-03-22T10:20:30.000Z");
    const session = createSession({
      now: () => current
    });

    expect(formatValue(session.evaluate(".z.P").value)).toBe("\"2026-03-22T10:20:30.000Z\"\n");
    current = new Date("2026-03-22T10:20:31.000Z");
    expect(formatValue(session.evaluate(".z.P").value)).toBe("\"2026-03-22T10:20:31.000Z\"\n");
  });

  it("routes unsupported host verbs through the host adapter", () => {
    const unsupportedCalls: string[] = [];
    const session = createSession({
      unsupported: (name) => {
        unsupportedCalls.push(name);
        throw new Error(`unsupported:${name}`);
      }
    });

    expect(() => session.evaluate("hopen 42")).toThrowError("unsupported:hopen");
    expect(() => session.evaluate("read0 `file")).toThrowError("unsupported:read0");
    expect(unsupportedCalls).toEqual(["hopen", "read0"]);
  });

  it("treats system P as a no-op but rejects other system calls", () => {
    const session = createSession({
      unsupported: (name) => {
        throw new Error(`unsupported:${name}`);
      }
    });

    expect(formatValue(session.evaluate("system \"P 0\"").value)).toBe("::\n");
    expect(() => session.evaluate("system \"ls\"")).toThrowError("unsupported:system");
  });

  it("returns root namespace keys including dynamically assigned namespaces", () => {
    const session = createSession();

    session.evaluate(".qv.state:42");

    expect(formatValue(session.evaluate("key `").value)).toContain("`.Q");
    expect(formatValue(session.evaluate("key `").value)).toContain("`.z");
    expect(formatValue(session.evaluate("key `").value)).toContain("`.cx");
    expect(formatValue(session.evaluate("key `").value)).toContain("`.qv");
  });

  it("keeps child-scope locals isolated while preserving dotted namespace mutation", () => {
    const session = createSession();
    const result = session.evaluate([
      "a:10",
      ".qv.state:0",
      "f:{a:99;.qv.state+:1;a+.qv.state}",
      "f[]",
      "(a;.qv.state)"
    ].join(";"));

    expect(formatValue(result.value)).toBe("10 1\n");
  });
});
