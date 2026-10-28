/**
 * Frame cost readout.
 *
 * FPS is smoothed over a one-second window rather than shown per frame: an unsmoothed counter
 * jitters enough that you cannot tell a real regression from noise while dragging a slider.
 * Draw calls and triangles come straight from `renderer.info` — the number that matters when
 * judging whether an effect is affordable in a playable.
 */

import type { WebGLRenderer } from "three";

export class StatsOverlay {
    readonly dom: HTMLDivElement;

    private frames = 0;
    private accum = 0;
    private fps = 0;
    private extra = "";

    constructor() {
        this.dom = document.createElement("div");
        this.dom.className = "vl-stats";
    }

    /** Extra per-effect text, shown under the frame numbers. */
    setExtra(text: string): void {
        this.extra = text;
    }

    update(renderer: WebGLRenderer, realDt: number): void {
        this.frames++;
        this.accum += realDt;
        if (this.accum >= 0.5) {
            this.fps = this.frames / this.accum;
            this.frames = 0;
            this.accum = 0;
        }
        const info = renderer.info.render;
        this.dom.innerHTML =
            `<b>${this.fps.toFixed(0)}</b> fps <span>·</span> ` +
            `<b>${info.calls}</b> draws <span>·</span> ` +
            `<b>${info.triangles}</b> tris` +
            (this.extra ? `<br>${this.extra}` : "");
    }
}
