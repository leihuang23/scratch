import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import * as git from "./git.mjs";
import { HOST, PORT, configPath, serverHome, tokenPath } from "./paths.mjs";
import * as vault from "./vault.mjs";

const exec = promisify(execFile);
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const clients = new Set();
const debounce = new Map();
let watcher = null;
let notesFolder = null;

function readToken() {
  return fs.readFileSync(tokenPath(), "utf8").trim();
}

async function ensureHome() {
  await fsp.mkdir(serverHome(), { recursive: true });
  if (!fs.existsSync(tokenPath())) {
    await fsp.writeFile(tokenPath(), crypto.randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  if (!fs.existsSync(configPath())) {
    await fsp.writeFile(configPath(), JSON.stringify({ notesFolder: null }, null, 2));
  }
  const config = JSON.parse(await fsp.readFile(configPath(), "utf8"));
  notesFolder = config.notesFolder || null;
  if (notesFolder) startWatcher(notesFolder);
}

async function saveConfig() {
  await fsp.writeFile(configPath(), JSON.stringify({ notesFolder }, null, 2));
}

function authorized(req) {
  const header = req.headers["x-scratch-token"];
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("scratch_token="))
    ?.slice("scratch_token=".length);
  const token = readToken();
  return header === token || cookie === token;
}

function send(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
  });
  res.end(payload);
}

function cookieHeader() {
  return `scratch_token=${readToken()}; HttpOnly; SameSite=Strict; Path=/`;
}

async function requireFolder() {
  if (!notesFolder) throw new Error("Notes folder not set");
  return notesFolder;
}

function emit(event, payload) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(frame);
}

function startWatcher(folder) {
  watcher?.close();
  try {
    watcher = fs.watch(folder, { recursive: true }, (_event, filename) => {
      if (!filename || !filename.endsWith(".md")) return;
      const key = filename;
      clearTimeout(debounce.get(key));
      debounce.set(key, setTimeout(() => {
        debounce.delete(key);
        const id = filename.replaceAll("\\", "/").replace(/\.md$/, "");
        const full = path.join(folder, filename);
        emit("file-change", {
          kind: fs.existsSync(full) ? "modified" : "deleted",
          path: full,
          changed_ids: [id],
        });
      }, 500));
    });
  } catch (err) {
    console.error("file watcher failed:", err.message);
  }
}

async function readNote(id) {
  const root = await requireFolder();
  const file = vault.notePath(root, id);
  const content = await fsp.readFile(file, "utf8");
  const stat = await fsp.stat(file);
  return {
    id,
    title: vault.extractTitle(content),
    content,
    path: file,
    modified: Math.floor(stat.mtimeMs / 1000),
  };
}

async function saveNote(id, content) {
  const root = await requireFolder();
  const title = vault.extractTitle(content);
  const leaf = vault.sanitizeFilename(title);
  let finalId = id;
  let oldFile = null;
  if (id) {
    const slash = id.lastIndexOf("/");
    const prefix = slash >= 0 ? id.slice(0, slash) : "";
    let desired = prefix ? `${prefix}/${leaf}` : leaf;
    let counter = 1;
    while (desired !== id && fs.existsSync(vault.notePath(root, desired))) {
      desired = prefix ? `${prefix}/${leaf}-${counter}` : `${leaf}-${counter}`;
      counter += 1;
    }
    oldFile = vault.notePath(root, id);
    finalId = desired;
  } else {
    finalId = leaf;
    let counter = 1;
    while (fs.existsSync(vault.notePath(root, finalId))) {
      finalId = `${leaf}-${counter}`;
      counter += 1;
    }
  }
  const file = vault.notePath(root, finalId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, content);
  if (oldFile && oldFile !== file && fs.existsSync(oldFile)) await fsp.rm(oldFile);
  if (id && finalId !== id) {
    await remapNoteIds(root, (noteId) => (noteId === id ? finalId : noteId));
  }
  const stat = await fsp.stat(file);
  return {
    id: finalId,
    title,
    content,
    path: file,
    modified: Math.floor(stat.mtimeMs / 1000),
  };
}

