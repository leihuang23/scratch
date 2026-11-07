import { useState } from "react";
import { useNotes } from "../../context/NotesContext";
import { cleanTitle } from "../../lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui";
import { TrashIcon } from "../icons";
import type { TrashEntry } from "../../types/note";

function formatTrashedAt(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const actionClass =
  "h-6 px-2 text-xs rounded bg-bg-emphasis text-text-muted hover:text-text hover:bg-bg-muted transition-colors";

export function TrashList() {
  const { trash, restoreTrashNote, deleteTrashNotePermanently, emptyTrash } =
    useNotes();
  const [pendingDelete, setPendingDelete] = useState<TrashEntry | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  if (trash.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-text-muted select-none">
        Trash is empty
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-text-muted select-none">
        <span>
          {trash.length} deleted note{trash.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => setEmptyOpen(true)}
          className="text-xs text-text-muted hover:text-text transition-colors"
        >
          Empty trash
        </button>
      </div>

      <div className="flex flex-col gap-1 p-1.5">
        {trash.map((entry) => (
          <div
            key={entry.key}
            className="rounded-md px-2.5 py-2 hover:bg-bg-muted transition-colors"
          >
            <div className="flex items-start gap-2">
              <TrashIcon className="w-4 h-4 mt-0.5 shrink-0 text-text-muted/70 stroke-[1.6]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate text-text">
                  {cleanTitle(entry.title)}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {entry.book || "Inbox"} · {formatTrashedAt(entry.trashedAt)}
                </div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-1 pl-6">
              <button
                type="button"
                onClick={() => restoreTrashNote(entry.key)}
                className={actionClass}
              >
                Restore
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(entry)}
                className={`${actionClass} hover:text-red-500`}
              >
                Delete forever
              </button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete forever?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `"${cleanTitle(pendingDelete.title)}" will be permanently deleted. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingDelete) {
                  await deleteTrashNotePermanently(pendingDelete.key);
                  setPendingDelete(null);
                }
              }}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={emptyOpen} onOpenChange={setEmptyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty trash?</AlertDialogTitle>
            <AlertDialogDescription>
              All {trash.length} trashed note{trash.length === 1 ? "" : "s"} will
              be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await emptyTrash();
                setEmptyOpen(false);
              }}
            >
              Empty trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
