/**
 * The editor panel in a window of its own.
 *
 * Docked, the panel shares the corner of the game's canvas and is never wide enough. Popped out, it
 * moves — the very same DOM element, not a copy — into a second browser window opened from this
 * page. Same origin, same JavaScript realm: a slider in that window writes the same live config
 * object it wrote when docked, so the game updates in the same frame with no messaging at all.
 *
 * What has to be carried across by hand:
 *  - styles: the page's `<style>`/`<link>` tags are cloned into the window on every mount;
 *  - keys: the path editor and the toggle listen on this window, so key presses in the pop-out are
 *    re-dispatched here (unless they are typed into a field);
 *  - focus: `ControlPanel` checks `ownerDocument.activeElement`, not `document.activeElement`.
 *
 * The window is reopened by the toggle key press (a user gesture, so no pop-up blocker), and found
 * again by name after the game page reloads — Save reloads it — keeping its size and position.
 * Put it beside the game, not over it: a fully covered game window is throttled by the browser.
 */

const WINDOW_NAME = "playable-kit-editor";
const WINDOW_FEATURES = "popup,width=480,height=920";
const PREF_KEY = "playable-kit:editor-popout";

function readPref(): boolean {
    try {
        return localStorage.getItem(PREF_KEY) === "1";
    } catch {
        return false;
    }
}

function writePref(value: boolean): void {
    try {
        localStorage.setItem(PREF_KEY, value ? "1" : "0");
    } catch {
        // Storage blocked: the choice just isn't remembered.
    }
}

// By tag name, not `instanceof`: the target belongs to the pop-out's realm.
function isTyping(target: EventTarget | null): boolean {
    const tag = (target as Element | null)?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export class PanelPopout {
    private win: Window | null = null;
    private element: HTMLElement | null = null;
    private home: HTMLElement | null = null;
    private wanted = readPref();
    private closingOurselves = false;
    private listener: (() => void) | null = null;

    constructor(private readonly title: string) {
        // The game page is going away (Save reloads it): leave a note in the window rather than a
        // dead panel, and let the next toggle press take it over again.
        window.addEventListener("pagehide", () => {
            if (!this.isOpen) return;
            const doc = this.win!.document;
            doc.body.replaceChildren();
            const note = doc.createElement("p");
            note.style.cssText = "color:#8b95a7;font:13px system-ui;padding:16px";
            note.textContent = "The game page reloaded. Press the editor key in the game window to bring the panel back here.";
            doc.body.appendChild(note);
        });
    }

    get isOpen(): boolean {
        return !!this.win && !this.win.closed;
    }

    /**
     * Runs whenever the panel moves between docked and popped out, so a label can follow. One
     * listener: the panel is rebuilt often, and each rebuild brings a new button to relabel.
     */
    onChange(listener: () => void): void {
        this.listener = listener;
    }

    /** Call after every panel (re)build, with the panel's root element. */
    attach(element: HTMLElement): void {
        this.element = element;
        this.home = element.parentElement;
        element.classList.add("kit-docked");
        if (this.isOpen) this.mount();
    }

    /** The editor was switched on, by a key press: reopen the window if that is how it was left. */
    show(): void {
        if (this.wanted && !this.isOpen) this.open();
    }

    /** The editor was switched off: close the window, but remember it for next time. */
    hide(): void {
        if (!this.isOpen) return;
        this.closingOurselves = true;
        this.dock();
        this.win!.close();
        this.win = null;
        this.closingOurselves = false;
    }

    toggle(): void {
        if (this.isOpen) {
            this.wanted = false;
            writePref(false);
            this.hide();
        } else {
            this.wanted = true;
            writePref(true);
            this.open();
        }
        this.emit();
    }

    private open(): void {
        const win = window.open("", WINDOW_NAME, WINDOW_FEATURES);
        if (!win) {
            console.warn("[editor] the pop-out window was blocked — allow pop-ups for this dev server");
            return;
        }
        this.win = win;
        this.prepare(win);
        this.mount();
        this.emit();
    }

    /** Wipes whatever a previous page left in the window and wires it to this one. */
    private prepare(win: Window): void {
        const doc = win.document;
        doc.title = this.title;
        doc.documentElement.className = "kit-popout";
        doc.head.replaceChildren();
        doc.body.replaceChildren();

        const forward = (event: KeyboardEvent) => {
            if (isTyping(event.target)) return;
            const copy = new KeyboardEvent(event.type, {
                key: event.key,
                code: event.code,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                repeat: event.repeat,
                bubbles: true,
                cancelable: true,
            });
            document.dispatchEvent(copy);
            if (copy.defaultPrevented) event.preventDefault();
        };
        doc.addEventListener("keydown", forward);
        doc.addEventListener("keyup", forward);

        // Closed by the user: the panel goes back to its corner, and stays there next time.
        win.addEventListener("pagehide", () => {
            if (this.closingOurselves || this.win !== win) return;
            this.win = null;
            this.wanted = false;
            writePref(false);
            this.dock();
            this.emit();
        });
    }

    private mount(): void {
        const doc = this.win?.document;
        if (!doc || !this.element) return;

        for (const old of doc.head.querySelectorAll("[data-kit-style]")) old.remove();
        for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
            const clone = node.cloneNode(true) as HTMLElement;
            clone.setAttribute("data-kit-style", "");
            doc.head.appendChild(clone);
        }

        this.element.classList.remove("kit-docked");
        doc.body.replaceChildren(this.element);
    }

    private dock(): void {
        if (!this.element || !this.home) return;
        this.element.classList.add("kit-docked");
        this.home.appendChild(this.element);
    }

    private emit(): void {
        this.listener?.();
    }
}
