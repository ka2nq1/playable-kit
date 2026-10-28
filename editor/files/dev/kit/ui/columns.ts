/**
 * A control panel's folders in side-by-side columns that never reshuffle.
 *
 * CSS multi-column layout rebalances on every height change, so opening a folder threw it (and its
 * neighbours) into another column under the pointer. Here each folder is dealt into a fixed column
 * once, in order; opening it only makes its own column longer. The deal is redone only when the
 * number of columns that fit changes — a window resize — and moving the elements keeps their state.
 */

const MIN_COLUMN = 340;
const GAP = 14;
const COLUMNED = "data-kit-columns";
const watched = new WeakSet<Window>();

export function columnize(body: HTMLElement): void {
    body.setAttribute(COLUMNED, "");
    layout(body);
    const win = body.ownerDocument.defaultView;
    if (win && !watched.has(win)) {
        watched.add(win);
        win.addEventListener("resize", () => {
            for (const el of win.document.querySelectorAll<HTMLElement>(`[${COLUMNED}]`)) layout(el);
        });
    }
}

/** Re-deals every columned panel under `root` — after it moved between the game page and the window. */
export function relayout(root: HTMLElement): void {
    for (const el of root.querySelectorAll<HTMLElement>(`[${COLUMNED}]`)) layout(el);
}

function layout(body: HTMLElement): void {
    // A panel in a hidden section has no width of its own yet; the content area it will fill does.
    const width = body.clientWidth || body.closest<HTMLElement>(".kit-content")?.clientWidth || 0;
    if (!width) return;
    const count = Math.max(1, Math.floor((width + GAP) / (MIN_COLUMN + GAP)));
    if (body.dataset.count === String(count)) return;
    body.dataset.count = String(count);

    // Folders in their original order, wherever the previous deal put them.
    const folders = [...body.querySelectorAll<HTMLElement>(":scope > .vl-folder, :scope > .kit-col > .vl-folder")];
    const columns = Array.from({ length: count }, () => {
        const col = body.ownerDocument.createElement("div");
        col.className = "kit-col";
        return col;
    });
    folders.forEach((folder, i) => columns[i % count].appendChild(folder));
    body.replaceChildren(...columns);
}
