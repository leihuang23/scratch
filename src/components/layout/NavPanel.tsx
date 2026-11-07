import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useNotes } from "../../context/NotesContext";
import * as notesService from "../../services/notes";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  buildNotebooks,
  inboxCount,
  sameFilter,
  statusCounts,
  tagCounts,
  type NotebookNode,
} from "../../lib/library";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TrashIcon,
} from "../icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  IconButton,
  StatusIcon,
} from "../ui";
import { FolderNameDialog } from "../notes/FolderNameDialog";
import { cn } from "../../lib/utils";
import { mod, isMac } from "../../lib/platform";
import type { NoteFilter } from "../../types/note";

const menuItemClass =
  "px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2 rounded-sm";

const menuSeparatorClass = "h-px bg-border my-1";

const notebookDragData = { type: "notebook" } as const;

interface NotebookDragData {
  type: "notebook";
  path: string;
}

type NotebookDropData =
  | { type: "notebook"; path: string }
  | { type: "notebook-root" };

function leafName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

interface NavRowProps {
  label: ReactNode;
  count?: number;
  active: boolean;
  onClick: () => void;
  leading?: ReactNode;
  depth?: number;
}

function NavRow({ label, count, active, onClick, leading, depth = 0 }: NavRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={depth ? { paddingLeft: `${12 + depth * 14}px` } : undefined}
      className={cn(
        "w-full flex items-center gap-2 pr-2 py-1.5 rounded-md text-sm text-left transition-colors",
        depth ? "" : "pl-3",
        active
          ? "bg-bg-muted text-text font-medium"
          : "text-text-muted hover:bg-bg-muted hover:text-text",
      )}
    >
      {leading}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count != null && (
        <span className="text-xs tabular-nums text-text-muted/80 shrink-0">
          {count}
        </span>
      )}
    </button>
  );
}

function SectionLabel({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="px-3 mt-5 mb-1 flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted/80">
        {children}
      </span>
      {action}
    </div>
  );
}

interface NotebookRowProps {
  node: NotebookNode;
  depth: number;
  activeFilter: NoteFilter;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onRename: (node: NotebookNode) => void;
  onDelete: (node: NotebookNode) => void;
}

function NotebookRow({
  node,
  depth,
  activeFilter,
  collapsed,
  onToggle,
  onSelect,
  onRename,
  onDelete,
}: NotebookRowProps) {
  const isCollapsed = collapsed.has(node.path);
  const hasChildren = node.children.length > 0;

  const draggable = useDraggable({
    id: `notebook-drag:${node.path}`,
    data: { ...notebookDragData, path: node.path },
  });
  const droppable = useDroppable({
    id: `notebook-drop:${node.path}`,
    data: { ...notebookDragData, path: node.path },
  });

  const setRefs = (element: HTMLDivElement | null) => {
    draggable.setNodeRef(element);
    droppable.setNodeRef(element);
  };

  return (
    <div>
      <div
        ref={setRefs}
        {...draggable.listeners}
        data-notebook-path={node.path}
        className={cn(
          "relative rounded-md",
          draggable.isDragging && "opacity-40",
          droppable.isOver && "ring-1 ring-inset ring-accent/60",
        )}
      >
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div className="relative flex items-center">
              <span
                role="button"
                tabIndex={-1}
                aria-label={
                  hasChildren
                    ? `${isCollapsed ? "Expand" : "Collapse"} ${node.name}`
                    : undefined
                }
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasChildren) onToggle(node.path);
                }}
                style={{ left: `${4 + depth * 14}px` }}
                className={cn(
                  "absolute z-10 w-4 h-4 flex items-center justify-center rounded text-text-muted",
                  hasChildren ? "hover:text-text cursor-pointer" : "opacity-0",
                )}
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="w-3.5 h-3.5 stroke-[1.8]" />
                ) : (
                  <ChevronDownIcon className="w-3.5 h-3.5 stroke-[1.8]" />
                )}
              </span>
              <NavRow
                label={node.name}
                count={node.count}
                depth={depth + 1}
                active={sameFilter(activeFilter, {
                  type: "notebook",
                  path: node.path,
                })}
                onClick={() => onSelect(node.path)}
              />
            </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="min-w-40 bg-bg border border-border rounded-md shadow-lg py-1 z-50">
              <ContextMenu.Item
                className={menuItemClass}
                onSelect={() => onRename(node)}
              >
                <PencilIcon className="w-4 h-4 stroke-[1.6]" />
                Rename
              </ContextMenu.Item>
              <ContextMenu.Separator className={menuSeparatorClass} />
              <ContextMenu.Item
                className={`${menuItemClass} text-red-500 hover:text-red-500 focus:text-red-500`}
                onSelect={() => onDelete(node)}
              >
                <TrashIcon className="w-4 h-4 stroke-[1.6]" />
                Delete
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      </div>
      {hasChildren && !isCollapsed && (
        <NotebookTree
          nodes={node.children}
          depth={depth + 1}
          activeFilter={activeFilter}
          collapsed={collapsed}
          onToggle={onToggle}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

interface NotebookTreeProps {
  nodes: NotebookNode[];
  depth: number;
  activeFilter: NoteFilter;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onRename: (node: NotebookNode) => void;
  onDelete: (node: NotebookNode) => void;
}

function NotebookTree(props: NotebookTreeProps) {
  return (
    <>
      {props.nodes.map((node) => (
        <NotebookRow key={node.path} {...props} node={node} />
      ))}
    </>
  );
}

/** Header + Inbox act as the top-level drop target for un-nesting notebooks. */
function RootDropTarget({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "notebook-root-drop",
    data: { type: "notebook-root" },
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-md transition-shadow",
        active && isOver && "ring-1 ring-inset ring-accent/60 bg-bg-muted/30",
      )}
    >
      {children}
    </div>
  );
}

