/**
 * A tiny tweak panel, written here rather than pulled from npm.
 *
 * dat.gui and lil-gui would both do this job, but the brief for this lab is that effects ship
 * into playable ads where every kilobyte is budgeted — so the lab deliberately carries no UI
 * dependency at all. This is ~250 lines of DOM and gives what tuning actually needs: sliders with
 * typed overrides, paired min/max ranges, toggles, colours, buttons and live readouts.
 *
 * Controls are getter/setter bound rather than value-bound, so anything that changes config from
 * outside the panel (a preset switch, `reset()`) shows up after one `refresh()` with no plumbing.
 */

import "./panel.css";

type Getter<T> = () => T;
type Setter<T> = (value: T) => void;

export interface SliderOptions {
    min: number;
    max: number;
    step?: number;
}

/** One row of `Folder.list`. */
export interface ListItem {
    value: string;
    label: string;
    /** Second line, in muted type: what the entry is. */
    hint?: string;
    /** Heading the row is filed under. Items of one group must be adjacent in the array. */
    group?: string;
}

interface Binding {
    sync(): void;
}

/** Panel state that has to outlive `clear()`, since switching effect rebuilds every control. */
interface PanelState {
    listFilter: string;
}

export class Folder {
    readonly dom: HTMLDetailsElement;
    private readonly bindings: Binding[];
    private readonly state: PanelState;

    constructor(title: string, open: boolean, bindings: Binding[], state: PanelState) {
        this.bindings = bindings;
        this.state = state;
        this.dom = document.createElement("details");
        this.dom.className = "vl-folder";
        this.dom.open = open;
        const summary = document.createElement("summary");
        summary.textContent = title;
        this.dom.appendChild(summary);
    }

    private row(label: string | null): HTMLDivElement {
        const row = document.createElement("div");
        row.className = label === null ? "vl-row vl-wide" : "vl-row";
        if (label !== null) {
            const l = document.createElement("label");
            l.textContent = label;
            l.title = label;
            row.appendChild(l);
        }
        const ctl = document.createElement("div");
        ctl.className = "vl-ctl";
        row.appendChild(ctl);
        this.dom.appendChild(row);
        return ctl as HTMLDivElement;
    }

    toggle(label: string, get: Getter<boolean>, set: Setter<boolean>): this {
        const ctl = this.row(label);
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = get();
        input.addEventListener("change", () => set(input.checked));
        ctl.appendChild(input);
        this.bindings.push({ sync: () => (input.checked = get()) });
        return this;
    }

    /**
     * Slider plus a number box. The box accepts values beyond the slider's range — handy when a
     * parameter needs to be pushed past what the slider exposes for a one-off look test.
     */
    slider(label: string, opts: SliderOptions, get: Getter<number>, set: Setter<number>): this {
        const ctl = this.row(label);
        const step = opts.step ?? (opts.max - opts.min) / 200;

        const range = document.createElement("input");
        range.type = "range";
        range.min = String(opts.min);
        range.max = String(opts.max);
        range.step = String(step);

        const box = document.createElement("input");
        box.type = "text";
        box.className = "vl-num";
        box.inputMode = "decimal";

        const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
        const show = (v: number) => {
            range.value = String(v);
            box.value = v.toFixed(decimals);
        };

        range.addEventListener("input", () => {
            const v = parseFloat(range.value);
            set(v);
            box.value = v.toFixed(decimals);
        });
        box.addEventListener("change", () => {
            const v = parseFloat(box.value);
            if (Number.isFinite(v)) {
                set(v);
                show(get());
            } else {
                show(get());
            }
        });

        show(get());
        ctl.append(range, box);
        this.bindings.push({ sync: () => show(get()) });
        return this;
    }