async function createNote(targetFolder) {
  const root = await requireFolder();
  const settings = await vault.readSettings(root);
  const template = settings.defaultNoteName || "Untitled";
  const expanded = vault.expandNoteNameTemplate(template);
  let sanitized = vault.sanitizeFilename(expanded);
  if (targetFolder) {
    vault.assertSafeRel(targetFolder);
    sanitized = `${targetFolder.replace(/\/$/, "")}/${sanitized}`;
  }
  const hasCounter = template.includes("{counter}");
  let finalId = hasCounter ? sanitized.replaceAll("{counter}", "1") : sanitized;
  let counter = hasCounter ? 2 : 1;
  while (fs.existsSync(vault.notePath(root, finalId))) {
    finalId = hasCounter
      ? sanitized.replaceAll("{counter}", String(counter))
      : `${sanitized}-${counter}`;
    counter += 1;
  }
  const title = vault.extractTitleFromId(finalId);
  const content = `# ${title}\n\n`;
  const file = vault.notePath(root, finalId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, content);
  const stat = await fsp.stat(file);
  return {
    id: finalId,
    title,
    content,
    path: file,
    modified: Math.floor(stat.mtimeMs / 1000),
  };
}

async function rewritePinned(root, mapId) {
  const settings = await vault.readSettings(root);
  if (Array.isArray(settings.pinnedNoteIds)) {
    settings.pinnedNoteIds = settings.pinnedNoteIds.map(mapId);
    await vault.writeSettings(root, settings);
  }
}

/** Keep pinned IDs and per-note metadata attached when notes move or get renamed. */
async function remapNoteIds(root, mapId) {
  await vault.withMetadataLock(root, async () => {
    await rewritePinned(root, mapId);
    const metadata = await vault.readMetadata(root);
    let changed = false;
    const next = {};
    for (const [id, value] of Object.entries(metadata.notes)) {
      const mapped = mapId(id);
      if (mapped !== id) changed = true;
      next[mapped] = value;
    }
    if (changed) {
      metadata.notes = next;
      await vault.writeMetadata(root, metadata);
    }
  });
}

async function saveNoteMetadata(root, id, mutate) {
  await vault.withMetadataLock(root, async () => {
    const metadata = await vault.readMetadata(root);
    const entry = { ...(metadata.notes[id] || {}) };
    mutate(entry);
    const tags = vault.sanitizeTags(entry.tags);
    const status = vault.isValidStatus(entry.status) ? entry.status : null;
    if (!status && tags.length === 0) {
      delete metadata.notes[id];
    } else {
      metadata.notes[id] = { status, tags };
    }
    await vault.writeMetadata(root, metadata);
  });
}

function trashPathFor(root, id, timestamp) {
  const leaf = id.split("/").pop() || "Untitled";
  // One directory per delete keeps same-name / same-millisecond notes apart.
  const dir = path.join(
    root,
    ".trash",
    `${timestamp}-${crypto.randomBytes(4).toString("hex")}`,
  );
  let file = path.join(dir, `${leaf}.md`);
  let counter = 1;
  while (fs.existsSync(file)) {
    file = path.join(dir, `${leaf}-${counter}.md`);
    counter += 1;
  }
  return file;
}

async function trashNote(root, id) {
  await vault.withMetadataLock(root, async () => {
    const file = vault.notePath(root, id);
    if (!fs.existsSync(file)) throw new Error("Note not found");
    const content = await fsp.readFile(file, "utf8");
    const stat = await fsp.stat(file);
    const trashedAt = Math.floor(Date.now() / 1000);
    const target = trashPathFor(root, id, Date.now());
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.rename(file, target);

    const metadata = await vault.readMetadata(root);
    const previous = metadata.notes[id] || {};
    delete metadata.notes[id];
    metadata.trash.unshift({
      key: crypto.randomBytes(8).toString("hex"),
      id,
      title: vault.extractTitle(content),
      preview: vault.generatePreview(content),
      book: vault.folderOf(id),
      modified: Math.floor(stat.mtimeMs / 1000),
      trashedAt,
      file: path.relative(root, target).split(path.sep).join("/"),
      status: vault.isValidStatus(previous.status) ? previous.status : null,
      tags: vault.sanitizeTags(previous.tags),
    });
    await vault.writeMetadata(root, metadata);

    const settings = await vault.readSettings(root);
    if (Array.isArray(settings.pinnedNoteIds) && settings.pinnedNoteIds.includes(id)) {
      settings.pinnedNoteIds = settings.pinnedNoteIds.filter((pinId) => pinId !== id);
      await vault.writeSettings(root, settings);
    }

    emit("file-change", { kind: "deleted", path: file, changed_ids: [id] });
  });
}

