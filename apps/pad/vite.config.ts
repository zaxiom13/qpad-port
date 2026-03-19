import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const workspace = (path: string) =>
  fileURLToPath(new URL(`../../packages/${path}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@qpad/core": workspace("q-core"),
      "@qpad/engine": workspace("q-engine"),
      "@qpad/language": workspace("q-language")
    }
  },
  server: {
    fs: {
      allow: [fileURLToPath(new URL("../..", import.meta.url))]
    }
  },
  worker: {
    format: "es"
  }
});
