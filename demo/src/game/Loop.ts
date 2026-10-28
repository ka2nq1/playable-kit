type Tick = (dt: number) => void;

/**
 * The demo's stand-in for the template's `UpdateController` + `TimeC`: one requestAnimationFrame
 * loop. `onFrame` runs every frame no matter what (the editor lives there); `onUpdate` gets the game
 * delta, which is 0 while the game is paused.
 */
export class Loop {
    paused = false;
    private readonly frame: Tick[] = [];
    private readonly game: Tick[] = [];
    private last = 0;

    onFrame(tick: Tick): void {
        this.frame.push(tick);
    }

    onUpdate(tick: Tick): void {
        this.game.push(tick);
    }

    start(render: () => void): void {
        this.last = performance.now();
        const step = (now: number) => {
            const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.1);
            this.last = now;
            for (const tick of this.frame) tick(dt);
            const gameDt = this.paused ? 0 : dt;
            for (const tick of this.game) tick(gameDt);
            render();
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
}
