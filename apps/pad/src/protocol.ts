import type { CanonicalNode, QValue } from "@qpad/core";

export type WorkerRequest =
  | { id: number; type: "ping" }
  | { id: number; type: "evaluate"; source: string }
  | { id: number; type: "reset" };

export type WorkerResponse =
  | { id: number; type: "ready"; version: string }
  | {
      id: number;
      type: "result";
      source: string;
      text: string;
      canonical: CanonicalNode;
      value: QValue;
    }
  | { id: number; type: "error"; error: SerializedError };

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

