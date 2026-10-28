#!/usr/bin/env bash
# Links the kit's skills and agents into ~/.claude, so every project sees them and an edit in the
# kit is live everywhere at once. Safe to re-run; never replaces a real (non-link) file.
set -euo pipefail

KIT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.claude/skills" "$HOME/.claude/agents"

link() {
    local src="$1" dest="$2"
    if [ -L "$dest" ]; then
        ln -sfn "$src" "$dest"
    elif [ -e "$dest" ]; then
        echo "skip: $dest exists and is not a link"
        return
    else
        ln -s "$src" "$dest"
    fi
    echo "linked: $dest"
}

for skill in "$KIT"/skills/*/; do
    link "${skill%/}" "$HOME/.claude/skills/$(basename "$skill")"
done
for agent in "$KIT"/agents/*.md; do
    link "$agent" "$HOME/.claude/agents/$(basename "$agent")"
done
