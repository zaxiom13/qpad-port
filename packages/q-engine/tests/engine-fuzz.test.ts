import { describe, expect, it } from "vitest";
import { createSession, type EvalResult } from "../src/index";

type ScalarExpr =
  | { kind: "num"; value: number }
  | { kind: "bin"; op: "+" | "-" | "*" | "%"; left: ScalarExpr; right: ScalarExpr };

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function randomInt(next: () => number, min: number, max: number) {
  return Math.floor(next() * (max - min + 1)) + min;
}

function randomScalarExpr(next: () => number, depth: number): ScalarExpr {
  if (depth <= 0 || next() < 0.3) {
    return { kind: "num", value: randomInt(next, -9, 9) };
  }

  const opIndex = randomInt(next, 0, 3);
  const op = ["+", "-", "*", "%"][opIndex] as ScalarExpr extends { kind: "bin"; op: infer T } ? T : never;
  const left = randomScalarExpr(next, depth - 1);
  let right = randomScalarExpr(next, depth - 1);

  if (op === "%") {
    while (evalScalarExpr(right) === 0) {
      right = randomScalarExpr(next, depth - 1);
    }
  }

  return { kind: "bin", op, left, right };
}

function renderScalarExpr(expr: ScalarExpr): string {
  if (expr.kind === "num") {
    return String(expr.value);
  }
  return `(${renderScalarExpr(expr.left)} ${expr.op} ${renderScalarExpr(expr.right)})`;
}

function evalScalarExpr(expr: ScalarExpr): number {
  if (expr.kind === "num") {
    return expr.value;
  }

  const left = evalScalarExpr(expr.left);
  const right = evalScalarExpr(expr.right);
  switch (expr.op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "%":
      return left / right;
  }
}

function vectorLiteral(values: number[]) {
  return values.join(" ");
}

function randomVector(next: () => number, minLength = 1, maxLength = 8) {
  const length = randomInt(next, minLength, maxLength);
  return Array.from({ length }, () => randomInt(next, -9, 9));
}

function evaluate(session: ReturnType<typeof createSession>, source: string): EvalResult {
  return session.evaluate(source);
}

function asNumber(result: EvalResult) {
  if (result.value.kind !== "number") {
    throw new Error(`expected numeric result, received ${result.value.kind}`);
  }
  return result.value.value;
}

describe("q engine fuzz guards", () => {
  it("matches bracketed random scalar arithmetic trees", () => {
    const next = createRng(0x51454e);
    const session = createSession();

    for (let index = 0; index < 150; index += 1) {
      const expr = randomScalarExpr(next, 4);
      const source = renderScalarExpr(expr);
      const expected = evalScalarExpr(expr);
      const actual = asNumber(evaluate(session, source));

      expect(actual).toBeCloseTo(expected, 8);
    }
  });

  it("preserves numeric vector identities across random inputs", () => {
    const next = createRng(0xc0ffee);
    const session = createSession();

    for (let index = 0; index < 120; index += 1) {
      const values = randomVector(next);
      const literal = vectorLiteral(values);

      expect(evaluate(session, `reverse reverse ${literal}`).canonical).toEqual(
        evaluate(session, literal).canonical
      );
      expect(evaluate(session, `sum reverse ${literal}`).canonical).toEqual(
        evaluate(session, `sum ${literal}`).canonical
      );
      expect(evaluate(session, `count reverse ${literal}`).canonical).toEqual(
        evaluate(session, `count ${literal}`).canonical
      );
    }
  });

  it("keeps derived adverb forms aligned on random vectors", () => {
    const next = createRng(0x1234abcd);
    const session = createSession();

    for (let index = 0; index < 100; index += 1) {
      const values = randomVector(next);
      const literal = vectorLiteral(values);

      expect(evaluate(session, `(+/) ${literal}`).canonical).toEqual(
        evaluate(session, `sum ${literal}`).canonical
      );
      expect(evaluate(session, `last (+\\) ${literal}`).canonical).toEqual(
        evaluate(session, `sum ${literal}`).canonical
      );
    }
  });
});
