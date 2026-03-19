declare module "@qpad/core" {
  export interface CanonicalNode {
    kind: string;
    qType: string;
    data: unknown;
  }

  export interface QValue {
    kind: string;
    [key: string]: unknown;
  }
}

declare module "@qpad/engine" {
  import type { CanonicalNode, QValue } from "@qpad/core";

  export interface EvalResult {
    value: QValue;
    formatted: string;
    canonical: CanonicalNode;
  }

  export interface Session {
    evaluate(source: string): EvalResult;
  }

  export function createSession(): Session;
  export function formatValue(value: QValue): string;
}

declare module "@qpad/language" {
  export const qMonarchSyntax: unknown;
  export const qMonarchTheme: unknown;
}
