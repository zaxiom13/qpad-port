/// <reference lib="webworker" />
import { createSession } from "@qpad/engine";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const WORKER_VERSION = "qpad-worker@0.1.0";

let session = createSession();

const post = (message: WorkerResponse) => self.postMessage(message);

const readyResponse = (id: number): WorkerResponse => ({
  id,
  type: "ready",
  version: WORKER_VERSION
});

const handlePing = (message: Extract<WorkerRequest, { type: "ping" }>) => readyResponse(message.id);

const handleReset = (message: Extract<WorkerRequest, { type: "reset" }>) => {
  session = createSession();
  return readyResponse(message.id);
};

const handleEvaluate = (message: Extract<WorkerRequest, { type: "evaluate" }>): WorkerResponse => {
  const result = session.evaluate(message.source);
  return {
    id: message.id,
    type: "result",
    source: message.source,
    text: result.formatted,
    canonical: result.canonical,
    value: result.value
  };
};

const handleMessage = (message: WorkerRequest): WorkerResponse => {
  switch (message.type) {
    case "ping":
      return handlePing(message);
    case "reset":
      return handleReset(message);
    case "evaluate":
      return handleEvaluate(message);
  }
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  try {
    post(handleMessage(message));
  } catch (error) {
    post({
      id: message.id,
      type: "error",
      error: serializeError(error)
    });
  }
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return {
    name: "Error",
    message: String(error)
  };
}