    /**
     * A `[min, max]` pair on one row.
     *
     * Almost every parameter in this system is a range — lifetime, speed, size — and giving each
     * end its own labelled row would double the panel's height for no clarity. Dragging one
     * handle past the other pushes the other along rather than producing an inverted range.
     */
    range(label: string, opts: SliderOptions, get: Getter<[number, number]>, set: Setter<[number, number]>): this {
        const ctl = this.row(label);
        const step = opts.step ?? (opts.max - opts.min) / 200;
        const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;

        const lo = document.createElement("input");
        const hi = document.createElement("input");
        for (const el of [lo, hi]) {
            el.type = "range";
            el.min = String(opts.min);
            el.max = String(opts.max);
            el.step = String(step);
        }
        const readout = document.createElement("span");
        readout.className = "vl-readout";
        readout.style.cssText = "flex:none;width:72px;text-align:right";

        const show = () => {
            const [a, b] = get();
            lo.value = String(a);
            hi.value = String(b);
            readout.textContent = `${a.toFixed(decimals)}–${b.toFixed(decimals)}`;
        };

        lo.addEventListener("input", () => {
            const a = parseFloat(lo.value);
            const [, b] = get();
            set([a, Math.max(a, b)]);
            show();
        });
        hi.addEventListener("input", () => {
            const b = parseFloat(hi.value);
            const [a] = get();
            set([Math.min(a, b), b]);
            show();
        });

        show();
        ctl.append(lo, hi, readout);
        this.bindings.push({ sync: show });
        return this;
    }

    color(label: string, get: Getter<string>, set: Setter<string>): this {
        const ctl = this.row(label);
        const input = document.createElement("input");
        input.type = "color";
        input.value = normalizeHex(get());
        input.addEventListener("input", () => set(input.value));
        ctl.appendChild(input);
        this.bindings.push({ sync: () => (input.value = normalizeHex(get())) });
        return this;
    }

    /** Two swatches side by side, for the `[from, to]` colour pairs the effects sample between. */
    colorPair(label: string, get: Getter<[string, string]>, set: Setter<[string, string]>): this {
        const ctl = this.row(label);
        const a = document.createElement("input");
        const b = document.createElement("input");
        for (const el of [a, b]) el.type = "color";
        const show = () => {
            const [x, y] = get();
            a.value = normalizeHex(x);
            b.value = normalizeHex(y);
        };
        a.addEventListener("input", () => set([a.value, get()[1]]));
        b.addEventListener("input", () => set([get()[0], b.value]));
        show();
        ctl.append(a, b);
        this.bindings.push({ sync: show });
        return this;
    }

    select<T extends string>(label: string, options: readonly T[], get: Getter<T>, set: Setter<T>): this {
        const ctl = this.row(label);
        const el = document.createElement("select");
        for (const opt of options) {
            const o = document.createElement("option");
            o.value = opt;
            o.textContent = opt;
            el.appendChild(o);
        }
        el.value = get();
        el.addEventListener("change", () => set(el.value as T));
        ctl.appendChild(el);
        this.bindings.push({ sync: () => (el.value = get()) });
        return this;
    }

