import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { listen } from "./platform";
import { GitProvider } from "./context/GitContext";
import { TooltipProvider, Toaster } from "./components/ui";
import { Sidebar } from "./components/layout/Sidebar";
import { NavPanel } from "./components/layout/NavPanel";
import { SidebarResizeHandle } from "./components/layout/SidebarResizeHandle";
import { SIDEBAR_DEFAULT_PX } from "./lib/sidebar";
import { Editor } from "./components/editor/Editor";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { FolderPicker } from "./components/layout/FolderPicker";
import { CommandPalette } from "./components/command-palette/CommandPalette";
import { SettingsPage } from "./components/settings";
import { SpinnerIcon } from "./components/icons";
import { KeyboardShortcutsModal } from "./components/shortcuts/KeyboardShortcutsModal";
import { PreviewApp } from "./components/preview/PreviewApp";
import { isMac, isWindows } from "./lib/platform";

// Detect preview mode from URL search params
function getWindowMode(): {
  isPreview: boolean;
  previewFile: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const file = params.get("file");
  return {
    isPreview: mode === "preview" && !!file,
    previewFile: file,
  };
}

type ViewState = "notes" | "settings";

function AppContent() {
  const {
    notesFolder,
    isLoading,
    createNote,
    duplicateNote,
    visibleNotes,
    selectedNoteId,
    selectNote,
    searchQuery,
    searchResults,
    reloadCurrentNote,
    currentNote,
    syncNotesFolder,
  } = useNotes();
  const { interfaceZoom, setInterfaceZoom, reloadSettings } = useTheme();
  const interfaceZoomRef = useRef(interfaceZoom);
  interfaceZoomRef.current = interfaceZoom;
  const currentNoteRef = useRef(currentNote);
  currentNoteRef.current = currentNote;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState<ViewState>("notes");
  const [navPanelVisible, setNavPanelVisible] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const editorRef = useRef<TiptapEditor | null>(null);

  // Listen for set-notes-folder event from CLI (scratch .)
  // Placed here in AppContent where both NotesContext and ThemeContext are available
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<string>("set-notes-folder", async (event) => {
      await syncNotesFolder(event.payload);
      await reloadSettings();
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [syncNotesFolder, reloadSettings]);

  const toggleNavPanel = useCallback(() => {
    setNavPanelVisible((prev) => !prev);
  }, []);

  const toggleZenMode = useCallback(() => {
    setZenMode((prev) => {
      // Don't enter zen mode without a selected note
      if (!prev && !selectedNoteId) return prev;
      return !prev;
    });
  }, [selectedNoteId]);

  // Zen mode needs an open note; leave it when the note goes away.
  useEffect(() => {
    if (!selectedNoteId) setZenMode(false);
  }, [selectedNoteId]);

  const toggleSettings = useCallback(() => {
    setView((prev) => (prev === "settings" ? "notes" : "settings"));
  }, []);

  const closeSettings = useCallback(() => {
    setView("notes");
  }, []);

  // Memoize display items to prevent unnecessary recalculations
  const displayItems = useMemo(() => {
    return searchQuery.trim() ? searchResults : visibleNotes;
  }, [searchQuery, searchResults, visibleNotes]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInEditor = !!target.closest(".ProseMirror");
      const isInInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const isEditorEmpty =
        isInEditor && currentNoteRef.current?.content.trim() === "";

      // Cmd+, - Toggle settings (always works, even in settings)
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
        return;
      }

      // Cmd+= or Cmd++ - Zoom in (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev + 0.05);
        const newZoom = Math.round(Math.min(interfaceZoomRef.current + 0.05, 1.5) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd+- - Zoom out (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev - 0.05);
        const newZoom = Math.round(Math.max(interfaceZoomRef.current - 0.05, 0.7) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd+0 - Reset zoom (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        setInterfaceZoom(1.0);
        toast("Zoom 100%", { id: "zoom", duration: 1500 });
        return;
      }

      // Block all other shortcuts when in settings view
      if (view === "settings") {
        return;
      }

      // Cmd+Shift+Enter - Toggle zen mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        toggleZenMode();
        return;
      }

      // Cmd+Shift+M - Toggle markdown source mode
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "m"
      ) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-source-mode"));
        return;
      }

      // Escape exits zen mode when not in editor
      if (e.key === "Escape" && zenMode && !isInEditor) {
        e.preventDefault();
        toggleZenMode();
        return;
      }

      // Let dialogs handle their own keyboard events (Tab, Enter, etc.)
      if (target.closest("[role='dialog'], [role='alertdialog']")) {
        return;
      }

      // Trap Tab/Shift+Tab in notes view only - prevent focus navigation
      // TipTap handles indentation internally before event bubbles up
      if (e.key === "Tab") {
        e.preventDefault();
        return;
      }

      // Cmd+P - Open command palette
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "p") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Cmd+Shift+P - Print
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("print-note"));
        return;
      }

      // Cmd+/ - Open keyboard shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Cmd/Ctrl+Shift+F - Open sidebar search
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setZenMode(false);
        window.dispatchEvent(new CustomEvent("open-sidebar-search"));
        return;
      }

      // Cmd+\ - Toggle library panel
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleNavPanel();
        return;
      }

      // Cmd+N - New note
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createNote();
        return;
      }

      // Delete current note (note list focused, or editor on empty note)
      if (
        selectedNoteId &&
        !isInInput &&
        (e.key === "Delete" ||
          (e.key === "Backspace" && (e.metaKey || e.ctrlKey))) &&
        (!isInEditor || isEditorEmpty)
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("request-delete-note", { detail: selectedNoteId }),
        );
        return;
      }

      // Cmd+D - Duplicate current note
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "d" &&
        !isInEditor &&
        !isInInput &&
        selectedNoteId
      ) {
        e.preventDefault();
        duplicateNote(selectedNoteId);
        return;
      }

      // Cmd+R - Reload current note (pull external changes)
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        reloadCurrentNote();
        return;
      }

      // Arrow keys for note navigation
      // Skip if folder tree view is handling its own navigation
      const isInFolderTree = !!(e.target as HTMLElement).closest("[data-folder-tree]");
      if (
        displayItems.length > 0 &&
        (e.key === "ArrowDown" || e.key === "ArrowUp") &&
        ((!isInEditor && !isInInput) || isEditorEmpty) &&
        !isInFolderTree
      ) {
        e.preventDefault();
        const currentIndex = displayItems.findIndex(
          (n) => n.id === selectedNoteId,
        );
        let newIndex: number;

        if (e.key === "ArrowDown") {
          newIndex =
            currentIndex < displayItems.length - 1 ? currentIndex + 1 : 0;
        } else {
          newIndex =
            currentIndex > 0 ? currentIndex - 1 : displayItems.length - 1;
        }

        selectNote(displayItems[newIndex].id);
        window.dispatchEvent(new CustomEvent("focus-note-list"));
        return;
      }

      // Enter to focus editor
      if (e.key === "Enter" && selectedNoteId && !isInEditor && !isInInput) {
        e.preventDefault();
        const editor = document.querySelector(".ProseMirror") as HTMLElement;
        if (editor) {
          editor.focus();
        }
        return;
      }

      // Escape to blur editor and go back to note list
      if (e.key === "Escape" && isInEditor) {
        e.preventDefault();
        (target as HTMLElement).blur();
        // Focus the note list for keyboard navigation
        window.dispatchEvent(new CustomEvent("focus-note-list"));
        return;
      }
    };

    // Disable right-click context menu except in editor
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Allow context menu in editor (prose class), inputs, and note list sidebar
      const isInEditor =
        target.closest(".prose") || target.closest(".ProseMirror");
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const isInNoteList = target.closest("[data-note-list]");
      if (!isInEditor && !isInput && !isInNoteList) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [
    createNote,
    duplicateNote,
    displayItems,
    reloadCurrentNote,
    selectedNoteId,
    selectNote,
    toggleSettings,
    toggleNavPanel,
    toggleZenMode,
    zenMode,
    view,
    setInterfaceZoom,
  ]);

  const handleClosePalette = useCallback(() => {
    setPaletteOpen(false);
    editorRef.current?.commands.focus();
  }, []);

  if (isLoading) {
    return (
      <div className="h-full min-h-0 flex items-center justify-center bg-bg-secondary">
        <div className="text-text-muted/70 text-sm flex items-center gap-1.5 font-medium">
          <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin" />
          Initializing Scratch...
        </div>
      </div>
    );
  }

  if (!notesFolder) {
    return <FolderPicker />;
  }

  return (
    <>
      <div className="h-full min-h-0 flex bg-bg text-text overflow-hidden">
        {view === "settings" ? (
          <SettingsPage onBack={closeSettings} />
        ) : (
          <>
            <div
              data-nav-panel
              className={`shrink-0 h-full overflow-hidden transition-[width,opacity] duration-500 ease-out ${
                !navPanelVisible || zenMode ? "w-0 opacity-0" : "w-56 opacity-100"
              }`}
            >
              <div className="w-56 h-full">
                <NavPanel onOpenSettings={toggleSettings} />
              </div>
            </div>
            <div
              data-sidebar
              style={{ width: zenMode ? 0 : `var(--sidebar-width, ${SIDEBAR_DEFAULT_PX}px)` }}
              className={`relative transition-all duration-500 ease-out overflow-hidden ${zenMode ? "opacity-0 -translate-x-4 pointer-events-none" : "opacity-100 translate-x-0"}`}
            >
              <Sidebar />
              {!zenMode && <SidebarResizeHandle />}
            </div>
            <Editor
              onToggleNavPanel={toggleNavPanel}
              navPanelVisible={navPanelVisible}
              onToggleZenMode={toggleZenMode}
              zenMode={zenMode}
              onEditorReady={(editor) => {
                editorRef.current = editor;
              }}
            />
          </>
        )}
      </div>

      {paletteOpen && (
        <div
          className="fixed inset-0 bg-text/50 backdrop-blur-sm z-40 animate-fade-in"
          onClick={handleClosePalette}
        />
      )}

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={handleClosePalette}
        onOpenSettings={toggleSettings}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        zenMode={zenMode}
        onToggleZenMode={toggleZenMode}
        editorRef={editorRef}
      />
    </>
  );
}

function App() {
  const { isPreview, previewFile } = useMemo(getWindowMode, []);

  useEffect(() => {
    const os = isMac ? "mac" : isWindows ? "windows" : "linux";
    document.documentElement.classList.add(`platform-${os}`);
  }, []);

  // Preview mode: lightweight editor without sidebar, search, git
  if (isPreview && previewFile) {
    return (
      <ThemeProvider>
        <Toaster />
        <TooltipProvider>
          <PreviewApp filePath={decodeURIComponent(previewFile)} />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  // Folder mode: full app with sidebar, search, git, etc.
  return (
    <ThemeProvider>
      <Toaster />
      <TooltipProvider>
        <NotesProvider>
          <GitProvider>
            <AppContent />
          </GitProvider>
        </NotesProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
