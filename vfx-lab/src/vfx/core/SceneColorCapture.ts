/**
 * One grab of the colour already drawn this frame, shared by everything that needs to read the
 * background behind itself.
 *
 * Refraction needs the scene *without* the refracting surface in it. The textbook answer is a
 * second render into a render target, which costs a whole extra scene draw per refracting object
 * — unaffordable in a playable. This takes the grab-pass route instead: the effect's own
 * `onBeforeRender` fires while the framebuffer already holds every opaque object and every
 * transparent one sorted behind it, so a single `copyTexSubImage2D` of the live framebuffer is
 * both the background and a guarantee that the effect cannot sample itself. No extra scene pass,
 * no extra draw call, one texture for the whole frame however many effects ask for it.
 *
 * The cost is one full-viewport texture copy per frame — a GPU-side blit, no readback, no stall.
 * It happens only when something that needs it is actually being drawn, because nothing calls
 * `capture()` unless its mesh survived culling.
 *
 * Instances are shared per renderer and reference counted, so two heat sources in a scene do one
 * copy between them and the texture is freed the moment the last of them is disposed.
 */

import { ClampToEdgeWrapping, FramebufferTexture, LinearFilter, Vector2, type Texture, type WebGLRenderer } from "three";

export class SceneColorCapture {
    private texture: FramebufferTexture | null = null;
    /** `info.render.frame` of the last copy, so N effects in one frame cost one copy. */
    private capturedFrame = -1;
    private users = 0;
    private readonly size = new Vector2();

    /** The last grab, or `null` if nothing has been captured yet. */
    get map(): Texture | null {
        return this.texture;
    }

    /**
     * Copies the current framebuffer, at most once per rendered frame.
     *
     * Call this from `onBeforeRender` — earlier and the framebuffer is empty, later and the copy
     * contains the very pixels it is about to be used to shade.
     */
    capture(renderer: WebGLRenderer): Texture {
        renderer.getDrawingBufferSize(this.size);
        let tex = this.texture;
        // The drawing buffer size already folds in pixel ratio and canvas resize, so matching it
        // is the whole of the resolution handling: screen UVs are normalised, so a texture that
        // is the same shape as the framebuffer maps 1:1 at any size without a scaling uniform.
        if (tex === null || tex.image.width !== this.size.x || tex.image.height !== this.size.y) {
            tex?.dispose();
            tex = new FramebufferTexture(this.size.x, this.size.y);
            // Linear, because the point of this texture is to be sampled at offset UVs; nearest
            // turns a sub-pixel displacement into stair-stepping. Mipmaps would be generated per
            // frame for a texture that is only ever sampled at level 0.
            tex.minFilter = LinearFilter;
            tex.magFilter = LinearFilter;
            tex.wrapS = ClampToEdgeWrapping;
            tex.wrapT = ClampToEdgeWrapping;
            tex.generateMipmaps = false;
            this.texture = tex;
            this.capturedFrame = -1;
        }

        const frame = renderer.info.render.frame;
        if (frame !== this.capturedFrame) {
            this.capturedFrame = frame;
            renderer.copyFramebufferToTexture(tex);
        }
        return tex;
    }

    retain(): void {
        this.users++;
    }

    /** Frees the texture once the last user lets go. Safe to call more than once. */
    release(): void {
        if (this.users === 0) return;
        this.users--;
        if (this.users === 0) this.dispose();
    }

    dispose(): void {
        this.texture?.dispose();
        this.texture = null;
        this.capturedFrame = -1;
        this.users = 0;
    }
}

/**
 * Keyed on the renderer rather than module-global: a host with two renderers (or a dev server
 * that hot-replaces one) must not hand the second one the first one's framebuffer. Weak, so a
 * discarded renderer takes its capture with it.
 */
const perRenderer = new WeakMap<WebGLRenderer, SceneColorCapture>();

/** Claims a share of this renderer's capture. Pair every call with `release()`. */
export function retainSceneColor(renderer: WebGLRenderer): SceneColorCapture {
    let capture = perRenderer.get(renderer);
    if (!capture) {
        capture = new SceneColorCapture();
        perRenderer.set(renderer, capture);
    }
    capture.retain();
    return capture;
}
