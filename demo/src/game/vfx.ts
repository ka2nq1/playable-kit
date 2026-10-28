/**
 * Every map effect this playable can carry. Each is a vfx-lab effect wrapped by `defineMapVfx`
 * (`vfx/adapters/<id>/` in the kit); what is actually *on* the scene is decided by the markers in
 * `placements.json`, never here.
 */

import FirePitC from "../controllers/VFX/FirePitC";
import RisingEmbersC from "../controllers/VFX/RisingEmbersC";
import SmokeWispsC from "../controllers/VFX/SmokeWispsC";
import HeatDistortionC from "../controllers/VFX/HeatDistortionC";
import LavaSurfaceC from "../controllers/VFX/LavaSurfaceC";
import GlowingCracksC from "../controllers/VFX/GlowingCracksC";
import LavaImpactC from "../controllers/VFX/LavaImpactC";
import WaterSurfaceC from "../controllers/VFX/WaterSurfaceC";
import WaterFogC from "../controllers/VFX/WaterFogC";
import SwampBubblesC from "../controllers/VFX/SwampBubblesC";
import WaterRipplesC from "../controllers/VFX/WaterRipplesC";
import WaterSplashC from "../controllers/VFX/WaterSplashC";
import IceSurfaceC from "../controllers/VFX/IceSurfaceC";
import SnowstormC from "../controllers/VFX/SnowstormC";
import FirefliesC from "../controllers/VFX/FirefliesC";
import SkyC from "../controllers/VFX/SkyC";

export const MAP_VFX = [
    SkyC,
    FirePitC,
    RisingEmbersC,
    SmokeWispsC,
    HeatDistortionC,
    LavaSurfaceC,
    GlowingCracksC,
    LavaImpactC,
    WaterSurfaceC,
    WaterFogC,
    SwampBubblesC,
    WaterRipplesC,
    WaterSplashC,
    IceSurfaceC,
    SnowstormC,
    FirefliesC,
];

export { FirePitC, WaterRipplesC, WaterSplashC };
