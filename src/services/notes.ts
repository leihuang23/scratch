import { invoke } from "../platform";
import type {
  Note,
  NoteMetadata,
  NoteStatus,
  Settings,
  TrashEntry,
} from "../types/note";

export async function getNotesFolder(): Promise<string | null> {
  return invoke("get_notes_folder");
}

export async function setNotesFolder(path: string): Promise<void> {
  return invoke("set_notes_folder", { path });
}

export async function listNotes(): Promise<NoteMetadata[]> {
  return invoke("list_notes", undefined, { timeoutMs: 15_000 });
}

export async function readNote(id: string): Promise<Note> {
  return invoke("read_note", { id }, { timeoutMs: 10_000 });
}

export async function saveNote(id: string | null, content: string): Promise<Note> {
  return invoke("save_note", { id, content });
}

/** Moves the note into the trash (soft delete). */
export async function deleteNote(id: string): Promise<void> {
  return invoke("delete_note", { id });
}

export async function setNoteStatus(
  id: string,
  status: NoteStatus | null,
): Promise<void> {
  return invoke("set_note_status", { id, status });
}

export async function setNoteTags(id: string, tags: string[]): Promise<void> {
  return invoke("set_note_tags", { id, tags });
}

export async function listTrash(): Promise<TrashEntry[]> {
  return invoke("list_trash", undefined, { timeoutMs: 10_000 });
}

export async function restoreNote(key: string): Promise<string> {
  return invoke("restore_note", { key });
}

export async function deleteTrashNote(key: string): Promise<void> {
  return invoke("delete_trash_note", { key });
}

export async function emptyTrash(): Promise<void> {
  return invoke("empty_trash");
}

export async function createNote(targetFolder?: string): Promise<Note> {
  return invoke("create_note", { targetFolder: targetFolder ?? null });
}

export async function listFolders(): Promise<string[]> {
  return invoke("list_folders");
}

export async function createFolder(path: string): Promise<void> {
  return invoke("create_folder", { path });
}

export async function deleteFolder(path: string): Promise<void> {
  return invoke("delete_folder", { path });
}

export async function renameFolder(
  oldPath: string,
  newName: string,
): Promise<string> {
  return invoke("rename_folder", { oldPath, newName });
}

export async function moveNote(id: string, targetFolder: string): Promise<string> {
  return invoke("move_note", { id, targetFolder });
}

export async function moveFolder(path: string, targetParent: string): Promise<void> {
  return invoke("move_folder", { path, targetParent });
}

export async function duplicateNote(id: string): Promise<Note> {
  // Read the original note, then create a new one in the same folder
  const original = await readNote(id);
  const lastSlash = id.lastIndexOf("/");
  const folder = lastSlash > 0 ? id.substring(0, lastSlash) : undefined;
  const newNote = await createNote(folder);
  // Save with the original content (title will be extracted from content)
  const duplicatedContent = original.content.replace(/^# (.+)$/m, (_, title) => `# ${title} (Copy)`);
  return saveNote(newNote.id, duplicatedContent || original.content);
}

export async function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export async function updateSettings(settings: Settings): Promise<void> {
  return invoke("update_settings", { newSettings: settings });
}

export async function updateGitEnabled(
  enabled: boolean,
  expectedFolder: string,
): Promise<void> {
  return invoke("update_git_enabled", {
    enabled,
    expectedFolder,
  });
}

export interface SearchResult extends NoteMetadata {
  score: number;
}

export async function searchNotes(query: string): Promise<SearchResult[]> {
  return invoke("search_notes", { query });
}

export async function startFileWatcher(): Promise<void> {
  return invoke("start_file_watcher");
}
