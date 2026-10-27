import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const desktopDir = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig({
  root: desktopDir,
  base: "/",
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(desktopDir, "src", "chat-avatar.js"),
      formats: ["es"],
      fileName: () => "mika-avatar.js",
    },
    outDir: resolve(desktopDir, "..", "static"),
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
