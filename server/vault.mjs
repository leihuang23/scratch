import fs from "node:fs/promises";
import path from "node:path";

const EXCLUDED = new Set([".git", ".scratch", ".obsidian", ".trash", "assets"]);
const DEFAULT_IGNORED = [
  "node_modules", ".next", ".nuxt", "dist", "build", "out", "target", "vendor",
  "__pycache__", ".venv", "venv", ".cache", "coverage", ".svn", ".hg",
  "bower_components", ".turbo", ".parcel-cache",
];

export const NOTE_STATUSES = ["active", "on-hold", "completed", "dropped"];

export function defaultSettings() {
  return { theme: { mode: "system" } };
}

export function emptyMetadata() {
  return { notes: {}, trash: [] };
}

export async function readMetadata(root) {
  try {
    const raw = await fs.readFile(path.join(root, ".scratch", "metadata.json"), "utf8");
    const parsed = JSON.parse(raw);
    return {
      notes: parsed?.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      trash: Array.isArray(parsed?.trash) ? parsed.trash : [],
    };
  } catch {
    return emptyMetadata();
  }
}

export async function writeMetadata(root, metadata) {
  const dir = path.join(root, ".scratch");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "metadata.json");
  // Unique temp names let concurrent writers finish without clobbering a
  // shared temp file; the read-modify-write itself is serialized below.
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(metadata, null, 2));
  await fs.rename(tmp, file);
}

const metadataLocks = new Map();

/** Serialize read-modify-write cycles on a vault's metadata file. */
export function withMetadataLock(root, task) {
  const key = path.resolve(root);
  const previous = metadataLocks.get(key) ?? Promise.resolve();
  const run = previous.then(task, task);
  metadataLocks.set(key, run.catch(() => {}));
  return run;
}

export function folderOf(id) {
  const slash = id.lastIndexOf("/");
  return slash > 0 ? id.slice(0, slash) : "";
}

export function todoCounts(content) {
  // Task-looking lines inside fenced code are documentation, not tasks.
  const body = stripFrontmatter(content)
    .replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, "");
  const open = (body.match(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[ \t]?\][ \t]+/gm) || []).length;
  const done = (body.match(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[xX]\][ \t]+/gm) || []).length;
  return { open, done };
}

export function isValidStatus(status) {
  return NOTE_STATUSES.includes(status);
}

/**
 * Effective status of a note.
 *
 * Explicit status wins: a note with open todos can be put on hold or dropped
 * by hand, and that choice must stick.
 *
 * Without an explicit status:
 * - open todos          -> active
 * - all todos done      -> completed
 * - no todos at all     -> active (a plain note is a working note)
 */
export function deriveStatus(explicit, openTodos, doneTodos) {
  if (isValidStatus(explicit)) return explicit;
  if (openTodos > 0) return "active";
  if (doneTodos > 0) return "completed";
  return "active";
}

export function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().replace(/^#/, "").slice(0, 50);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

function withMeta(note, entry) {
  const tags = sanitizeTags(entry?.tags);
  const explicitStatus = isValidStatus(entry?.status) ? entry.status : null;
  const { open, done } = todoCounts(note.content);
  return {
    ...note,
    book: folderOf(note.id),
    tags,
    explicitStatus,
    status: deriveStatus(explicitStatus, open, done),
    todoOpen: open,
    todoDone: done,
  };
}

export function ignoredDirs(settings) {
  return Array.isArray(settings?.ignoredPatterns) ? settings.ignoredPatterns : DEFAULT_IGNORED;
}

function isEmpty(value) {
  return [...value].every((c) => /\s/.test(c) || c === "\u00A0" || c === "\uFEFF");
}

export function sanitizeFilename(title) {
  const sanitized = [...title]
    .filter((c) => c !== "\u00A0" && c !== "\uFEFF")
    .map((c) => ("/\\:*?\"<>|".includes(c) ? "-" : c))
    .join("");
  const trimmed = sanitized.trim();
  return !trimmed || isEmpty(trimmed) ? "Untitled" : trimmed;
}

function ordinal(day) {
  const mod100 = day % 100;
  const mod10 = day % 10;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}

export function expandNoteNameTemplate(template, now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdaysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = now.getDate();
  return template
    .replaceAll("{timestamp}", String(Math.floor(now.getTime() / 1000)))
    .replaceAll("{date}", `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(day)}`)
    .replaceAll("{year}", String(now.getFullYear()))
    .replaceAll("{month}", pad(now.getMonth() + 1))
    .replaceAll("{day}", pad(day))
    .replaceAll("{monthName}", months[now.getMonth()])
    .replaceAll("{monthShort}", monthsShort[now.getMonth()])
    .replaceAll("{weekday}", weekdays[now.getDay()])
    .replaceAll("{weekdayShort}", weekdaysShort[now.getDay()])
    .replaceAll("{dayOrdinal}", `${day}${ordinal(day)}`)
    .replaceAll("{time}", `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`);
}

export function extractTitleFromId(id) {
  const filename = id.split("/").pop() || id;
  return filename
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stripFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return content;
  const rest = trimmed.slice(3);
  const end = rest.indexOf("\n---");
  if (end < 0) return content;
  const after = rest.slice(end + 4);
  return after.startsWith("\r\n") ? after.slice(2) : after.startsWith("\n") ? after.slice(1) : after;
}

export function extractTitle(content) {
  const body = stripFrontmatter(content);
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      const title = trimmed.slice(2).trim();
      if (title && !isEmpty(title)) return title;
    }
    if (trimmed && !isEmpty(trimmed)) return [...trimmed].slice(0, 50).join("");
  }
  return "Untitled";
}