async function readTrash(root) {
  const entries = await vault.withMetadataLock(root, async () => {
    const metadata = await vault.readMetadata(root);
    const kept = [];
    let pruned = false;
    for (const entry of metadata.trash) {
      if (!entry || typeof entry.file !== "string") {
        pruned = true;
        continue;
      }
      const file = path.resolve(root, entry.file);
      if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file)) {
        pruned = true;
        continue;
      }
      kept.push(entry);
    }
    if (pruned) {
      metadata.trash = kept;
      await vault.writeMetadata(root, metadata);
    }
    return kept;
  });
  entries.sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
  return entries;
}

async function restoreNote(root, key) {
  return vault.withMetadataLock(root, async () => {
    const metadata = await vault.readMetadata(root);
    const index = metadata.trash.findIndex((entry) => entry.key === key);
    if (index < 0) throw new Error("Trash entry not found");
    const entry = metadata.trash[index];
    const source = path.resolve(root, entry.file);
    if (!fs.existsSync(source)) throw new Error("Trashed note file is missing");

    let finalId = entry.id;
    const folder = vault.folderOf(finalId);
    const leaf = folder ? finalId.slice(folder.length + 1) : finalId;
    let counter = 1;
    while (fs.existsSync(vault.notePath(root, finalId))) {
      finalId = folder ? `${folder}/${leaf}-${counter}` : `${leaf}-${counter}`;
      counter += 1;
    }
    const dest = vault.notePath(root, finalId);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(source, dest);
    // Only drop the per-deletion directory when it is empty; other trash
    // entries may share it (same-millisecond deletes).
    await fsp.rmdir(path.dirname(source)).catch(() => {});

    metadata.trash.splice(index, 1);
    const tags = vault.sanitizeTags(entry.tags);
    const status = vault.isValidStatus(entry.status) ? entry.status : null;
    if (status || tags.length > 0) {
      metadata.notes[finalId] = { status, tags };
    }
    await vault.writeMetadata(root, metadata);
    emit("file-change", { kind: "modified", path: dest, changed_ids: [finalId] });
    return finalId;
  });
}

async function deleteTrashNote(root, key) {
  await vault.withMetadataLock(root, async () => {
    const metadata = await vault.readMetadata(root);
    const index = metadata.trash.findIndex((entry) => entry.key === key);
    if (index < 0) throw new Error("Trash entry not found");
    const entry = metadata.trash[index];
    const file = path.resolve(root, entry.file);
    if (file.startsWith(path.resolve(root) + path.sep)) {
      await fsp.rm(file, { force: true });
      await fsp.rmdir(path.dirname(file)).catch(() => {});
    }
    metadata.trash.splice(index, 1);
    await vault.writeMetadata(root, metadata);
  });
}

async function emptyTrash(root) {
  await vault.withMetadataLock(root, async () => {
    await fsp.rm(path.join(root, ".trash"), { recursive: true, force: true });
    const metadata = await vault.readMetadata(root);
    metadata.trash = [];
    await vault.writeMetadata(root, metadata);
  });
}

async function chooseFolder() {
  if (process.platform !== "darwin") {
    throw new Error("Native folder picker is only wired for macOS. Paste a path instead.");
  }
  const { stdout } = await exec("osascript", [
    "-e",
    'POSIX path of (choose folder with prompt "Choose Notes Folder")',
  ], { timeout: 120_000 });
  return stdout.trim().replace(/\/$/, "");
}

async function openInFinder(target) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  await exec(opener, [target]);
}

async function saveImageData(base64Data, filename) {
  if (!base64Data?.trim()) throw new Error("Image data is empty");
  const ext = path.extname(filename || "").toLowerCase();
  const allowed = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
  if (!allowed.has(ext)) throw new Error("Unsupported image type");
  const root = await requireFolder();
  const bytes = Buffer.from(base64Data, "base64");
  if (!bytes.length) throw new Error("Decoded image data is empty");
  const assets = path.join(root, "assets");
  await fsp.mkdir(assets, { recursive: true });
  const base = vault.sanitizeFilename(path.basename(filename, ext)) || "image";
  let name = `${base}${ext}`;
  let n = 1;
  while (fs.existsSync(path.join(assets, name))) {
    name = `${base}-${n}${ext}`;
    n += 1;
  }
  await fsp.writeFile(path.join(assets, name), bytes);
  return `assets/${name}`;
}

