import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await startServer();
const vite = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js")], {
  cwd: root,
  stdio: "inherit",
});

function stop() {
  vite.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.on("exit", (code) => process.exit(code ?? 0));
