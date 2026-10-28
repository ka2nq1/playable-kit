/**
 * Writing an editing session back into the project, through the dev-server endpoint in
 * `templateLibs/kitEditorPlugin.mjs`. It only exists under `npm start` — a built playable has no
 * server to save to, which is the point: saving is an authoring step, not a runtime feature.
 */

/** Must match `SAVE_ENDPOINT` in `templateLibs/kitEditorPlugin.mjs`. */
export const SAVE_ENDPOINT = "/__kit/save";

let disabledReason: string | null = null;

/** Turns every save into a no-op that explains itself — the public demo has no project to write to. */
export function disableSaving(reason: string): void {
    disabledReason = reason;
}

export function savingDisabled(): string | null {
    return disabledReason;
}

/**
 * Overwrites `file` (project-relative) with `json`. Rejects with the server's message — a failed
 * save must never look like a successful one.
 */
export async function saveJsonToProject(file: string, json: string): Promise<void> {
    if (disabledReason) throw new Error(disabledReason);

    const response = await fetch(SAVE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file, json }),
    });

    if (!response.ok) {
        const message = (await response.text().catch(() => "")) || `${response.status} ${response.statusText}`;
        throw new Error(message);
    }
}
