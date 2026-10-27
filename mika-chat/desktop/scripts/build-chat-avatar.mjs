import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const viteCli = resolve(desktopDir, "node_modules", "vite", "bin", "vite.js");
const result = spawnSync(
  process.execPath,
  [viteCli, "build", "--config", resolve(scriptDir, "chat-avatar.vite.config.mjs")],
  {
    cwd: desktopDir,
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
