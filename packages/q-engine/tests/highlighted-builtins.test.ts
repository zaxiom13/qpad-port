import { describe, expect, it } from "vitest";
import { createSession, formatValue } from "../src/index";

const cases = [
  { program: "abs -2 3 -4", expected: "2 3 4\n" },
  { program: "all 110b", expected: "0b\n" },
  { program: "any 001b", expected: "1b\n" },
  { program: "ceiling 1.2 3.0 -1.2", expected: "2 3 -1\n" },
  { program: "cols ([]a:1 2;b:3 4)", expected: "`a`b\n" },
  { program: "cut[2;1 2 3 4 5]", expected: "1 2\n3 4\n,5\n" },
  { program: "cut[0 2 3;1 2 3 4 5]", expected: "1 2\n,3\n4 5\n" },
  { program: "cut[2;\"abcde\"]", expected: "\"ab\"\n\"cd\"\n,\"e\"\n" },
  { program: "desc 3 1 2", expected: "3 2 1\n" },
  { program: "div[-7;2]", expected: "-4\n" },
  { program: "exp 0 1", expected: "1 2.718282\n" },
  { program: "1 2 3 except 2", expected: "1 3\n" },
  { program: "log 1 10", expected: "0 2.302585\n" },
  { program: "\"abc\" like \"a*\"", expected: "1b\n" },
  { program: "1 2 3 inter 2 3 4", expected: "2 3\n" },
  { program: "mod[7;-2]", expected: "-1\n" },
  { program: "10h$.Q.atob \"aGVsbG8=\"", expected: "\"hello\"\n" },
  { program: "@[|:;\"zero\"]", expected: "\"orez\"\n" },
  { program: "1 2 3 in 2 3", expected: "011b\n" },
  { program: "null 0N 2 0N", expected: "101b\n" },
  { program: "prev 1 2 3", expected: "0N 1 2\n" },
  { program: "reciprocal 2 4", expected: "0.5 0.25\n" },
  { program: "reverse 1 2 3", expected: "3 2 1\n" },
  { program: "2 rotate 1 2 3 4", expected: "3 4 1 2\n" },
  { program: "reverse \"abc\"", expected: "\"cba\"\n" },
  { program: "signum -3 0 5", expected: "-1 0 1i\n" },
  { program: "sublist[1 2;10 20 30 40]", expected: "20 30\n" },
  { program: "sums 1 2 3", expected: "1 3 6\n" },
  { program: "1 2 3 within 0 2", expected: "110b\n" },
  { program: "sqrt 9 2", expected: "3 1.414214\n" },
  { program: "1 2 2 3 union 2 3 4", expected: "1 2 3 4\n" },
  { program: "upper \"abC\"", expected: "\"ABC\"\n" },
  { program: ".Q.x10 12345", expected: "\"AAAAAAADA5\"\n" },
  { program: "cols .Q.id(`$(\"count+\";\"count*\";\"count1\"))xcol([]1 2;3 4;5 6)", expected: "`count1`count11`count12\n" },
  { program: "xlog[10;0Wj-1]", expected: "18.96489\n" }
] as const;

describe("highlighted builtin regressions", () => {
  it("covers a batch of highlighted verbs with stable outputs", () => {
    const session = createSession();
    for (const testCase of cases) {
      expect(formatValue(session.evaluate(testCase.program).value)).toBe(testCase.expected);
    }
  });
});
