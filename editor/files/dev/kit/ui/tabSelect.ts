/**
 * The panel's tabs as one dropdown.
 *
 * three-path-editor lays its tab strip out as a flex row of equal buttons — right for the two or
 * three tabs the package expects, broken at ten: the labels outgrow their buttons and the strip
 * scrolls sideways. A dropdown costs one line per tab instead of another column.
 *
 * Nothing here reaches into the package: the labels are read back off the strip it rendered, and the
 * switch goes through its own `selectTab`. The strip stays in the DOM, hidden by `embed.css`,
 * because `addTab` rewrites it and would undo anything done to it here.
 */

import type { PathEditorPanel } from "../../vendor/three-path-editor/editor.js";

/** Call once, after every `addTab`. Returns the row, so other controls can join it. */
export function useTabDropdown(panel: PathEditorPanel): HTMLElement | null {
    const strip = panel.element.querySelector<HTMLElement>(".tpe-tabs");
    if (!strip) return null;

    const labels = [...strip.querySelectorAll("button")].map((b) => b.textContent ?? "");

    panel.element.classList.add("kit-tabs-as-select");

    const row = document.createElement("div");
    row.className = "kit-tabselect";

    const caption = document.createElement("span");
    caption.textContent = "Tab";

    const select = document.createElement("select");
    labels.forEach((label, i) => {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = label;
        select.appendChild(option);
    });
    select.value = String(panel.activeTab);
    select.addEventListener("change", () => panel.selectTab(Number(select.value)));

    row.append(caption, select);
    strip.insertAdjacentElement("afterend", row);
    return row;
}
