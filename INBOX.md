# INBOX

Проблеми, незручності й уроки, знайдені під час роботи над плеєблами. Пише `/kit-note`, розбирає `/kit-review`.

## Open

- [2026-10-28] playable-kit · vfx — у `vfx/adapters/` поки тільки еталонний `waterfog`. Решта адаптерів (sky, water/ice/lava surface, splash, ripples, fire, embers, smoke, heat, fireflies, snowstorm, bubbles, cracks, lava impact/geyser, sun glare, whale breach) лежить у Basketball Stars 1v1 (`src/controllers/VFX/*C.ts`, `dev/panels/*`) і прив'язана до його `ThreeC`/`TimeC`/`MapC`. Переносити в кіт по одному, коли ефект знадобиться в новому плеєблі.
- [2026-10-28] playable-kit · editor — Basketball і Sniper Choice-Driven ще на своїх старих едіторах; перевести їх на кіт (INTEGRATION.md, крок 7), коли буде час, — це і перевірка кіту.
- [2026-10-28] playable-kit · editor — вікно-попап і пригнічення перезавантаження після Save ще не перевірені в реальному плеєблі.

## Done

- [2026-10-28] playable-kit · scripts — три окремі репозиторії (kit, vfx-lab, three-js-path-editor) об'єднано в один.
