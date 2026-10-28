---
name: kit-pull
description: Update the current playable's copied kit files (editor, vfx-lab effects, vendored path editor) to the latest playable-kit, keeping local and deliberate differences. Use when the user says /kit-pull, "онови кіт", or before starting new work in an older playable.
---

# playable-kit → playable

The kit (`~/projects/playable-kit`) is the single source: editor, `vfx-lab/` effects and the path
editor all come from it.

1. `git -C ~/projects/playable-kit pull --ff-only` (if offline or not fast-forward, say so and go on
   with the local kit).
2. `node ~/projects/playable-kit/scripts/kit.mjs pull <playable> --dry-run` → show what would update;
   then run it for real. Kit files added since the install arrive too.
3. `conflict` files: show both sides' change briefly, propose a merge, ask per file (keep mine /
   take kit / merged). After writing the merge: `kit.mjs resolve <playable> <file>`.
4. Read `CHANGELOG.md` entries newer than the playable's kit commit (`.kit.json` → `kit.commit`) for
   steps that need project changes (a new config field, a renamed hook) and apply them to
   `dev/editor.config.ts` / the kit host call.

Finish with: updated files, merged conflicts, project-side changes. No builds unless asked.
