import type { MutableRefObject } from "react";
import type { WorkerRequest, WorkerResponse } from "./protocol";

export const DEFAULT_PREVIEW_TEXT = "Preparing preview...";
export const EMPTY_PREVIEW_TEXT = "(empty result)";
export const NO_PREVIEW_TEXT = "(no preview)";

export const createPadWorker = () =>
  new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module"
  });

export const postWorkerRequest = (
  worker: Worker,
  nextIdRef: MutableRefObject<number>,
  type: WorkerRequest["type"],
  payload: Record<string, unknown> = {}
) =>
  new Promise<WorkerResponse>((resolve) => {
    const id = nextIdRef.current++;
    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) {
        return;
      }

      worker.removeEventListener("message", handleMessage);
      resolve(event.data);
    };

    worker.addEventListener("message", handleMessage);
    worker.postMessage({ id, type, ...payload } as WorkerRequest);
  });

export const previewTextFromResponse = (response: WorkerResponse) => {
  if (response.type === "result") {
    return response.text.trimEnd() || EMPTY_PREVIEW_TEXT;
  }
  if (response.type === "error") {
    return response.error.message;
  }
  return NO_PREVIEW_TEXT;
};
