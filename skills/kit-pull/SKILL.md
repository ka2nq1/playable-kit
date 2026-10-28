---
name: kit-pull
description: Update the current playable's copied kit/vfx-lab files to the latest playable-kit and vfx-lab, keeping local and deliberate differences. Use when the user says /kit-pull, "онови кіт", or before starting new work in an older playable.
---

# Kit / vfx-lab → playable

1. `git -C ~/projects/playable-kit pull --ff-only` and the same for `~/projects/vfx-lab` (skip
   silently if offline or not fast-forward; say so).
2. `node ~/projects/playable-kit/scripts/kit.mjs pull <playable> --dry-run` → show what would
   update; then run it for real. New kit files (added since install) arrive too.
3. `conflict` files: show both sides' change briefly, propose a merge, ask per file (keep mine /
   take kit / merged version). After writing the merge: `kit.mjs resolve <playable> <file>`.
4. Read `~/projects/playable-kit/CHANGELOG.md` entries newer than the playable's recorded kit commit
   (`.kit.json` → `sources.kit.commit`) for steps that need project changes (a new required config
   field, a renamed hook) and apply them to `dev/editor.config.ts` / the kit host.

Finish with: updated files, merged conflicts, project-side changes made. No builds unless asked.
