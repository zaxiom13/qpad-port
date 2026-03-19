import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listBuiltins } from "../src/index";

const trackedGaps = new Set([
  "aj",
  "bin",
  "binr",
  "ej",
  "eval",
  "exec",
  "exit",
  "get",
  "getenv",
  "gtime",
  "if",
  "ij",
  "insert",
  "inv",
  "lj",
  "ltime",
  "mcount",
  "mdev",
  "med",
  "mmu",
  "msum",
  "parse",
  "peach",
  "pj",
  "rand",
  "rank",
  "select",
  "set",
  "setenv",
  "tables",
  "uj",
  "update",
  "upsert",
  "views",
  "wavg",
  "while",
  "wsum",
  "xcols",
  "hsym",
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
