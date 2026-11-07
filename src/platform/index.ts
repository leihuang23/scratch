type Handler = (event: { payload: unknown }) => void;
type Unlisten = () => void;

const listeners = new Map<string, Set<Handler>>();
let source: EventSource | null = null;
let sessionReady: Promise<void> | null = null;

const SESSION_TIMEOUT_MS = 8_000;
const DEFAULT_TIMEOUT_MS = 20_000;
const LONG_TIMEOUT_MS = 180_000;

// Commands that legitimately block for a long time (native dialogs, git network).
const LONG_RUNNING_COMMANDS: Record<string, true> = {
  open_folder_dialog: true,
  open_image_dialog: true,
  git_init_repo: true,
  git_commit: true,
  git_push: true,
  git_push_with_upstream: true,
  git_fetch: true,
  git_pull: true,
  git_add_remote: true,
  git_set_remote_url: true,
  git_remove_remote: true,
};

export function ensureSession(): Promise<void> {
  if (sessionReady) return sessionReady;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
  sessionReady = fetch("/api/session", {
    credentials: "same-origin",
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok) throw new Error("Scratch server is not running");
    })
    .catch((err: unknown) => {
      // Allow later calls to retry once the server is back.
      sessionReady = null;
      if (controller.signal.aborted) {
        throw new Error("Scratch server is not responding");
      }
      throw err;
    })
    .finally(() => window.clearTimeout(timer));
  return sessionReady;
}

function ensureEvents() {
  if (source) return;
  source = new EventSource("/api/events");
  source.addEventListener("file-change", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    for (const handler of listeners.get("file-change") || []) {
      handler({ payload });
    }
  });
  source.addEventListener("select-note", (event) => {
    const payload = JSON.parse((event as MessageEvent).data);
    for (const handler of listeners.get("select-note") || []) {
      handler({ payload });
    }
  });
}

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  options?: { timeoutMs?: number },
): Promise<T> {
  if (cmd === "copy_to_clipboard") {
    await navigator.clipboard.writeText(String(args?.text ?? ""));
    return undefined as T;
  }
  if (cmd === "open_url_safe") {
    const url = String(args?.url ?? "");
    if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs can be opened");
    window.open(url, "_blank", "noopener,noreferrer");
    return undefined as T;
  }
  if (cmd === "set_title_bar_theme") return undefined as T;
  await ensureSession();
  const timeoutMs =
    options?.timeoutMs ??
    (LONG_RUNNING_COMMANDS[cmd] ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/command", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd, args: args ?? {} }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) {
      throw new Error(body.error || `Command failed: ${cmd}`);
    }
    return body.result as T;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error("Scratch server did not respond");
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
}

export function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<Unlisten> {
  return ensureSession().then(() => {
    ensureEvents();
    const wrapped: Handler = (ev) => handler(ev as { payload: T });
    const set = listeners.get(event) || new Set();
    set.add(wrapped);
    listeners.set(event, set);
    return () => {
      set.delete(wrapped);
    };
  });
}

export async function resolveAssetUrl(_notesFolder: string, relativePath: string): Promise<string> {
  return `/api/asset?rel=${encodeURIComponent(relativePath.replace(/^\/+/, ""))}`;
}