async function saveClipboardImage(base64Data) {
  if (!base64Data?.trim()) throw new Error("Clipboard data is empty");
  const root = await requireFolder();
  const bytes = Buffer.from(base64Data, "base64");
  if (!bytes.length) throw new Error("Decoded image data is empty");
  const assets = path.join(root, "assets");
  await fsp.mkdir(assets, { recursive: true });
  const stamp = Math.floor(Date.now() / 1000);
  let name = `screenshot-${stamp}.png`;
  let n = 1;
  while (fs.existsSync(path.join(assets, name))) {
    name = `screenshot-${stamp}-${n}.png`;
    n += 1;
  }
  await fsp.writeFile(path.join(assets, name), bytes);
  return `assets/${name}`;
}

async function copyImageToAssets(sourcePath) {
  const root = await requireFolder();
  if (!fs.existsSync(sourcePath)) throw new Error("Source image file does not exist");
  const ext = path.extname(sourcePath) || ".png";
  const assets = path.join(root, "assets");
  await fsp.mkdir(assets, { recursive: true });
  const base = path.basename(sourcePath, ext);
  let name = `${base}${ext}`;
  let n = 1;
  while (fs.existsSync(path.join(assets, name))) {
    name = `${base}-${n}${ext}`;
    n += 1;
  }
  await fsp.copyFile(sourcePath, path.join(assets, name));
  return `assets/${name}`;
}

