import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function git(cwd, args, env = {}) {
  return exec("git", args, {
    cwd,
    env: { ...process.env, GIT_SSH_COMMAND: "ssh -o ConnectTimeout=10", ...env },
    timeout: 60_000,
    maxBuffer: 2_000_000,
  });
}

function result(success, message, error) {
  return { success, message: message ?? null, error: error ?? null };
}

export async function gitAvailable() {
  try {
    await exec("git", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function remoteUrl(cwd) {
  try {
    const { stdout } = await git(cwd, ["remote", "get-url", "origin"]);
    const url = stdout.trim();
    return url || null;
  } catch {
    return null;
  }
}

export async function gitStatus(cwd) {
  const empty = {
    isRepo: false,
    hasRemote: false,
    hasUpstream: false,
    remoteUrl: null,
    changedCount: 0,
    aheadCount: -1,
    behindCount: -1,
    currentBranch: null,
    error: null,
  };
  if (!fs.existsSync(`${cwd}/.git`)) return empty;
  const status = { ...empty, isRepo: true };
  try {
    const branch = (await git(cwd, ["branch", "--show-current"])).stdout.trim();
    status.currentBranch = branch || null;
  } catch {
    /* detached or missing git */
  }
  try {
    const remotes = (await git(cwd, ["remote"])).stdout.trim();
    status.hasRemote = remotes.length > 0;
    if (status.hasRemote) status.remoteUrl = await remoteUrl(cwd);
  } catch {
    status.hasRemote = false;
  }
  try {
    const porcelain = (await git(cwd, ["status", "--porcelain"])).stdout;
    status.changedCount = porcelain.split("\n").filter(Boolean).length;
  } catch (err) {
    status.error = String(err.stderr || err.message);
  }
  if (status.hasRemote && status.currentBranch) {
    try {
      const counts = (await git(cwd, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"])).stdout.trim().split("\t");
      status.hasUpstream = true;
      status.behindCount = Number(counts[0] || 0);
      status.aheadCount = Number(counts[1] || 0);
    } catch {
      status.hasUpstream = false;
    }
  }
  return status;
}

export async function gitInit(cwd) {
  await git(cwd, ["init"]);
}

export async function gitCommit(cwd, message) {
  await git(cwd, ["add", "-A"]);
  try {
    await git(cwd, ["commit", "-m", message]);
    return result(true, "Changes committed");
  } catch (err) {
    const stderr = String(err.stderr || err.message || "");
    if (stderr.includes("nothing to commit")) return result(true, "Nothing to commit");
    return result(false, null, stderr.trim());
  }
}

async function networkGit(cwd, args) {
  return git(cwd, ["-c", "http.lowSpeedLimit=1000", "-c", "http.lowSpeedTime=10", ...args]);
}

export async function gitPush(cwd) {
  try {
    await networkGit(cwd, ["push"]);
    return result(true, "Pushed successfully");
  } catch (err) {
    return result(false, null, String(err.stderr || err.message).trim());
  }
}

export async function gitPushUpstream(cwd) {
  const status = await gitStatus(cwd);
  if (!status.currentBranch) return result(false, null, "No current branch");
  try {
    await networkGit(cwd, ["push", "-u", "origin", status.currentBranch]);
    return result(true, "Pushed successfully");
  } catch (err) {
    return result(false, null, String(err.stderr || err.message).trim());
  }
}

export async function gitFetch(cwd) {
  try {
    await networkGit(cwd, ["fetch", "--quiet"]);
    return result(true, "Fetched successfully");
  } catch (err) {
    return result(false, null, String(err.stderr || err.message).trim());
  }
}

export async function gitPull(cwd) {
  try {
    const { stdout } = await networkGit(cwd, ["-c", "pull.rebase=false", "pull"]);
    return result(true, stdout.includes("Already up to date") ? "Already up to date" : "Pulled latest changes");
  } catch (err) {
    return result(false, null, String(err.stderr || err.stdout || err.message).trim());
  }
}

function validRemote(url) {
  return /^(https?:\/\/|git@)/.test(url);
}

export async function gitAddRemote(cwd, url) {
  if (!validRemote(url)) return result(false, null, "Invalid remote URL format. URL must start with https://, http://, or git@");
  try {
    await git(cwd, ["remote", "add", "origin", url]);
    return result(true, "Remote added");
  } catch (err) {
    return result(false, null, String(err.stderr || err.message).trim());
  }
}

export async function gitSetRemote(cwd, url) {
  if (!validRemote(url)) return result(false, null, "Invalid remote URL format. URL must start with https://, http://, or git@");
  try {
    await git(cwd, ["remote", "set-url", "origin", url]);
    return result(true, "Remote updated");
  } catch (err) {
    return result(false, null, String(err.stderr || err.message).trim());
  }
}

export async function gitRemoveRemote(cwd) {
  try {
    await git(cwd, ["remote", "remove", "origin"]);
    return result(true, "Remote removed");
  } catch (err) {
    return result(false, null, String(err.stderr || err.message).trim());
  }
}
