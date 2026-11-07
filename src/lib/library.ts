import type { NoteFilter, NoteMetadata, NoteStatus } from "../types/note";

export const STATUS_ORDER: NoteStatus[] = [
  "active",
  "on-hold",
  "completed",
  "dropped",
];

export const STATUS_LABELS: Record<NoteStatus, string> = {
  active: "Active",
  "on-hold": "On Hold",
  completed: "Completed",
  dropped: "Dropped",
};

/** Icon tint per status, matching Inkdrop's status colors. */
export const STATUS_ICON_COLOR: Record<NoteStatus, string> = {
  active: "text-slate-400",
  "on-hold": "text-amber-500",
  completed: "text-emerald-500",
  dropped: "text-rose-400",
};

export const ALL_FILTER: NoteFilter = { type: "all" };

export function matchesFilter(note: NoteMetadata, filter: NoteFilter): boolean {
  switch (filter.type) {
    case "all":
      return true;
    case "notebook":
      if (!filter.path) return note.book === "";
      return (
        note.book === filter.path || note.book.startsWith(`${filter.path}/`)
      );
    case "status":
      return note.status === filter.status;
    case "tag":
      return note.tags.some(
        (tag) => tag.toLowerCase() === filter.tag.toLowerCase(),
      );
    case "trash":
      return false;
  }
}

export function sameFilter(a: NoteFilter, b: NoteFilter): boolean {
  if (a.type === "notebook") return b.type === "notebook" && a.path === b.path;
  if (a.type === "status") return b.type === "status" && a.status === b.status;
  if (a.type === "tag") {
    return b.type === "tag" && a.tag.toLowerCase() === b.tag.toLowerCase();
  }
  return a.type === b.type;
}

export function filterLabel(filter: NoteFilter): string {
  switch (filter.type) {
    case "all":
      return "All Notes";
    case "notebook":
      if (!filter.path) return "Inbox";
      return filter.path.slice(filter.path.lastIndexOf("/") + 1);
    case "status":
      return STATUS_LABELS[filter.status];
    case "tag":
      return `#${filter.tag}`;
    case "trash":
      return "Trash";
  }
}

export function filterSubLabel(filter: NoteFilter): string | null {
  return filter.type === "notebook" && filter.path ? filter.path : null;
}

export function statusCounts(notes: NoteMetadata[]): Record<NoteStatus, number> {
  const counts: Record<NoteStatus, number> = {
    active: 0,
    "on-hold": 0,
    completed: 0,
    dropped: 0,
  };
  for (const note of notes) counts[note.status] += 1;
  return counts;
}

export function tagCounts(notes: NoteMetadata[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const key = tag.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  );
}

export interface NotebookNode {
  name: string;
  path: string;
  count: number;
  children: NotebookNode[];
}

/** Build the notebook tree from folder paths plus note counts. */
export function buildNotebooks(
  folders: string[],
  notes: NoteMetadata[],
): NotebookNode[] {
  const nodes = new Map<string, NotebookNode>();

  function ensure(folderPath: string): NotebookNode {
    const existing = nodes.get(folderPath);
    if (existing) return existing;
    const name = folderPath.slice(folderPath.lastIndexOf("/") + 1);
    const node: NotebookNode = { name, path: folderPath, count: 0, children: [] };
    nodes.set(folderPath, node);
    const slash = folderPath.lastIndexOf("/");
    if (slash > 0) ensure(folderPath.slice(0, slash)).children.push(node);
    return node;
  }

  for (const folder of folders) {
    if (folder) ensure(folder);
  }
  for (const note of notes) {
    if (note.book) ensure(note.book).count += 1;
  }

  const sort = (list: NotebookNode[]): number => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of list) node.count += sort(node.children);
    return list.reduce((total, node) => total + node.count, 0);
  };
  const roots = [...nodes.values()].filter((node) => !node.path.includes("/"));
  sort(roots);
  return roots;
}

export function inboxCount(notes: NoteMetadata[]): number {
  return notes.reduce((count, note) => count + (note.book === "" ? 1 : 0), 0);
}
