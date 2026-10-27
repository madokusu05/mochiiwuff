import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const electronExecutable = resolve(
  desktopDir,
  "node_modules",
  "electron",
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);

await import("./prepare-model.mjs");

try {
  await access(electronExecutable, constants.F_OK);
} catch (error) {
  throw new Error("Electron est introuvable. Lance d'abord `npm install`.", {
    cause: error,
  });
}

const server = await createServer({
  configFile: resolve(desktopDir, "vite.config.mjs"),
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
await server.listen();

const electronProcess = spawn(electronExecutable, [desktopDir], {
  env: {
    ...process.env,
    MIKA_DEV_SERVER_URL: "http://127.0.0.1:5173",
  },
  stdio: "inherit",
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  if (electronProcess.exitCode === null) electronProcess.kill();
  await server.close();
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

electronProcess.once("error", async (error) => {
  console.error("Impossible de démarrer Electron.", error);
  await stop();
  process.exitCode = 1;
});

electronProcess.once("exit", async (code) => {
  await stop();
  process.exitCode = code ?? 0;
});
