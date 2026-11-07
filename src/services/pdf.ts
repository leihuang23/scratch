import type { Editor } from "@tiptap/react";

export async function downloadPdf(editor: Editor, _noteTitle: string): Promise<void> {
  if (!editor) throw new Error("Editor not available");
  window.print();
}

export async function downloadMarkdown(markdown: string, noteTitle: string): Promise<boolean> {
  const name = `${sanitizeFilename(noteTitle)}.md`;
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "note";
}
