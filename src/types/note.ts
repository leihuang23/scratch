export type NoteStatus = "active" | "on-hold" | "completed" | "dropped";

export interface NoteMetadata {
  id: string;
  title: string;
  preview: string;
  modified: number;
  /** Notebook path; empty string means the vault root (Inbox). */
  book: string;
  tags: string[];
  /** Effective status: explicit override or derived from todo items. */
  status: NoteStatus;
  /** Manual override, null when the status is derived from content. */
  explicitStatus: NoteStatus | null;
  todoOpen: number;
  todoDone: number;
}

export interface TrashEntry {
  key: string;
  id: string;
  title: string;
  preview: string;
  book: string;
  modified: number;
  trashedAt: number;
  status: NoteStatus | null;
  tags: string[];
}

export type NoteFilter =
  | { type: "all" }
  | { type: "notebook"; path: string }
  | { type: "status"; status: NoteStatus }
  | { type: "tag"; tag: string }
  | { type: "trash" };

export interface Note {
  id: string;
  title: string;
  content: string;
  path: string;
  modified: number;
}

export interface ThemeSettings {
  mode: "light" | "dark" | "system";
}

export type FontFamily = "system-sans" | "serif" | "monospace";
export type TextDirection = "auto" | "ltr" | "rtl";
export type EditorWidth = "narrow" | "normal" | "wide" | "full" | "custom";

export interface EditorFontSettings {
  baseFontFamily?: FontFamily;
  baseFontSize?: number; // in px, default 16
  boldWeight?: number; // 600, 700, 800 for headings and bold text
  lineHeight?: number; // default 1.6
}

// Customizable theme color keys (maps to CSS --color-* variables)
export type ThemeColorKey =
  | "bg"
  | "bg-secondary"
  | "bg-muted"
  | "bg-emphasis"
  | "text"
  | "text-muted"
  | "border"
  | "accent"
  | "selection";

// Partial map of color overrides (hex strings)
export type CustomColors = Partial<Record<ThemeColorKey, string>>;

// Per-folder settings (stored in .scratch/settings.json)
export interface Settings {
  theme: ThemeSettings;
  editorFont?: EditorFontSettings;
  gitEnabled?: boolean;
  foldersEnabled?: boolean;
  pinnedNoteIds?: string[];
  textDirection?: TextDirection;
  editorWidth?: EditorWidth;
  customEditorWidthPx?: number;
  sidebarWidthPx?: number;
  defaultNoteName?: string;
  interfaceZoom?: number;
  ignoredPatterns?: string[];
  customColorsLight?: CustomColors;
  customColorsDark?: CustomColors;
}

export interface FolderNode {
  name: string;
  path: string;
  children: FolderNode[];
  notes: NoteMetadata[];
}