    /**
     * A single-choice list with a filter box, for a catalogue you browse rather than a setting
     * you set.
     *
     * A `select` collapses to the chosen entry, so finding anything means opening it and reading
     * fifteen one-line strings — which is exactly the case the effect registry is. This keeps
     * every entry on screen with its description under its name, grouped, and narrows as you
     * type. The filter text lives on the panel rather than here: choosing an effect rebuilds all
     * the controls, and a filter that cleared itself on every pick would be worse than none.
     */
    list(items: readonly ListItem[], get: Getter<string>, set: Setter<string>): this {
        const wrap = document.createElement("div");
        wrap.className = "vl-list";

        const search = document.createElement("input");
        search.type = "text";
        search.className = "vl-list-search";
        search.placeholder = "filter…";
        search.spellcheck = false;
        search.value = this.state.listFilter;

        const scroll = document.createElement("div");
        scroll.className = "vl-list-scroll";

        const rows = new Map<string, HTMLButtonElement>();

        const sync = () => {
            const current = get();
            for (const [value, btn] of rows) btn.classList.toggle("vl-on", value === current);
        };

        const render = () => {
            const terms = this.state.listFilter.toLowerCase().split(/\s+/).filter(Boolean);
            rows.clear();
            scroll.replaceChildren();
            let group: string | undefined;

            for (const item of items) {
                const haystack = `${item.label} ${item.hint ?? ""} ${item.group ?? ""} ${item.value}`.toLowerCase();
                if (!terms.every((t) => haystack.includes(t))) continue;

                if (item.group !== undefined && item.group !== group) {
                    group = item.group;
                    const head = document.createElement("div");
                    head.className = "vl-list-group";
                    head.textContent = item.group;
                    scroll.appendChild(head);
                }

                const btn = document.createElement("button");
                btn.className = "vl-item";
                btn.type = "button";
                const name = document.createElement("b");
                name.textContent = item.label;
                btn.appendChild(name);
                if (item.hint) {
                    const hint = document.createElement("small");
                    hint.textContent = item.hint;
                    btn.appendChild(hint);
                }
                btn.addEventListener("click", () => set(item.value));
                scroll.appendChild(btn);
                rows.set(item.value, btn);
            }

            if (rows.size === 0) {
                const empty = document.createElement("div");
                empty.className = "vl-list-empty";
                empty.textContent = "no match";
                scroll.appendChild(empty);
            }
            sync();
        };

        search.addEventListener("input", () => {
            this.state.listFilter = search.value;
            render();
        });

        render();
        wrap.append(search, scroll);
        this.dom.appendChild(wrap);
        this.bindings.push({ sync });
        return this;
    }

    /** One or more buttons sharing a row. */
    buttons(...items: Array<{ label: string; onClick: () => void; primary?: boolean }>): this {
        const ctl = this.row(null);
        for (const item of items) {
            const btn = document.createElement("button");
            btn.className = item.primary ? "vl-btn vl-primary" : "vl-btn";
            btn.textContent = item.label;
            btn.addEventListener("click", item.onClick);
            ctl.appendChild(btn);
        }
        return this;
    }

    /** A read-only value refreshed by `ControlPanel.tick()`. */
    readout(label: string, get: Getter<string>): this {
        const ctl = this.row(label);
        const span = document.createElement("span");
        span.className = "vl-readout";
        ctl.appendChild(span);
        const sync = () => (span.textContent = get());
        sync();
        this.bindings.push({ sync });
        return this;
    }

    note(text: string): this {
        const p = document.createElement("p");
        p.className = "vl-note";
        p.textContent = text;
        this.dom.appendChild(p);
        return this;
    }
}

export class ControlPanel {
    readonly dom: HTMLDivElement;

    private readonly body: HTMLDivElement;
    private readonly bindings: Binding[] = [];
    private readonly state: PanelState = { listFilter: "" };

    constructor(title: string, subtitle = "") {
        this.dom = document.createElement("div");
        this.dom.className = "vl-panel";

        const head = document.createElement("div");
        head.className = "vl-head";
        const t = document.createElement("span");
        t.className = "vl-title";
        t.textContent = title;
        const s = document.createElement("span");
        s.className = "vl-sub";
        s.textContent = subtitle;
        head.append(t, s);

        this.body = document.createElement("div");
        this.body.className = "vl-body";

        this.dom.append(head, this.body);
    }

    folder(title: string, open = true): Folder {
        const f = new Folder(title, open, this.bindings, this.state);
        this.body.appendChild(f.dom);
        return f;
    }

    /** Empties the panel, for when the selected effect changes. */
    clear(): void {
        this.body.replaceChildren();
        this.bindings.length = 0;
    }

    /** Pulls every control's value from its getter. Call after config changes from outside. */
    refresh(): void {
        for (const b of this.bindings) b.sync();
    }

    get visible(): boolean {
        return !this.dom.hidden;
    }

    set visible(v: boolean) {
        this.dom.hidden = !v;
    }
}

/** `<input type="color">` only accepts `#rrggbb`; expand shorthand and reject anything else. */
function normalizeHex(hex: string): string {
    if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
        return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return "#ffffff";
}
