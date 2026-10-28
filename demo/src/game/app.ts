import type { Hero } from "./Hero";
import type { Loop } from "./Loop";
import type { World } from "./World";

/**
 * The running game, for the editor's config to reach — the demo's equivalent of a template
 * project's `ThreeC` / `CameraC` / `TimeC` singletons. Filled by `main.ts`.
 */
export const app = {} as { loop: Loop; world: World; hero: Hero };
