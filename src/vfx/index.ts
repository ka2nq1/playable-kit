/** Public surface of the VFX package: drop this folder into a game and import from here. */

export type { VfxEffect, BurstOptions, QualityScale } from "./core/VfxEffect";
export { ParticleEffect } from "./core/VfxEffect";
export { ParticleBuffer } from "./core/ParticleBuffer";
export { QuadParticleRenderer } from "./core/QuadParticleRenderer";
export { StreakRenderer } from "./core/StreakRenderer";
export { RingRenderer } from "./core/RingRenderer";
export { SceneColorCapture, retainSceneColor } from "./core/SceneColorCapture";
export { TextureProvider, createGlowTexture, createEmberTexture, createSmokeTexture } from "./core/textures";
export type { ParticleTextureId } from "./core/textures";
export { Curve } from "./core/curves";
export type { Keyframe } from "./core/curves";
export { createRng, randRange } from "./core/random";
export type { Rng, Range } from "./core/random";

export * from "./effects/firepit";
export * from "./effects/water";
export * from "./effects/fireflies";
export * from "./effects/waterfog";
export * from "./effects/swampbubbles";
export * from "./effects/watersurface";
export * from "./effects/watersplash";
export * from "./effects/lavasurface";
export * from "./effects/lavaimpact";
export * from "./effects/glowingcracks";
export * from "./effects/risingembers";
export * from "./effects/smokewisps";
export * from "./effects/heatdistortion";
export * from "./effects/icesurface";

export * from "./effects/sky";
