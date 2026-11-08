export const SEARCH_HIGHLIGHT_EVENT = "highlight-search-matches";
export const SEARCH_HIGHLIGHT_CANCEL_EVENT = "cancel-search-highlight";

export interface SearchHighlightDetail {
  noteId: string;
  query: string;
}

/**
 * Ask the editor to highlight matches for a search query once the note is open.
 * Used when a note is opened from a search result.
 */
export function requestSearchHighlight(noteId: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;
  window.dispatchEvent(
    new CustomEvent<SearchHighlightDetail>(SEARCH_HIGHLIGHT_EVENT, {
      detail: { noteId, query: trimmed },
    }),
  );
}

/** Drop any highlight request that has not been applied yet. */
export function cancelSearchHighlight() {
  window.dispatchEvent(new Event(SEARCH_HIGHLIGHT_CANCEL_EVENT));
}
