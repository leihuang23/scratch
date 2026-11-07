import { useState } from "react";
import { useNotes } from "../../context/NotesContext";
import { useTheme } from "../../context/ThemeContext";
import { Button } from "../ui";
import { invoke } from "../../platform";

export function FolderPicker() {
  const { setNotesFolder } = useNotes();
  const { reloadSettings } = useTheme();
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  const applyFolder = async (selected: string) => {
    await setNotesFolder(selected);
    await reloadSettings();
  };

  const handleSelectFolder = async () => {
    setError(null);
    try {
      const selected = await invoke<string | null>("open_folder_dialog");

      if (selected && typeof selected === "string") {
        await applyFolder(selected);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
      setError(err instanceof Error ? err.message : "Failed to select folder");
    }
  };

  const handlePathSubmit = async () => {
    const selected = path.trim();
    if (!selected) return;
    setError(null);
    try {
      await applyFolder(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open folder");
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center p-8 max-w-lg select-none">
          <div
            role="img"
            aria-label="Folders"
            className="w-48 aspect-square mx-auto mb-2 opacity-40 animate-fade-in-up"
            style={{
              animationDelay: "0ms",
              backgroundColor: "var(--color-text)",
              WebkitMaskImage: "url(/folders-dark.png)",
              WebkitMaskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskImage: "url(/folders-dark.png)",
              maskSize: "contain",
              maskRepeat: "no-repeat",
              maskPosition: "center",
            }}
          />

          <h1
            className="text-3xl text-text font-serif mb-2 tracking-[-0.01em] animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            Welcome to Scratch
          </h1>
          <p
            className="text-text-muted mb-6 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            Scratch is an offline-first notes app. Your notes are simply stored
            on your computer as markdown files.
          </p>
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            <Button onClick={handleSelectFolder} size="xl">
              Choose your notes folder
            </Button>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void handlePathSubmit();
              }}
            >
              <input
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="/path/to/notes"
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text"
                aria-label="Notes folder path"
              />
              <Button type="submit" variant="outline">
                Open path
              </Button>
            </form>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>

          <p
            className="mt-2 text-xs text-text-muted/60 animate-fade-in-up"
            style={{ animationDelay: "300ms" }}
          >
            You can change this later
          </p>
        </div>
      </div>
    </div>
  );
}
