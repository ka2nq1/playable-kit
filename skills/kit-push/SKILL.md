---
name: kit-push
description: Take fixes and improvements made in the current playable's copied kit/vfx-lab files back into playable-kit or vfx-lab. Use when the user says /kit-push, "перенеси в кіт", or at the end of a playable when its copies have local changes.
---

# Playable → kit / vfx-lab

1. `node ~/projects/playable-kit/scripts/kit.mjs status <playable>`.
2. For every `local` file: show a short `diff` against its source (`source:from` in `.kit.json`) and
   classify it yourself — **generic** (a bug fix or feature every playable wants) or **project**
   (only this game). Present the list with your recommendation and ask once (AskUserQuestion,
   multiSelect) which to push.
3. Generic → `kit.mjs push <playable> <files...>`. A change that is half generic, half project:
   push only the generic half by editing the source by hand, then `kit.mjs resolve` the file.
4. Project-only → `kit.mjs diverge <playable> <file> <reason>` so it stops showing up.
5. In the kit: add a line to `CHANGELOG.md` under `## Unreleased`; if an INBOX entry is now solved,
   move it to `## Done` with the date. Commit in the source repo (kit or vfx-lab) with a short
   message, then ask once before `git push`.

`conflict` files: never push. Merge by hand with the user's choice per hunk, then `resolve`.