async function handleCommand(cmd, args) {
  switch (cmd) {
    case "get_notes_folder":
      return notesFolder;
    case "set_notes_folder": {
      const selected = path.resolve(args.path);
      const stat = await fsp.stat(selected);
      if (!stat.isDirectory()) throw new Error("Not a folder");
      notesFolder = selected;
      await saveConfig();
      await fsp.mkdir(path.join(selected, ".scratch"), { recursive: true });
      startWatcher(selected);
      return null;
    }
    case "open_folder_dialog":
      try {
        return await chooseFolder();
      } catch {
        return null;
      }
    case "open_image_dialog":
      try {
        if (process.platform !== "darwin") return null;
        const { stdout } = await exec("osascript", [
          "-e",
          'POSIX path of (choose file of type {"public.image"} with prompt "Choose Image")',
        ], { timeout: 120_000 });
        return stdout.trim();
      } catch {
        return null;
      }
    case "list_notes": {
      const root = await requireFolder();
      if (!fs.existsSync(root)) return [];
      return vault.listNotes(root, await vault.readSettings(root));
    }
    case "read_note":
      return readNote(args.id);
    case "save_note":
      return saveNote(args.id ?? null, args.content ?? "");
    case "delete_note": {
      const root = await requireFolder();
      await trashNote(root, args.id);
      return null;
    }
    case "set_note_status": {
      const root = await requireFolder();
      const status = vault.isValidStatus(args.status) ? args.status : null;
      await saveNoteMetadata(root, args.id, (entry) => {
        if (status) entry.status = status;
        else delete entry.status;
      });
      return null;
    }
    case "set_note_tags": {
      const root = await requireFolder();
      await saveNoteMetadata(root, args.id, (entry) => {
        entry.tags = vault.sanitizeTags(args.tags);
      });
      return null;
    }
    case "list_trash":
      return readTrash(await requireFolder());
    case "restore_note":
      return restoreNote(await requireFolder(), args.key);
    case "delete_trash_note":
      await deleteTrashNote(await requireFolder(), args.key);
      return null;
    case "empty_trash":
      await emptyTrash(await requireFolder());
      return null;
    case "create_note":
      return createNote(args.targetFolder || null);
    case "list_folders":
      return vault.listFolders(await requireFolder(), await vault.readSettings(await requireFolder()));
    case "create_folder": {
      const root = await requireFolder();
      vault.assertSafeRel(args.path);
      const target = path.resolve(root, args.path);
      if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid path");
      await fsp.mkdir(target, { recursive: true });
      return null;
    }
    case "delete_folder": {
      const root = await requireFolder();
      vault.assertSafeRel(args.path);
      const target = path.resolve(root, args.path);
      if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid path");
      await fsp.rm(target, { recursive: true });
      await vault.withMetadataLock(root, async () => {
        const metadata = await vault.readMetadata(root);
        const prefix = `${args.path}/`;
        metadata.notes = Object.fromEntries(
          Object.entries(metadata.notes).filter(([id]) => !id.startsWith(prefix)),
        );
        await vault.writeMetadata(root, metadata);
      });
      return null;
    }
    case "rename_folder": {
      const root = await requireFolder();
      vault.assertSafeRel(args.oldPath);
      const name = vault.sanitizeFilename(args.newName);
      const source = path.resolve(root, args.oldPath);
      const dest = path.join(path.dirname(source), name);
      if (fs.existsSync(dest)) throw new Error("A folder with that name already exists");
      await fsp.rename(source, dest);
      const parent = args.oldPath.includes("/") ? args.oldPath.slice(0, args.oldPath.lastIndexOf("/")) : "";
      const newPath = parent ? `${parent}/${name}` : name;
      await remapNoteIds(root, (id) => id.startsWith(`${args.oldPath}/`) ? `${newPath}/${id.slice(args.oldPath.length + 1)}` : id);
      return newPath;
    }
    case "move_note": {
      const root = await requireFolder();
      const leaf = args.id.split("/").pop();
      const target = args.targetFolder || "";
      if (target) vault.assertSafeRel(target);
      const newId = target ? `${target}/${leaf}` : leaf;
      if (newId === args.id) return args.id;
      const dest = vault.notePath(root, newId);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      if (fs.existsSync(dest)) throw new Error("A note with that name already exists");
      await fsp.rename(vault.notePath(root, args.id), dest);
      await remapNoteIds(root, (noteId) => (noteId === args.id ? newId : noteId));
      return newId;
    }
    case "move_folder": {
      const root = await requireFolder();
      vault.assertSafeRel(args.path);
      if (args.targetParent) vault.assertSafeRel(args.targetParent);
      const name = path.basename(args.path);
      const destRel = args.targetParent ? `${args.targetParent}/${name}` : name;
      const source = path.resolve(root, args.path);
      const dest = path.resolve(root, destRel);
      if (dest.startsWith(source + path.sep)) throw new Error("Cannot move a folder into itself");
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.rename(source, dest);
      await remapNoteIds(root, (id) => id.startsWith(`${args.path}/`) ? `${destRel}/${id.slice(args.path.length + 1)}` : id);
      return null;
    }
    case "get_settings":
      return notesFolder ? vault.readSettings(notesFolder) : vault.defaultSettings();
    case "update_settings": {
      const root = await requireFolder();
      await vault.writeSettings(root, args.newSettings);
      return null;
    }
    case "update_git_enabled": {
      const root = await requireFolder();
      if (root !== args.expectedFolder) throw new Error("Notes folder changed");
      const settings = await vault.readSettings(root);
      settings.gitEnabled = args.enabled;
      await vault.writeSettings(root, settings);
      return null;
    }
    case "preview_note_name": {
      const expanded = vault.expandNoteNameTemplate(args.template || "");
      const sanitized = vault.sanitizeFilename(expanded);
      return (args.template || "").includes("{counter}") ? sanitized.replaceAll("{counter}", "1") : sanitized;
    }
    case "search_notes": {
      const root = await requireFolder();
      const settings = await vault.readSettings(root);
      return vault.searchNotes(await vault.readAllNotes(root, settings), args.query || "");
    }
    case "rebuild_search_index":
    case "start_file_watcher":
    case "set_title_bar_theme":
      return null;
    case "get_default_ignored_patterns":
      return vault.ignoredDirs({});
    case "git_is_available":
      return git.gitAvailable();
    case "git_get_status":
      return git.gitStatus(await requireFolder());
    case "git_init_repo":
      await git.gitInit(await requireFolder());
      return null;
    case "git_commit":
      return git.gitCommit(await requireFolder(), args.message || "Update notes");
    case "git_push":
      return git.gitPush(await requireFolder());
    case "git_push_with_upstream":
      return git.gitPushUpstream(await requireFolder());
    case "git_fetch":
      return git.gitFetch(await requireFolder());
    case "git_pull":
      return git.gitPull(await requireFolder());
    case "git_add_remote":
      return git.gitAddRemote(await requireFolder(), args.url);
    case "git_set_remote_url":
      return git.gitSetRemote(await requireFolder(), args.url);
    case "git_remove_remote":
      return git.gitRemoveRemote(await requireFolder());
    case "save_clipboard_image":
      return saveClipboardImage(args.base64Data);
    case "save_image_data":
      return saveImageData(args.base64Data, args.filename);
    case "copy_image_to_assets":
      return copyImageToAssets(args.sourcePath);
    case "open_in_file_manager":
      await openInFinder(args.path);
      return null;
    case "read_file_direct": {
      const file = path.resolve(args.path);
      if (!file.endsWith(".md")) throw new Error("Only markdown files can be opened");
      const content = await fsp.readFile(file, "utf8");
      const stat = await fsp.stat(file);
      return { path: file, content, title: vault.extractTitle(content), modified: Math.floor(stat.mtimeMs / 1000) };
    }
    case "save_file_direct": {
      const file = path.resolve(args.path);
      if (!file.endsWith(".md")) throw new Error("Only markdown files can be saved");
      const content = args.content ?? "";
      await fsp.writeFile(file, content);
      const stat = await fsp.stat(file);
      return { path: file, content, title: vault.extractTitle(content), modified: Math.floor(stat.mtimeMs / 1000) };
    }
    case "import_file_to_folder": {
      const source = path.resolve(args.path);
      if (!source.endsWith(".md")) throw new Error("Only markdown files can be imported");
      const content = await fsp.readFile(source, "utf8");
      const note = await saveNote(null, content);
      emit("select-note", note.id);
      return { id: note.id, title: note.title, preview: "", modified: note.modified };
    }
    default:
      throw new Error(`Command not implemented: ${cmd}`);
  }
}

