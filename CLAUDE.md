# Scratch - Development Guide

## Project Overview

Scratch is a local markdown note-taking app. The UI is a React/TypeScript/Tailwind PWA with a TipTap editor. A loopback Node server owns the notes folder, search, git, and file watching.

## Commands

```bash
npm run dev          # API on 127.0.0.1:4173 plus Vite on localhost:1420
npm run build        # Typecheck and build the frontend into dist/
npm start            # Serve dist/ and the API from the Node server
```

`npm run dev:pwa` and `npm run server` are the same two entry points.

## CI

Runs on every push to `main` and on PRs. Validates `npm ci` and `npm run build` (`tsc` + Vite) on an Ubuntu runner.

## Key Patterns

- Frontend calls go through `invoke()` in `src/platform/index.ts`. That posts to `/api/command`. The Node handlers live in `server/index.mjs`.
- File changes arrive on `GET /api/events` (`file-change`, `select-note`).
- `NotesContext` uses a dual context pattern (data/actions separated) for performance.
- App config is `~/.scratch-server/config.json` (`SCRATCH_SERVER_HOME` overrides the directory). Per-folder settings stay at `{NOTES_FOLDER}/.scratch/settings.json`.
- The browser session cookie is `scratch_token`, set by `GET /api/session`. Vite injects `x-scratch-token` when it proxies `/api`.

## Coding Conventions

- Clean, minimal code with low technical debt
- Proper React patterns (contexts, hooks, memoization)
- Type-safe with TypeScript throughout
- No commented-out code or TODOs in production code
- Use `React.memo` for expensive list-item components
- Use `useCallback`/`useMemo` for performance-critical paths
- Debounce user-triggered operations (auto-save 300ms, search 150ms, file watcher 500ms, git status 1000ms)
- All operations should be non-blocking (async)
- Error handling with user-friendly messages

## Releasing

1. Bump the version in `package.json`
2. Commit to `main`, then tag and push: `git tag v0.5.0 && git push origin v0.5.0`
3. The release workflow builds `dist/` and uploads a draft GitHub release
4. Review, edit notes, and publish
