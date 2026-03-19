import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listBuiltins } from "../src/index";

const trackedGaps = new Set([
  "aj",
  "and",
  "avgs",
  "bin",
  "binr",
  "differ",
  "ej",
  "eval",
  "exec",
  "exit",
  "fills",
  "get",
  "getenv",
  "group",
  "gtime",
  "hsym",
  "iasc",
  "idesc",
  "if",
  "ij",
  "insert",
  "inv",
  "keys",
  "lj",
  "ltime",
  "ltrim",
  "maxs",
  "mcount",
  "mdev",
  "med",
  "mins",
  "mmu",
  "msum",
  "next",
  "or",
  "over",
  "parse",
  "peach",
  "pj",
  "prds",
  "prior",
  "rand",
  "rank",
  "ratios",
  "raze",
  "rtrim",
  "scan",
  "select",
  "set",
  "setenv",
  "ss",
  "sv",
  "tables",
  "trim",
  "uj",
  "update",
  "upsert",
  "views",
  "vs",
  "wavg",
  "while",
  "wsum",
  "xbar",
  "xcols",
  "xexp",
  "xkey"
]);

describe("syntax keyword coverage", () => {
  it("tracks every highlighted keyword as implemented or explicitly pending", () => {
    const syntaxPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../q-language/src/syntax.ts"
    );
    const source = fs.readFileSync(syntaxPath, "utf8");
    const match = source.match(/keywords:\s*\[((?:.|\n)*?)\]/m);
    const keywords = [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);

    const implemented = new Set([...listBuiltins().monads, ...listBuiltins().diads, "each"]);
    const uncovered = keywords.filter(
      (keyword) => !implemented.has(keyword) && !trackedGaps.has(keyword)
    );

    expect(uncovered).toEqual([]);
  });
});