function serveAsset(req, res) {
  if (!notesFolder) return send(res, 404, { ok: false, error: "Notes folder not set" });
  const url = new URL(req.url, `http://${HOST}`);
  const rel = url.searchParams.get("rel") || "";
  try {
    vault.assertSafeRel(rel);
  } catch (err) {
    return send(res, 400, { ok: false, error: err.message });
  }
  const file = path.resolve(notesFolder, rel);
  if (!file.startsWith(path.resolve(notesFolder) + path.sep)) {
    return send(res, 400, { ok: false, error: "Invalid path" });
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, { ok: false, error: "Not found" });
  }
  res.writeHead(200, {
    "content-type": vault.contentType(file),
    "cache-control": "no-store",
  });
  fs.createReadStream(file).pipe(res);
}

function staticType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
  }[ext] || vault.contentType(file);
}

function serveStatic(res, url) {
  if (!fs.existsSync(path.join(distDir, "index.html"))) return false;
  const root = path.resolve(distDir);
  const pathname = decodeURIComponent(url.pathname);
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    if (path.extname(rel)) return false;
    file = path.join(root, "index.html");
  }
  const cache = file.endsWith("index.html") || file.endsWith("sw.js") ? "no-cache" : "public, max-age=31536000, immutable";
  res.writeHead(200, { "content-type": staticType(file), "cache-control": cache });
  fs.createReadStream(file).pipe(res);
  return true;
}

async function route(req, res) {
  const url = new URL(req.url, `http://${HOST}`);
  if (!url.pathname.startsWith("/api")) {
    if (req.method === "GET" && serveStatic(res, url)) return;
    return send(res, 404, { ok: false, error: "Not found" });
  }
  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, { ok: true, runtime: "server" });
  }
  if (req.method === "GET" && url.pathname === "/api/session") {
    return send(res, 200, { ok: true }, { "set-cookie": cookieHeader() });
  }
  if (!authorized(req)) return send(res, 401, { ok: false, error: "Unauthorized" });
  if (req.method === "GET" && url.pathname === "/api/asset") return serveAsset(req, res);
  if (req.method === "GET" && url.pathname === "/api/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write(": ok\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/command") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    try {
      const result = await handleCommand(body.cmd, body.args || {});
      return send(res, 200, { ok: true, result });
    } catch (err) {
      return send(res, 400, { ok: false, error: err.message || String(err) });
    }
  }
  send(res, 404, { ok: false, error: "Not found" });
}

export async function startServer() {
  await ensureHome();
  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      if (!res.headersSent) send(res, 500, { ok: false, error: err.message || String(err) });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });
  console.log(`scratch server http://${HOST}:${PORT}`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
