import type { ControlPanel, Folder } from "./ControlPanel";

/**
 * Controls built from a plain JSON object, for configs nobody wants to write a panel for.
 *
 * Numbers become sliders, booleans toggles, `#rrggbb` strings colour pickers, `[x, y, z]` three
 * sliders, nested objects folders of their own. A schema, keyed by dotted path (`"ball.speed"`),
 * fixes what a guess gets wrong: a slider's range, a string's options, a field to hide.
 *
 * Every control writes straight into `target`, so the game reading that object sees the change in
 * the next frame — the same live-object rule as the effect panels.
 */

export interface FieldSchema {
    min?: number;
    max?: number;
    step?: number;
    /** A string field picked from a list. */
    options?: readonly string[];
    label?: string;
    hidden?: boolean;
}

export type AutoSchema = Readonly<Record<string, FieldSchema>>;

export interface AutoPanelOptions {
    schema?: AutoSchema;
    /** Called after every change, e.g. to re-apply a config the game copies once. */
    onChange?(path: string): void;
    open?: boolean;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const AXES = ["x", "y", "z"];

/** A slider track around the value it opens with; the number box still takes anything. */
function guessRange(value: number): { min: number; max: number; step: number } {
    const magnitude = Math.abs(value);
    const max = magnitude === 0 ? 1 : magnitude <= 1 ? 1 : Math.ceil(magnitude * 3);
    const min = value < 0 ? -max : 0;
    const step = Number.isInteger(value) && magnitude >= 2 ? 1 : max <= 1 ? 0.01 : max <= 10 ? 0.05 : 0.1;
    return { min, max, step };
}

function isNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.length > 0 && value.every((n) => typeof n === "number");
}

export function buildAutoPanel(panel: ControlPanel, title: string, target: Record<string, unknown>, options: AutoPanelOptions = {}): Folder {
    const schema = options.schema ?? {};
    const changed = (path: string) => options.onChange?.(path);

    const walk = (folder: Folder, object: Record<string, unknown>, prefix: string, folderTitle: string) => {
        const nested: Array<[string, Record<string, unknown>]> = [];

        for (const key of Object.keys(object)) {
            const path = prefix ? `${prefix}.${key}` : key;
            const field = schema[path] ?? {};
            if (field.hidden) continue;
            const label = field.label ?? key;
            const value = object[key];

            if (typeof value === "number") {
                const guess = guessRange(value);
                const range = { min: field.min ?? guess.min, max: field.max ?? guess.max, step: field.step ?? guess.step };
                folder.slider(label, range, () => object[key] as number, (v) => {
                    object[key] = v;
                    changed(path);
                });
            } else if (typeof value === "boolean") {
                folder.toggle(label, () => object[key] as boolean, (v) => {
                    object[key] = v;
                    changed(path);
                });
            } else if (typeof value === "string" && field.options) {
                folder.select(label, field.options, () => object[key] as string, (v) => {
                    object[key] = v;
                    changed(path);
                });
            } else if (typeof value === "string" && HEX.test(value)) {
                folder.color(label, () => object[key] as string, (v) => {
                    object[key] = v;
                    changed(path);
                });
            } else if (isNumberArray(value) && value.length === 2 && value[0] <= value[1]) {
                // The lab's configs are mostly `[min, max]` ranges: one control that keeps them ordered.
                const pair = value;
                const guess = guessRange(Math.max(Math.abs(pair[0]), Math.abs(pair[1])) * (pair[0] < 0 ? -1 : 1));
                const range = { min: field.min ?? Math.min(guess.min, pair[0]), max: field.max ?? guess.max, step: field.step ?? guess.step };
                folder.rangeRows(label, range, () => [pair[0], pair[1]], (v) => {
                    pair[0] = v[0];
                    pair[1] = v[1];
                    changed(path);
                });
            } else if (Array.isArray(value) && value.length > 0 && value.every((c) => typeof c === "string" && HEX.test(c))) {
                const colors = value as string[];
                colors.forEach((_, i) =>
                    folder.color(`${label} ${i + 1}`, () => colors[i], (v) => {
                        colors[i] = v;
                        changed(path);
                    }),
                );
            } else if (isNumberArray(value)) {
                const array = value;
                array.forEach((n, i) => {
                    const guess = guessRange(n);
                    const range = { min: field.min ?? guess.min, max: field.max ?? guess.max, step: field.step ?? guess.step };
                    const axis = array.length <= 3 ? AXES[i] : String(i);
                    folder.slider(`${label}.${axis}`, range, () => array[i], (v) => {
                        array[i] = v;
                        changed(path);
                    });
                });
            } else if (value && typeof value === "object" && !Array.isArray(value)) {
                nested.push([key, value as Record<string, unknown>]);
            } else {
                folder.readout(label, () => JSON.stringify(object[key]));
            }
        }

        for (const [key, child] of nested) {
            const childTitle = `${folderTitle} › ${schema[prefix ? `${prefix}.${key}` : key]?.label ?? key}`;
            walk(panel.folder(childTitle, false), child, prefix ? `${prefix}.${key}` : key, childTitle);
        }
    };

    const root = panel.folder(title, options.open ?? true);
    walk(root, target, "", title);
    return root;
}
