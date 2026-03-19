/// <reference lib="webworker" />
import { createSession } from "@qpad/engine";
import type { WorkerRequest, WorkerResponse } from "./protocol";

let session = createSession();

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  try {
    if (message.type === "ping") {
      post({ id: message.id, type: "ready", version: "qpad-worker@0.1.0" });
      return;
    }

    if (message.type === "reset") {
      session = createSession();
      post({ id: message.id, type: "ready", version: "qpad-worker@0.1.0" });
      return;
    }

    if (message.type === "evaluate") {
      const result = session.evaluate(message.source);
      post({
        id: message.id,
        type: "result",
        source: message.source,
        text: result.formatted,
        canonical: result.canonical,
        value: result.value
      });
      return;
    }
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
