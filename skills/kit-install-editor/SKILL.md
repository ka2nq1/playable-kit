---
name: kit-install-editor
description: Install the playable-kit editor (V mode — paths, markers, map VFX placement and tuning, Tune tab, pop-out window) into the current 3D playable from ~/projects/playable-kit. Use when the user asks to add/install/set up the editor or the kit in a playable.
---

# Install the playable-kit editor

Kit: `~/projects/playable-kit` (github.com/ka2nq1/playable-kit). The procedure is
`~/projects/playable-kit/editor/INTEGRATION.md` — read it first, follow its steps in order.

The user only wants to make decisions, not do the work. So:

1. Confirm it is a 3D `@hitplay/playable_template` project (package.json, three in deps). 2D → stop and say so.
2. Run `node ~/projects/playable-kit/scripts/kit.mjs install-editor <playable> --dry-run`, show the
   summary. Anything *skipped* is a decision → ask with AskUserQuestion, offering the options
   INTEGRATION.md lists for it. Then run it for real.
3. Steps 2–6 of INTEGRATION.md. Find the project's own owners of scene, renderer, camera, pause,
   input and update loop yourself (grep `class ThreeC`, `CameraC`, `TimeC`, `setPaused`,
   `UpdateController`) — read only the files you need. Fill every `TODO(kit)` in
   `dev/editor.config.ts` and remove the marker.
4. A project with its own editor already (step 7): do not touch it in the same pass. Ask whether to
   migrate it now, later, or keep both with different keys.
5. Whenever something in the kit does not fit (a missing hook, an assumption that breaks): keep the
   project-side workaround minimal, and record it with the `kit-note` procedure (append to
   `~/projects/playable-kit/INBOX.md`) — the kit gets fixed, not every playable.

Don't run the dev server, build or typecheck unless the user agrees (one-line ask at the end).

Finish with: what was copied, what was edited in the project (file list), the open decisions if
any, and "press V under npm start".
