# playable-kit

Інструменти, правила і скіли Claude Code для створення 3D-плеєблів на `@hitplay/playable_template`.
Нічого не ставиться як пакет: файли копіюються в плеєбл, а `.kit.json` у плеєблі пам'ятає, звідки
кожен файл і яким він був у момент копіювання. Тому правки ходять в обидва боки.

## Склад

| Шлях | Що це |
| --- | --- |
| `editor/` | едітор (V): шляхи, маркери, розміщення й налаштування VFX, Tune для JSON-конфігів, окреме вікно. Як ставити — [editor/INTEGRATION.md](editor/INTEGRATION.md) |
| `vfx/` | як ефект із [vfx-lab](https://github.com/ka2nq1/vfx-lab) стає ефектом плеєбла — [vfx/ADAPTER.md](vfx/ADAPTER.md), еталонний адаптер `waterfog`, стартові пресети `defaults/` |
| `skills/` | скіли Claude Code (лінкуються в `~/.claude/skills`) |
| `agents/` | `scout` (Haiku: пошук), `coder` (Sonnet: механічні правки за планом) |
| `rules/playable.md` | спільні правила для всіх плеєблів |
| `scripts/kit.mjs` | копіювання з трекінгом: `install-editor`, `copy`, `status`, `pull`, `push`, `resolve`, `diverge` |
| `INBOX.md` | баги та незручності, знайдені під час роботи над плеєблами |

## Встановлення на машину

```
git clone https://github.com/ka2nq1/playable-kit ~/projects/playable-kit
~/projects/playable-kit/scripts/link.sh
```

vfx-lab і three-js-path-editor очікуються поруч: `~/projects/vfx-lab`, `~/projects/three-js-path-editor`.

## Скіли

| Скіл | Коли |
| --- | --- |
| `/kit-install-editor` | поставити едітор у плеєбл |
| `/vfx-new <опис>` | новий ефект: vfx-lab → плеєбл, одразу в едіторі |
| `/kit-note <що не так>` | записати проблему кіту, не перериваючи роботу |
| `/kit-push` | перенести виправлення з плеєбла в кіт / vfx-lab |
| `/kit-pull` | оновити плеєбл до свіжого кіту / vfx-lab |
| `/kit-review` | розібрати INBOX і покращити кіт |

## Цикл покращення

плеєбл → помітив проблему → `/kit-note` → … → `/kit-push` (якщо виправив у плеєблі) →
`/kit-review` (раз на якийсь час) → `/kit-pull` в інших плеєблах.

## Плани

Пайплайн-скіли по етапах (`/playable-intake`, `/artist-brief`, `/size-audit`, …), перенесення
решти VFX-адаптерів Basketball у `vfx/adapters/`, окремий едітор для 2D.
