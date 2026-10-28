import type { ControlPanel } from "../ui/ControlPanel";
import { buildAutoPanel, type AutoSchema } from "../ui/autoPanel";
import { saveJsonToProject } from "../devSave";

/**
 * The Tune tab: gameplay numbers, timings and colours, edited live and saved back to their JSON.
 *
 * A tunable is a JSON file the game imports and reads *live* — the object itself, not a copy taken
 * at startup — so a slider shows up in the next frame. Save writes the whole object back to the
 * file. A config the game copies once needs `onChange` to re-apply it.
 *
 * Configs written as TypeScript cannot be saved generically: move their numbers into a JSON under
 * `src/resources/editor/tune/` and import that from the TS config.
 */

export interface Tunable {
    label: string;
    /** Project-relative JSON file, under a folder the save endpoint allows. */
    file: string;
    /** The live object the game reads — usually the imported JSON module itself. */
    value: Record<string, unknown>;
    schema?: AutoSchema;
    onChange?(path: string): void;
}

export function buildTuneTab(panel: ControlPanel, tunables: readonly Tunable[]): void {
    tunables.forEach((tunable, i) => {
        const folder = buildAutoPanel(panel, tunable.label, tunable.value, {
            schema: tunable.schema,
            onChange: tunable.onChange,
            open: i === 0,
        });
        let status = "";
        folder.buttons({
            label: "Save",
            primary: true,
            onClick: () => {
                status = "saving…";
                saveJsonToProject(tunable.file, `${JSON.stringify(tunable.value, null, 4)}\n`)
                    .then(() => (status = `saved ${tunable.file}`))
                    .catch((err) => (status = `FAILED: ${String(err)}`))
                    .finally(() => panel.refresh());
            },
        });
        folder.readout("Status", () => status || tunable.file);
    });
}
