# playable-kit

Усе для створення 3D-плеєблів на `@hitplay/playable_template` в одному репозиторії: едітор, лаба
ефектів, path-editor, скіли й правила Claude Code. Нічого не ставиться як пакет: файли копіюються в плеєбл, а `.kit.json` у плеєблі пам'ятає, звідки
кожен файл і яким він був у момент копіювання. Тому правки ходять в обидва боки.

## Склад

| Шлях | Що це |
| --- | --- |
| `editor/` | едітор (V): шляхи, маркери, розміщення й налаштування VFX, Tune для JSON-конфігів, окреме вікно. Як ставити — [editor/INTEGRATION.md](editor/INTEGRATION.md) |
| `vfx-lab/` | лаба ефектів: пишемо й налаштовуємо ефект, `vfx-lab/src/vfx/` копіюється в плеєбл (`npm run lab`) |
| `path-editor/` | вихідний код three-path-editor: тести, демо, збірка (`npm run vendor` оновлює копію в едіторі) |
| `vfx/` | як ефект із лаби стає ефектом плеєбла — [vfx/ADAPTER.md](vfx/ADAPTER.md), еталонний адаптер `waterfog`, стартові пресети `defaults/` |
| `skills/` | скіли Claude Code (лінкуються в `~/.claude/skills`) |
| `agents/` | `scout` (Haiku: пошук), `coder` (Sonnet: механічні правки за планом) |
| `rules/playable.md` | спільні правила для всіх плеєблів |
| `scripts/kit.mjs` | копіювання з трекінгом: `install-editor`, `copy`, `status`, `pull`, `push`, `resolve`, `diverge` |
| `INBOX.md` | баги та незручності, знайдені під час роботи над плеєблами |

## Встановлення на машину

```
git clone https://github.com/ka2nq1/playable-kit ~/projects/playable-kit
cd ~/projects/playable-kit && npm run setup     # залежності лаби й path-editor + лінки скілів
```

Оновити все разом: `git pull`. Команди з кореня: `npm run lab` (лаба на :5188),
`npm run path-editor:test`, `npm run path-editor:demo`, `npm run vendor`.

## Скіли

| Скіл | Коли |
| --- | --- |
| `/kit-install-editor` | поставити едітор у плеєбл |
| `/vfx-new <опис>` | новий ефект: лаба кіту → плеєбл, одразу в едіторі |
| `/kit-note <що не так>` | записати проблему кіту, не перериваючи роботу |
| `/kit-push` | перенести виправлення з плеєбла в кіт |
| `/kit-pull` | оновити плеєбл до свіжого кіту |
| `/kit-review` | розібрати INBOX і покращити кіт |
| `/daily-report [дата]` | щоденний звіт про зроблене з комітів і незакомічених змін |

## Цикл покращення

плеєбл → помітив проблему → `/kit-note` → … → `/kit-push` (якщо виправив у плеєблі) →
`/kit-review` (раз на якийсь час) → `/kit-pull` в інших плеєблах.

## Плани

Пайплайн-скіли по етапах (`/playable-intake`, `/artist-brief`, `/size-audit`, …), перенесення
решти VFX-адаптерів Basketball у `vfx/adapters/`, окремий едітор для 2D.
