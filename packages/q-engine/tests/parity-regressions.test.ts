import { describe, expect, it } from "vitest";
import { createSession, formatValue } from "../src/index";

describe("parity regressions", () => {
  it("ignores inline trailing q comments", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("2+2  /I know this one").value)).toBe("4\n");
    expect(formatValue(session.evaluate("3 /atom").value)).toBe("3\n");
  });

  it("supports median and moving-window statistics verbs", () => {
    const session = createSession();
    expect(formatValue(session.evaluate("med 3 1 4 2").value)).toBe("2.5\n");
    expect(formatValue(session.evaluate("med 1 0N 3").value)).toBe("1f\n");
    expect(formatValue(session.evaluate("2 mavg 1 2 3 4").value)).toBe("1 1.5 2.5 3.5\n");
    expect(formatValue(session.evaluate("2 mcount 1 2 3 4").value)).toBe("1 2 2 2i\n");
    expect(formatValue(session.evaluate("2 msum 1 2 3 4").value)).toBe("1 3 5 7\n");
    expect(formatValue(session.evaluate("2 mdev 1 2 3 4").value)).toBe("0 0.5 0.5 0.5\n");
    expect(formatValue(session.evaluate("3 mavg 1 0N 3 4 5").value)).toBe("1 1 2 3.5 4\n");
    expect(formatValue(session.evaluate("3 msum 1 0N 3 4 5").value)).toBe("1 1 4 7 12\n");
    expect(formatValue(session.evaluate("3 mcount 1 0N 3 4 5").value)).toBe("1 1 2 2 3i\n");
  });

  it("supports remaining projection, control, keyed-table, and grouped qsql forms", () => {
    const session = createSession();

    const sampled = session.evaluate("10?`v1`v2`v3").value;
    expect(sampled.kind).toBe("list");
    expect(sampled.kind === "list" ? sampled.items.length : 0).toBe(10);
    expect(
      sampled.kind === "list"
        ? sampled.items.every(
            (item) =>
              item.kind === "symbol" &&
              ["v1", "v2", "v3"].includes(item.value)
          )
        : false
    ).toBe(true);

    expect(formatValue(session.evaluate("g:+/[100;]; g 2 3 4 5").value)).toBe("114\n");
    expect(formatValue(session.evaluate("string `v2").value)).toBe("\"v2\"\n");
    expect(formatValue(session.evaluate("string \"abc\"").value)).toBe(",\"a\"\n,\"b\"\n,\"c\"\n");
    expect(formatValue(session.evaluate("v:`v1`v2`v3; `r1`r2`default `v1`v2?v").value)).toBe(
      "`r1`r2`default\n"
    );
    expect(formatValue(session.evaluate("v:`v1`v2`v3; `r1`r2`default `v1`v2?`oops").value)).toBe(
      "`default\n"
    );
    expect(
      formatValue(session.evaluate("v:`v1`v2`v3; ((`abc,;string;::) `v1`v2?v)@'v").value)
    ).toBe("`abc`v1\n\"v2\"\n`v3\n");
    expect(
      formatValue(session.evaluate("([a:1 2;b:`x`y] v:10 20)[(1;`x)]").value)
    ).toBe("v| 10\n");
    expect(
      formatValue(session.evaluate("select sum v from ([]v:10 20 30)").value)
    ).toBe("v\n-\n60\n");
    expect(
      formatValue(session.evaluate("select count v by a from ([]a:1 1 2;v:10 20 30)").value)
    ).toBe("a| v\n-| -\n1| 2\n2| 1\n");
    expect(
      formatValue(session.evaluate("select sum v+a by a from ([]a:1 1 2;v:10 20 30)").value)
    ).toBe("a| v\n-| -\n1| 32\n2| 32\n");
    expect(
      formatValue(session.evaluate("select sum v by a,b from ([]a:1 1 2;b:`x`x`y;v:10 20 30)").value)
    ).toBe("a b| v\n---| -\n1 x| 30\n2 y| 30\n");
    expect(
      formatValue(session.evaluate("exec sum v by a from ([]a:1 1 2;v:10 20 30)").value)
    ).toBe("1| 30\n2| 30\n");
    expect(
      formatValue(session.evaluate("exec sum v by a,b from ([]a:1 1 2;b:`x`x`y;v:10 20 30)").value)
    ).toBe("a b|   \n---| --\n1 x| 30\n2 y| 30\n");
    expect(() => session.evaluate("select from ([]a:10 20 30) where 0 2")).toThrowError(
      "where expects a boolean vector"
    );
    expect(
      formatValue(
        session.evaluate(
          ".Q.f[2;]each 9.996 34.3445 7817047037.90 781704703567.90 -.02 9.996 -0.0001"
        ).value
      )
    ).toBe(
      "\"10.00\"\n\"34.34\"\n\"7817047037.90\"\n\"781704703567.90\"\n\"-0.02\"\n\"10.00\"\n\"-0.00\"\n"
    );
  });
});