function stripMarkdown(text) {
  let result = text.trim().replace(/^#+\s*/, "");
  const unwrap = (marker) => {
    while (true) {
      const start = result.indexOf(marker);
      if (start < 0) break;
      const end = result.indexOf(marker, start + marker.length);
      if (end < 0) break;
      result = result.slice(0, start) + result.slice(start + marker.length, end) + result.slice(end + marker.length);
    }
  };
  unwrap("~~");
  unwrap("**");
  unwrap("__");
  unwrap("`");
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  unwrap("*");
  unwrap("_");
  return result
    .replaceAll("- [ ] ", "")
    .replaceAll("- [x] ", "")
    .replaceAll("- [X] ", "")
    .replace(/^(\s*[-+*]|\s*\d+\.)\s+/, "")
    .trim();
}

export function generatePreview(content) {
  const body = stripFrontmatter(content);
  const lines = body.split(/\r?\n/).slice(1);
  for (const line of lines) {
    const stripped = stripMarkdown(line.trim());
    if (stripped) return [...stripped].slice(0, 100).join("");
  }
  return "";
}

export function assertSafeId(id) {
  if (!id || id.includes("\\") || id.includes("..") || id.startsWith("/") || id.includes("\0")) {
    throw new Error("Invalid note ID");
  }
}

export function notePath(root, id) {
  assertSafeId(id);
  const file = path.resolve(root, `${id}.md`);
  const rootResolved = path.resolve(root);
  if (file !== rootResolved && !file.startsWith(rootResolved + path.sep)) {
    throw new Error("Invalid note ID: path escapes notes folder");
  }
  return file;
}

export function assertSafeRel(rel) {
  if (!rel || rel.includes("\\") || rel.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error("Invalid path");
  }
}

function skippedDir(name, ignored) {
  return EXCLUDED.has(name) || ignored.includes(name);
}

async function walk(dir, root, ignored, depth, visit) {
  if (depth > 10) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.isDirectory() && EXCLUDED.has(entry.name)) continue;
    if (entry.isDirectory() && skippedDir(entry.name, ignored)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await visit(full, entry);
      await walk(full, root, ignored, depth + 1, visit);
    } else {
      await visit(full, entry);
    }
  }
}

export function idFromFile(root, file, ignored) {
  const rel = path.relative(root, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (!rel.endsWith(".md")) return null;
  const parts = rel.split(path.sep);
  if (parts.slice(0, -1).some((part) => skippedDir(part, ignored))) return null;
  const id = parts.join("/").slice(0, -3);
  return id || null;
}

export async function listNotes(root, settings) {
  const ignored = ignoredDirs(settings);
  const metadata = await readMetadata(root);
  const notes = [];
  await walk(root, root, ignored, 0, async (full, entry) => {
    if (!entry.isFile()) return;
    const id = idFromFile(root, full, ignored);
    if (!id) return;
    const content = await fs.readFile(full, "utf8").catch(() => null);
    if (content == null) return;
    const stat = await fs.stat(full);
    const withContent = withMeta({
      id,
      title: extractTitle(content),
      preview: generatePreview(content),
      modified: Math.floor(stat.mtimeMs / 1000),
      content,
    }, metadata.notes[id]);
    delete withContent.content;
    notes.push(withContent);
  });
  const pinned = new Set(settings?.pinnedNoteIds || []);
  notes.sort((a, b) => {
    const ap = pinned.has(a.id);
    const bp = pinned.has(b.id);
    if (ap !== bp) return ap ? -1 : 1;
    return b.modified - a.modified;
  });
  return notes;
}

export async function listFolders(root, settings) {
  const ignored = ignoredDirs(settings);
  const folders = [];
  await walk(root, root, ignored, 0, async (full, entry) => {
    if (!entry.isDirectory() || full === root) return;
    const rel = path.relative(root, full).split(path.sep).join("/");
    if (rel) folders.push(rel);
  });
  folders.sort();
  return folders;
}

export async function readSettings(root) {
  try {
    const raw = await fs.readFile(path.join(root, ".scratch", "settings.json"), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.theme) parsed.theme = { mode: "system" };
    return parsed;
  } catch {
    return defaultSettings();
  }
}

export async function writeSettings(root, settings) {
  const dir = path.join(root, ".scratch");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "settings.json"), JSON.stringify(settings, null, 2));
}

export function searchNotes(notesWithContent, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return notesWithContent
    .map((note) => {
      const titleHit = note.title.toLowerCase().includes(q);
      const bodyHit = note.content.toLowerCase().includes(q);
      if (!titleHit && !bodyHit) return null;
      return {
        id: note.id,
        title: note.title,
        preview: note.preview,
        modified: note.modified,
        book: note.book,
        tags: note.tags,
        status: note.status,
        explicitStatus: note.explicitStatus,
        todoOpen: note.todoOpen,
        todoDone: note.todoDone,
        score: titleHit ? 2 : 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.modified - a.modified);
}

export async function readAllNotes(root, settings) {
  const ignored = ignoredDirs(settings);
  const metadata = await readMetadata(root);
  const notes = [];
  await walk(root, root, ignored, 0, async (full, entry) => {
    if (!entry.isFile()) return;
    const id = idFromFile(root, full, ignored);
    if (!id) return;
    const content = await fs.readFile(full, "utf8").catch(() => null);
    if (content == null) return;
    const stat = await fs.stat(full);
    notes.push(withMeta({
      id,
      title: extractTitle(content),
      preview: generatePreview(content),
      content,
      modified: Math.floor(stat.mtimeMs / 1000),
    }, metadata.notes[id]));
  });
  return notes;
}

export function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".md": "text/markdown; charset=utf-8",
  }[ext] || "application/octet-stream";
}