interface NavPanelProps {
  onOpenSettings?: () => void;
}

export function NavPanel({ onOpenSettings }: NavPanelProps) {
  const {
    notes,
    trash,
    activeFilter,
    setActiveFilter,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
  } = useNotes();
  const [folders, setFolders] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [notebookDialogOpen, setNotebookDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<NotebookNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NotebookNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dragPath, setDragPath] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    notesService
      .listFolders()
      .then(setFolders)
      .catch((error) => console.error("Failed to load folders:", error));
  }, [notes]);

  const notebooks = useMemo(
    () => buildNotebooks(folders, notes),
    [folders, notes],
  );
  const statusCount = useMemo(() => statusCounts(notes), [notes]);
  const tags = useMemo(() => tagCounts(notes), [notes]);
  const inboxTotal = useMemo(() => inboxCount(notes), [notes]);

  const toggleNotebook = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleCreateNotebook = async (name: string) => {
    try {
      await createFolder("", name);
      setNotebookDialogOpen(false);
      setActiveFilter({ type: "notebook", path: name });
    } catch (error) {
      console.error("Failed to create notebook:", error);
      toast.error("Failed to create notebook");
    }
  };

  const handleRenameNotebook = async (newName: string) => {
    if (!renameTarget) return;
    if (newName === leafName(renameTarget.path)) {
      setRenameTarget(null);
      return;
    }
    try {
      await renameFolder(renameTarget.path, newName);
      setRenameTarget(null);
    } catch (error) {
      console.error("Failed to rename notebook:", error);
      toast.error("Failed to rename notebook");
    }
  };

  const handleDeleteNotebook = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteFolder(deleteTarget.path);
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete notebook:", error);
      toast.error("Failed to delete notebook");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as NotebookDragData | undefined;
    if (data?.type === "notebook") setDragPath(data.path);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setDragPath(null);
    const data = event.active.data.current as NotebookDragData | undefined;
    const target = event.over?.data.current as NotebookDropData | undefined;
    if (!data || data.type !== "notebook") return;
    if (!target) return;

    const parentPath = target.type === "notebook" ? target.path : "";
    const path = data.path;
    if (target.type === "notebook") {
      // Never nest a notebook inside itself or one of its descendants.
      if (parentPath === path || parentPath.startsWith(`${path}/`)) return;
    }
    const currentParent = path.includes("/")
      ? path.substring(0, path.lastIndexOf("/"))
      : "";
    if (currentParent === parentPath) return;

    try {
      await moveFolder(path, parentPath);
    } catch (error) {
      console.error("Failed to move notebook:", error);
      toast.error("Failed to move notebook");
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragPath(null)}
    >
      <div className="w-full h-full bg-bg-secondary border-r border-border flex flex-col select-none">
        <div className="flex items-center pl-4 pr-3 py-2 border-b border-border shrink-0">
          <span className="font-medium text-base">Library</span>
        </div>

        <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
          <NavRow
            label="All Notes"
            count={notes.length}
            active={activeFilter.type === "all"}
            onClick={() => setActiveFilter({ type: "all" })}
          />

          <RootDropTarget active={dragPath != null}>
            <SectionLabel
              action={
                <IconButton
                  size="xs"
                  onClick={() => setNotebookDialogOpen(true)}
                  title="New notebook"
                  className="-mr-1"
                >
                  <PlusIcon className="w-4 h-4 stroke-[1.6]" />
                </IconButton>
              }
            >
              Notebooks
            </SectionLabel>
            <NavRow
              label="Inbox"
              count={inboxTotal}
              active={sameFilter(activeFilter, { type: "notebook", path: "" })}
              onClick={() => setActiveFilter({ type: "notebook", path: "" })}
            />
          </RootDropTarget>

          <NotebookTree
            nodes={notebooks}
            depth={0}
            activeFilter={activeFilter}
            collapsed={collapsed}
            onToggle={toggleNotebook}
            onSelect={(path) => setActiveFilter({ type: "notebook", path })}
            onRename={setRenameTarget}
            onDelete={setDeleteTarget}
          />

          <SectionLabel>Status</SectionLabel>
          {STATUS_ORDER.map((status) => (
            <NavRow
              key={status}
              label={STATUS_LABELS[status]}
              count={statusCount[status]}
              active={sameFilter(activeFilter, { type: "status", status })}
              onClick={() => setActiveFilter({ type: "status", status })}
              leading={<StatusIcon status={status} />}
            />
          ))}

          <SectionLabel>Tags</SectionLabel>
          {tags.length === 0 ? (
            <div className="px-3 py-1.5 text-xs text-text-muted/70">
              No tags yet
            </div>
          ) : (
            tags.map(({ tag, count }) => (
              <NavRow
                key={tag.toLowerCase()}
                label={tag}
                count={count}
                active={sameFilter(activeFilter, { type: "tag", tag })}
                onClick={() => setActiveFilter({ type: "tag", tag })}
                leading={<span className="text-text-muted text-sm">#</span>}
              />
            ))
          )}

          <div className="mt-4 pt-2 border-t border-border px-0">
            <NavRow
              label="Trash"
              count={trash.length}
              active={activeFilter.type === "trash"}
              onClick={() => setActiveFilter({ type: "trash" })}
              leading={<TrashIcon className="w-3.5 h-3.5 stroke-[1.6] shrink-0" />}
            />
          </div>
        </div>

        {onOpenSettings && (
          <div className="shrink-0 border-t border-border px-1.5 py-1.5">
            <button
              type="button"
              onClick={onOpenSettings}
              title={`Settings (${mod}${isMac ? "" : "+"}, to toggle)`}
              aria-label={`Settings (${mod}${isMac ? "" : "+"}, to toggle)`}
              className="w-full flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md text-sm text-text-muted hover:bg-bg-muted hover:text-text transition-colors"
            >
              <SettingsIcon className="w-4 h-4 stroke-[1.6] shrink-0" />
              <span>Settings</span>
            </button>
          </div>
        )}

        <FolderNameDialog
          open={notebookDialogOpen}
          onOpenChange={setNotebookDialogOpen}
          onConfirm={handleCreateNotebook}
          title="New notebook"
          description="Create a notebook at the top level of this vault"
          confirmLabel="Create"
        />

        <FolderNameDialog
          open={renameTarget != null}
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null);
          }}
          onConfirm={handleRenameNotebook}
          title="Rename notebook"
          description="Enter a new name for this notebook"
          confirmLabel="Rename"
          defaultValue={renameTarget ? leafName(renameTarget.path) : ""}
        />

        <AlertDialog
          open={deleteTarget != null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete notebook?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `“${leafName(deleteTarget.path)}” and its ${deleteTarget.count} note${
                      deleteTarget.count === 1 ? "" : "s"
                    } will be permanently deleted. This cannot be undone.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={(event) => {
                  event.preventDefault();
                  void handleDeleteNotebook();
                }}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <DragOverlay>
        {dragPath && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-md shadow-lg text-sm text-text">
            <FolderIcon className="w-3.5 h-3.5 stroke-[1.6] opacity-50 shrink-0" />
            {leafName(dragPath)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
