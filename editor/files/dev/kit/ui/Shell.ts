import "./shell.css";

/**
 * The editor's frame: a menu bar of sections on top, the active section below, a status line at the
 * bottom. Built for its own window first — that is where the editor normally lives — and docked to
 * the right edge of the game as the fallback, with a handle to drag it wider.
 *
 * Sections are plain elements; what goes in them is the editor's business (`EditorMode`).
 */

const SECTION_KEY = "playable-kit:editor-section";
const WIDTH_KEY = "playable-kit:editor-dock-width";
const EDITOR_UI_ATTRIBUTE = "data-path-editor-ui";

interface Section {
    id: string;
    button: HTMLButtonElement;
    body: HTMLElement;
    onShow?(): void;
}

function readStorage(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Not remembered; nothing else depends on it.
    }
}

export class Shell {
    readonly root: HTMLDivElement;
    /** Right side of the menu bar, for the window toggle and such. */
    readonly actions: HTMLDivElement;
    private readonly nav: HTMLElement;
    private readonly content: HTMLDivElement;
    private readonly status: HTMLDivElement;
    private readonly sections: Section[] = [];
    private current: Section | null = null;
    private statusTimer = 0;

    constructor(title: string, notice?: string) {
        this.root = document.createElement("div");
        this.root.className = "kit-shell kit-docked";
        // The path editor's `isolateUi` hides every page element without this attribute.
        this.root.setAttribute(EDITOR_UI_ATTRIBUTE, "");
        // Keys typed into the editor are not game or editor shortcuts — except the ones forwarded on purpose.
        for (const type of ["pointerdown", "wheel"] as const) this.root.addEventListener(type, (e) => e.stopPropagation());

        const handle = document.createElement("div");
        handle.className = "kit-dock-handle";
        this.wireHandle(handle);

        const bar = document.createElement("header");
        bar.className = "kit-bar";

        const brand = document.createElement("div");
        brand.className = "kit-brand";
        brand.innerHTML = `<span class="kit-logo"></span>`;
        const name = document.createElement("span");
        name.textContent = title;
        brand.appendChild(name);

        this.nav = document.createElement("nav");
        this.nav.className = "kit-nav";

        this.actions = document.createElement("div");
        this.actions.className = "kit-actions";
        if (notice) {
            const chip = document.createElement("span");
            chip.className = "kit-chip";
            chip.textContent = "Demo";
            chip.title = notice;
            this.actions.appendChild(chip);
        }

        bar.append(brand, this.nav, this.actions);

        this.content = document.createElement("div");
        this.content.className = "kit-content";

        this.status = document.createElement("div");
        this.status.className = "kit-status";
        this.status.textContent = notice ?? "V closes the editor · Ctrl+Z undoes a point edit";

        this.root.append(handle, bar, this.content, this.status);

        const width = Number(readStorage(WIDTH_KEY));
        if (width > 0) this.root.style.setProperty("--kit-dock-width", `${width}px`);
    }

    /** Adds a menu entry and returns the element its content goes into. */
    addSection(id: string, label: string, onShow?: () => void): HTMLElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "kit-nav-item";
        button.textContent = label;
        button.addEventListener("click", () => this.show(id));
        this.nav.appendChild(button);

        const body = document.createElement("section");
        body.className = "kit-section";
        body.dataset.section = id;
        body.hidden = true;
        this.content.appendChild(body);

        this.sections.push({ id, button, body, onShow });
        return body;
    }

    /** A small count next to a menu entry, e.g. how many effects are placed. */
    setBadge(id: string, text: string): void {
        const section = this.sections.find((s) => s.id === id);
        if (!section) return;
        let badge = section.button.querySelector<HTMLElement>(".kit-badge");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "kit-badge";
            section.button.appendChild(badge);
        }
        badge.textContent = text;
        badge.hidden = !text;
    }

    show(id: string): void {
        const section = this.sections.find((s) => s.id === id) ?? this.sections[0];
        if (!section) return;
        for (const s of this.sections) {
            s.body.hidden = s !== section;
            s.button.classList.toggle("kit-active", s === section);
        }
        this.current = section;
        writeStorage(SECTION_KEY, section.id);
        section.onShow?.();
    }

    /** The section the editor was last left on. */
    restore(): void {
        this.show(readStorage(SECTION_KEY) ?? this.sections[0]?.id ?? "");
    }

    get active(): string {
        return this.current?.id ?? "";
    }

    setStatus(text: string, kind: "ok" | "error" | "info" = "info"): void {
        this.status.textContent = text;
        this.status.dataset.kind = kind;
        clearTimeout(this.statusTimer);
        if (kind !== "error") this.statusTimer = window.setTimeout(() => delete this.status.dataset.kind, 2500);
    }

    setVisible(visible: boolean): void {
        this.root.hidden = !visible;
    }

    /** Docked: a column on the right edge of the game. Popped out: the whole window. */
    setDocked(docked: boolean): void {
        this.root.classList.toggle("kit-docked", docked);
    }

    private wireHandle(handle: HTMLElement): void {
        handle.addEventListener("pointerdown", (down) => {
            down.preventDefault();
            const startX = down.clientX;
            const startWidth = this.root.getBoundingClientRect().width;
            const move = (e: PointerEvent) => {
                const width = Math.min(Math.max(startWidth + (startX - e.clientX), 320), window.innerWidth * 0.8);
                this.root.style.setProperty("--kit-dock-width", `${width}px`);
            };
            const up = () => {
                window.removeEventListener("pointermove", move);
                writeStorage(WIDTH_KEY, String(Math.round(this.root.getBoundingClientRect().width)));
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up, { once: true });
        });
    }
}
