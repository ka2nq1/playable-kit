/**
 * The map effects the editor can place and tune — one tile each in the VFX grid. Every entry comes
 * from `vfx/adapters/<id>/dev/vfx/entries/` in the kit, exactly as /vfx-new would add it.
 */

import type { VfxDevEntry } from "../kit/registry";
import firepit from "./entries/firepit";
import risingembers from "./entries/risingembers";
import smokewisps from "./entries/smokewisps";
import heatdistortion from "./entries/heatdistortion";
import lavasurface from "./entries/lavasurface";
import glowingcracks from "./entries/glowingcracks";
import lavaimpact from "./entries/lavaimpact";
import watersurface from "./entries/watersurface";
import waterfog from "./entries/waterfog";
import swampbubbles from "./entries/swampbubbles";
import water from "./entries/water";
import watersplash from "./entries/watersplash";
import icesurface from "./entries/icesurface";
import snowstorm from "./entries/snowstorm";
import fireflies from "./entries/fireflies";
import sky from "./entries/sky";

export const VFX_ENTRIES: VfxDevEntry[] = [
    firepit,
    risingembers,
    smokewisps,
    heatdistortion,
    lavasurface,
    glowingcracks,
    lavaimpact,
    watersurface,
    waterfog,
    swampbubbles,
    water,
    watersplash,
    icesurface,
    snowstorm,
    fireflies,
    sky,
];
