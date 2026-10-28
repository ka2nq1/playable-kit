---
name: kit-note
description: Record a bug, missing feature, friction or lesson about playable-kit (editor, skills, rules, vfx adapters) into the kit's INBOX.md without interrupting the current work. Use when the user says /kit-note, "запиши в кіт", or when a kit file needed a workaround in a playable.
model: haiku
---

# Note for the kit

Append one entry to `~/projects/playable-kit/INBOX.md` under `## Open`, newest last:

```
- [YYYY-MM-DD] <playable folder name> · <area: editor|vfx|skill:<name>|rules|scripts> — <what is wrong or missing, in one or two sentences, in Ukrainian>. <Workaround in the playable, if any: file path>.
```

Use the user's words when they gave them. If the note is about *how Claude worked* (a mistake to
not repeat), area is `rules`.

Do not fix anything, do not open other files, do not commit. Reply with the single line you added.
