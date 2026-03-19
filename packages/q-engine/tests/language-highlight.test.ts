import { describe, expect, it } from "vitest";
import { qMonarchSyntax } from "../../q-language/src/syntax";

describe("q language highlighting", () => {
  it("keeps dotted namespace identifiers intact", () => {
    const identifierRule = qMonarchSyntax.tokenizer.root[0]?.[0];
    expect(identifierRule).toBeInstanceOf(RegExp);
    const pattern = identifierRule as RegExp;

    expect(".cx.abs".match(pattern)?.[0]).toBe(".cx.abs");
    expect(".Q.id".match(pattern)?.[0]).toBe(".Q.id");
    expect(".z.K".match(pattern)?.[0]).toBe(".z.K");
  });
});
