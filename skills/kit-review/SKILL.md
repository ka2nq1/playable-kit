---
name: kit-review
description: Triage and work through playable-kit's INBOX.md — fix kit bugs, add missing features, turn lessons into rules, update skills. Use when the user says /kit-review or asks to improve/maintain the kit.
---

# Kit maintenance pass

Work in `~/projects/playable-kit`. Read its `CLAUDE.md` first; an entry about `vfx-lab/` or
`path-editor/` also follows that folder's own `CLAUDE.md`.

1. Read `INBOX.md → ## Open`. Group duplicates. For each, propose: **fix now** (what file, how,
   rough size), **later**, or **drop** (with why). One AskUserQuestion round (multiSelect) to pick.
2. Fix the picked ones. Kit rule: anything game-specific goes into a config hook, never into a kit
   file. Lessons about how Claude worked go into `rules/` or the skill they concern — short, with
   the *why*.
3. Keep `editor/INTEGRATION.md`, `vfx/ADAPTER.md` and the skills in step with what changed —
   they are how the next playable gets it right. A `path-editor/` change reaches playables only
   after `npm run vendor` (rebuilds and re-vendors into `editor/files/`).
4. `CHANGELOG.md` → `## Unreleased`, one line per change, flag **breaking** ones with what a
   playable must change. Move handled entries to `## Done` with today's date.
5. Commit; ask once before `git push`. Mention which playables would benefit from `/kit-pull`.
