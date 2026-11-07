import { useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNotes } from "../../context/NotesContext";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  tagCounts,
} from "../../lib/library";
import { StatusIcon } from "../ui";
import { cn } from "../../lib/utils";
import { CheckIcon, ChevronDownIcon, FolderIcon, XIcon } from "../icons";
import type { NoteStatus } from "../../types/note";

const statusItemClass =
  "px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2 rounded-sm";

export function NoteMetaBar({ className }: { className?: string }) {
  const { currentNote, notes, setNoteStatus, setNoteTags } = useNotes();
  const [tagInput, setTagInput] = useState("");

  const meta = useMemo(
    () =>
      currentNote ? notes.find((note) => note.id === currentNote.id) ?? null : null,
    [currentNote, notes],
  );
  const knownTags = useMemo(
    () => tagCounts(notes).map(({ tag }) => tag),
    [notes],
  );

  if (!currentNote || !meta) return null;

  const applyStatus = (status: NoteStatus | null) => {
    void setNoteStatus(meta.id, status);
  };

  const addTag = () => {
    const tag = tagInput.trim().replace(/^#/, "").slice(0, 50);
    setTagInput("");
    if (!tag) return;
    if (meta.tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      return;
    }
    void setNoteTags(meta.id, [...meta.tags, tag]);
  };

  const removeTag = (tag: string) => {
    void setNoteTags(
      meta.id,
      meta.tags.filter((existing) => existing !== tag),
    );
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 pb-1.5 min-h-8 text-xs text-text-muted",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 shrink-0 min-w-0">
        <FolderIcon className="w-3.5 h-3.5 stroke-[1.6] shrink-0" />
        <span className="truncate max-w-32">{meta.book || "Inbox"}</span>
      </span>

      <span className="w-px h-3.5 bg-border shrink-0" />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 h-6 pl-1.5 pr-1 rounded-md text-xs hover:bg-bg-muted hover:text-text transition-colors shrink-0"
            title="Note status"
          >
            <StatusIcon status={meta.status} />
            <span>{STATUS_LABELS[meta.status]}</span>
            {meta.explicitStatus == null && (
              <span className="text-text-muted/60">auto</span>
            )}
            <ChevronDownIcon className="w-3 h-3 stroke-[1.8]" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="min-w-48 bg-bg border border-border rounded-md shadow-lg py-1 z-50"
            sideOffset={5}
            align="start"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenu.Item
              className={statusItemClass}
              onSelect={() => applyStatus(null)}
            >
              <span className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">Auto (from todos)</span>
              {meta.explicitStatus == null && (
                <CheckIcon className="w-3.5 h-3.5 stroke-[2]" />
              )}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="h-px bg-border my-1" />
            {STATUS_ORDER.map((status) => (
              <DropdownMenu.Item
                key={status}
                className={statusItemClass}
                onSelect={() => applyStatus(status)}
              >
                <StatusIcon status={status} />
                <span className="flex-1">{STATUS_LABELS[status]}</span>
                {meta.explicitStatus === status && (
                  <CheckIcon className="w-3.5 h-3.5 stroke-[2]" />
                )}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <span className="w-px h-3.5 bg-border shrink-0" />

      <div className="flex flex-wrap items-center gap-1 min-w-0">
        {meta.tags.map((tag) => (
          <span
            key={tag}
            className="group flex items-center gap-1 h-6 pl-2 pr-1 rounded bg-bg-muted text-xs text-text-muted"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="w-4 h-4 flex items-center justify-center rounded text-text-muted/60 hover:text-text hover:bg-bg-emphasis"
              title={`Remove tag ${tag}`}
            >
              <XIcon className="w-3 h-3 stroke-[1.8]" />
            </button>
          </span>
        ))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            addTag();
          }}
        >
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="+ tag"
            list="scratch-tag-suggestions"
            className="h-6 w-14 focus:w-24 px-1.5 rounded text-xs bg-transparent text-text placeholder:text-text-muted/60 border border-transparent focus:border-border focus:outline-none transition-[width]"
            aria-label="Add tag"
          />
          <datalist id="scratch-tag-suggestions">
            {knownTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </form>
      </div>
    </div>
  );
}
