import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.SCRATCH_PORT || 4173);
export const HOST = "127.0.0.1";

export function serverHome() {
  return process.env.SCRATCH_SERVER_HOME || path.join(os.homedir(), ".scratch-server");
}

export function configPath() {
  return path.join(serverHome(), "config.json");
}

export function tokenPath() {
  return path.join(serverHome(), "token");
}
