import "./hud.css";

/**
 * The playable's own UI — a title, a CTA, a tap hint — plus the one thing only the demo has: a card
 * that says how to open the editor. The editor hides all of it while it is open (`isolateUi`).
 */

const REPO_URL = "https://github.com/ka2nq1/playable-kit";

export class Hud {
    private readonly toast: HTMLElement;
    private toastTimer = 0;

    constructor(root: HTMLElement) {
        const hud = document.createElement("div");
        hud.className = "hud";
        hud.innerHTML = `
            <div class="hud-title">
                <div class="hud-name">Campfire Night</div>
                <div class="hud-tagline">Tap the pond · tap the fire</div>
            </div>
            <div class="hud-toast"></div>
            <button class="hud-cta" type="button">PLAY NOW</button>
            <aside class="hud-editor">
                <div class="hud-editor-key"><kbd>V</kbd><span>Press <b>V</b> to open the editor</span></div>
                <p>It opens in its own window — allow pop-ups for this page if your browser asks.</p>
                <ul>
                    <li>Place and tune VFX from a live grid</li>
                    <li>Drag the fire, the tent and the hero's route</li>
                    <li>Edit gameplay numbers while the game runs</li>
                </ul>
                <div class="hud-editor-actions">
                    <button class="hud-open" type="button">Open editor</button>
                    <a href="${REPO_URL}" target="_blank" rel="noopener">playable-kit on GitHub ↗</a>
                </div>
                <p class="hud-small">Desktop only. This is a real playable built from the kit's files — nothing here is mocked.</p>
            </aside>`;
        root.appendChild(hud);

        this.toast = hud.querySelector(".hud-toast")!;
        hud.querySelector(".hud-cta")!.addEventListener("click", () => window.open(REPO_URL, "_blank", "noopener"));
        // The same path as pressing the key: `dev/boot.ts` listens for it.
        hud.querySelector(".hud-open")!.addEventListener("click", () => document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV", key: "v", bubbles: true })));
    }

    say(text: string): void {
        this.toast.textContent = text;
        this.toast.classList.add("hud-toast-on");
        clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => this.toast.classList.remove("hud-toast-on"), 1200);
    }
}
