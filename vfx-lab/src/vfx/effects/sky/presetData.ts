/**
 * The built-in preset library, as data.
 *
 * A TS module rather than a JSON file on purpose: everything else under `src/vfx` is importable
 * into a playable with nothing but `three` on the dependency list, and a JSON import would make
 * `resolveJsonModule` (or a bundler plugin) a requirement for anyone integrating the sky. The
 * effect's own tunable config stays JSON, because the lab is what loads that one.
 *
 * Each entry is a *partial* config. It is handed straight to `normalizeSkyConfig`, which fills
 * every unmentioned field from the schema defaults — so a preset only ever states what makes it
 * different, and gains new fields automatically as the schema grows.
 */

export interface SkyPresetEntry {
    readonly label: string;
    /** Partial `SkyConfig`; validated on load like any other raw input. */
    readonly config: Record<string, unknown>;
}

export const SKY_PRESET_DATA: Readonly<Record<string, SkyPresetEntry>> = {
    "clear-day": {
        "label": "Clear Day",
        "config": {
            "sky": {
                "zenithColor": "#2f6fd6",
                "upperSkyColor": "#5e9ce9",
                "horizonColor": "#bcd9f3",
                "lowerHorizonColor": "#93a3b2",
                "hazeIntensity": 0.4,
                "atmosphereIntensity": 0.55
            },
            "sun": {
                "enabled": true,
                "color": "#fff6e2",
                "size": 1.3,
                "intensity": 1.7,
                "glowIntensity": 0.45,
                "glowRadius": 15
            },
            "clouds": {
                "enabled": true,
                "type": "scattered",
                "coverage": 0.38,
                "opacity": 0.9,
                "speed": 0.8
            },
            "weather": {
                "type": "clear",
                "visibility": 1
            },
            "atmosphere": {
                "fogNear": 20,
                "fogFar": 150
            },
            "time": {
                "timeOfDay": 12
            }
        }
    },
    "bright-sunny": {
        "label": "Bright Sunny",
        "config": {
            "sky": {
                "zenithColor": "#1f63d8",
                "upperSkyColor": "#4f96f0",
                "horizonColor": "#cfe6fb",
                "lowerHorizonColor": "#9fb0bd",
                "skyBrightness": 1.15,
                "skySaturation": 1.2,
                "hazeIntensity": 0.3,
                "atmosphereIntensity": 0.7
            },
            "sun": {
                "enabled": true,
                "color": "#fffaf0",
                "size": 1.5,
                "intensity": 2.4,
                "glowIntensity": 0.7,
                "glowRadius": 20
            },
            "clouds": {
                "enabled": true,
                "type": "puffy",
                "coverage": 0.22,
                "opacity": 1,
                "speed": 0.6
            },
            "weather": {
                "type": "clear",
                "visibility": 1
            },
            "lighting": {
                "directionalIntensity": 3,
                "ambientIntensity": 1.1
            },
            "time": {
                "timeOfDay": 13
            }
        }
    },
    "soft-morning": {
        "label": "Soft Morning",
        "config": {
            "sky": {
                "zenithColor": "#6f9fd8",
                "upperSkyColor": "#a7c7e8",
                "horizonColor": "#f0ddc8",
                "lowerHorizonColor": "#b9b2a8",
                "hazeIntensity": 0.95,
                "skySaturation": 0.82,
                "atmosphereIntensity": 0.9,
                "gradientSoftness": 0.8
            },
            "sun": {
                "enabled": true,
                "color": "#ffe6bd",
                "size": 1.6,
                "intensity": 1.2,
                "glowIntensity": 0.8,
                "glowRadius": 28,
                "glowSoftness": 0.9
            },
            "clouds": {
                "enabled": true,
                "type": "wispy",
                "coverage": 0.5,
                "opacity": 0.7,
                "color": "#ffeedd",
                "shadowColor": "#b9aba4",
                "speed": 0.5
            },
            "weather": {
                "type": "clear",
                "visibility": 0.85
            },
            "atmosphere": {
                "fogNear": 8,
                "fogFar": 90,
                "horizonHaze": 0.9
            },
            "time": {
                "timeOfDay": 7
            }
        }
    },
    "midday-blue": {
        "label": "Midday Blue Sky",
        "config": {
            "sky": {
                "zenithColor": "#14489f",
                "upperSkyColor": "#3b7fdb",
                "horizonColor": "#aacdf0",
                "lowerHorizonColor": "#8697a6",
                "skyContrast": 1.15,
                "hazeIntensity": 0.25,
                "gradientSoftness": 0.45
            },
            "sun": {
                "enabled": true,
                "color": "#fffdf6",
                "size": 1.1,
                "intensity": 2.6,
                "glowIntensity": 0.35,
                "glowRadius": 11
            },
            "clouds": {
                "enabled": false
            },
            "weather": {
                "type": "clear",
                "visibility": 1
            },
            "atmosphere": {
                "fogNear": 40,
                "fogFar": 240
            },
            "time": {
                "timeOfDay": 12
            }
        }
    },
    "golden-hour": {
        "label": "Golden Hour",
        "config": {
            "sky": {
                "zenithColor": "#2f5e9e",
                "upperSkyColor": "#7f9ccb",
                "horizonColor": "#ffc98a",
                "lowerHorizonColor": "#9c8574",
                "atmosphereIntensity": 1.5,
                "hazeIntensity": 0.8,
                "skySaturation": 1.15
            },
            "sun": {
                "enabled": true,
                "color": "#ffc368",
                "size": 2.2,
                "intensity": 2.2,
                "glowIntensity": 1.4,
                "glowRadius": 34,
                "glowSoftness": 0.85
            },
            "clouds": {
                "enabled": true,
                "type": "scattered",
                "coverage": 0.45,
                "color": "#ffd9ac",
                "shadowColor": "#8d6a62",
                "lightInfluence": 1.2,
                "speed": 0.7
            },
            "weather": {
                "type": "clear",
                "visibility": 0.95
            },
            "lighting": {
                "directionalColor": "#ffbe72",
                "directionalIntensity": 2.4
            },
            "time": {
                "timeOfDay": 17.4
            }
        }
    },
    "warm-sunset": {
        "label": "Warm Sunset",
        "config": {
            "sky": {
                "zenithColor": "#1d3f7e",
                "upperSkyColor": "#6d77ad",
                "horizonColor": "#ff9d57",
                "lowerHorizonColor": "#7d5c52",
                "atmosphereIntensity": 2,
                "hazeIntensity": 0.9,
                "skySaturation": 1.25,
                "gradientSoftness": 0.7
            },
            "sun": {
                "enabled": true,
                "color": "#ff9440",
                "size": 3.2,
                "intensity": 2,
                "glowIntensity": 1.8,
                "glowRadius": 42,
                "glowSoftness": 0.9
            },
            "clouds": {
                "enabled": true,
                "type": "scattered",
                "coverage": 0.52,
                "color": "#ffbb8a",
                "shadowColor": "#6d4652",
                "lightInfluence": 1.4,
                "speed": 0.6
            },
            "weather": {
                "type": "clear",
                "visibility": 0.92
            },
            "atmosphere": {
                "fogNear": 10,
                "fogFar": 110
            },
            "lighting": {
                "directionalColor": "#ff9a52",
                "directionalIntensity": 1.6,
                "ambientColor": "#8e7a94"
            },
            "time": {
                "timeOfDay": 17.95
            }
        }
    },
    "dramatic-sunset": {
        "label": "Dramatic Sunset",
        "config": {
            "sky": {
                "zenithColor": "#120b33",
                "upperSkyColor": "#4a2a63",
                "horizonColor": "#ff5d35",
                "lowerHorizonColor": "#5a2f3a",
                "atmosphereIntensity": 2.6,
                "hazeIntensity": 0.7,
                "skySaturation": 1.4,
                "skyContrast": 1.2,
                "exposure": 1.1
            },
            "sun": {
                "enabled": true,
                "color": "#ff5522",
                "size": 3.6,
                "intensity": 2.6,
                "glowIntensity": 2.2,
                "glowRadius": 48,
                "glowSoftness": 0.8
            },
            "clouds": {
                "enabled": true,
                "type": "storm",
                "coverage": 0.62,
                "density": 1.2,
                "color": "#ff9a6b",
                "shadowColor": "#2e1430",
                "lightInfluence": 1.8,
                "opacity": 0.95,
                "speed": 0.9
            },
            "weather": {
                "type": "clear",
                "visibility": 0.85
            },
            "atmosphere": {
                "fogNear": 8,
                "fogFar": 95
            },
            "lighting": {
                "directionalColor": "#ff6a38",
                "directionalIntensity": 1.5,
                "ambientColor": "#5d3f63"
            },
            "time": {
                "timeOfDay": 18.1
            }
        }
    },
    "pink-dusk": {
        "label": "Pink Dusk",
        "config": {
            "sky": {
                "zenithColor": "#1b1b4e",
                "upperSkyColor": "#5b4a8c",
                "horizonColor": "#f2a0b4",
                "lowerHorizonColor": "#6a5168",
                "nightZenithColor": "#0a0a26",
                "nightHorizonColor": "#2a2246",
                "atmosphereIntensity": 1.6,
                "hazeIntensity": 0.85,
                "skySaturation": 1.2
            },
            "sun": {
                "enabled": true,
                "color": "#ff7f9c",
                "size": 2.6,
                "intensity": 0.9,
                "glowIntensity": 1.5,
                "glowRadius": 45,
                "glowSoftness": 0.95
            },
            "moon": {
                "enabled": true,
                "size": 1.8,
                "intensity": 0.5,
                "glowIntensity": 0.3,
                "phase": 0.35
            },
            "stars": {
                "enabled": true,
                "brightness": 0.5,
                "coverage": 0.25,
                "twinkleIntensity": 0.3
            },
            "clouds": {
                "enabled": true,
                "type": "wispy",
                "coverage": 0.42,
                "color": "#ffc3d4",
                "shadowColor": "#4b3a5e",
                "opacity": 0.7,
                "speed": 0.5
            },
            "weather": {
                "type": "clear",
                "visibility": 0.9
            },
            "lighting": {
                "directionalColor": "#ff93ae",
                "directionalIntensity": 0.7,
                "ambientColor": "#5a4b76",
                "ambientIntensity": 0.8
            },
            "time": {
                "timeOfDay": 18.7
            }
        }
    },
    "twilight": {
        "label": "Twilight",
        "config": {
            "sky": {
                "zenithColor": "#070b2a",
                "upperSkyColor": "#1c2b5e",
                "horizonColor": "#5f6ea0",
                "lowerHorizonColor": "#2d3350",
                "nightZenithColor": "#05071a",
                "nightHorizonColor": "#1a2340",
                "hazeIntensity": 0.55,
                "atmosphereIntensity": 0.9,
                "skyBrightness": 0.9
            },
            "sun": {
                "enabled": true,
                "color": "#ff9d6e",
                "size": 2,
                "intensity": 0.3,
                "glowIntensity": 0.9,
                "glowRadius": 40,
                "glowSoftness": 0.95
            },
            "moon": {
                "enabled": true,
                "size": 2.2,
                "intensity": 0.9,
                "glowIntensity": 0.4,
                "phase": 0.6
            },
            "stars": {
                "enabled": true,
                "brightness": 1,
                "coverage": 0.4,
                "density": 40
            },
            "clouds": {
                "enabled": true,
                "type": "wispy",
                "coverage": 0.3,
                "color": "#8e9bc4",
                "shadowColor": "#232b48",
                "opacity": 0.55,
                "speed": 0.4
            },
            "weather": {
                "type": "clear",
                "visibility": 0.9
            },
            "lighting": {
                "directionalIntensity": 0.35,
                "ambientColor": "#3a4468",
                "ambientIntensity": 0.6
            },
            "time": {
                "timeOfDay": 19.5
            }
        }
    },
    "clear-night": {
        "label": "Clear Night",
        "config": {
            "sky": {
                "zenithColor": "#040718",
                "upperSkyColor": "#0a1030",
                "horizonColor": "#1a2342",
                "lowerHorizonColor": "#10141f",
                "nightZenithColor": "#03050f",
                "nightHorizonColor": "#121a30",
                "hazeIntensity": 0.3,
                "skyBrightness": 0.9
            },
            "sun": {
                "enabled": true,
                "intensity": 1
            },
            "moon": {
                "enabled": true,
                "size": 1.6,
                "intensity": 0.8,
                "glowIntensity": 0.25,
                "phase": 0.25,
                "surfaceDetail": 0.4
            },
            "stars": {
                "enabled": true,
                "brightness": 1.3,
                "density": 46,
                "coverage": 0.42,
                "twinkleIntensity": 0.45
            },
            "clouds": {
                "enabled": false
            },
            "weather": {
                "type": "clear",
                "visibility": 1
            },
            "atmosphere": {
                "fogNear": 30,
                "fogFar": 190
            },
            "lighting": {
                "ambientColor": "#25304f",
                "ambientIntensity": 0.35
            },
            "time": {
                "timeOfDay": 23
            }
        }
    },
    "moonlit-night": {
        "label": "Moonlit Night",
        "config": {
            "sky": {
                "zenithColor": "#060c24",
                "upperSkyColor": "#122046",
                "horizonColor": "#2b3a63",
                "lowerHorizonColor": "#161c2d",
                "nightZenithColor": "#050a1c",
                "nightHorizonColor": "#1d2749",
                "hazeIntensity": 0.5,
                "skyBrightness": 1.05
            },
            "moon": {
                "enabled": true,
                "size": 4.2,
                "intensity": 1.8,
                "glowIntensity": 0.9,
                "phase": 0.5,
                "surfaceDetail": 0.6,
                "color": "#e8eefc"
            },
            "stars": {
                "enabled": true,
                "brightness": 0.8,
                "density": 34,
                "coverage": 0.3
            },
            "clouds": {
                "enabled": true,
                "type": "scattered",
                "coverage": 0.4,
                "color": "#7d8bb3",
                "shadowColor": "#141c33",
                "opacity": 0.75,
                "lightInfluence": 0.3,
                "speed": 0.5
            },
            "weather": {
                "type": "clear",
                "visibility": 0.95
            },
            "lighting": {
                "directionalColor": "#9fb4e0",
                "ambientColor": "#2c3a5e",
                "ambientIntensity": 0.55
            },
            "time": {
                "timeOfDay": 1
            }
        }
    },
    "starry-night": {
        "label": "Starry Night",
        "config": {
            "sky": {
                "zenithColor": "#02030c",
                "upperSkyColor": "#050a1e",
                "horizonColor": "#0e1630",
                "lowerHorizonColor": "#080a12",
                "nightZenithColor": "#01020a",
                "nightHorizonColor": "#0b1226",
                "hazeIntensity": 0.18,
                "skyContrast": 1.2
            },
            "moon": {
                "enabled": false
            },
            "stars": {
                "enabled": true,
                "brightness": 2,
                "density": 70,
                "size": 0.65,
                "coverage": 0.6,
                "twinkleIntensity": 0.6,
                "twinkleSpeed": 1.4
            },
            "clouds": {
                "enabled": false
            },
            "weather": {
                "type": "clear",
                "visibility": 1
            },
            "atmosphere": {
                "fogNear": 40,
                "fogFar": 260
            },
            "lighting": {
                "ambientColor": "#161f3a",
                "ambientIntensity": 0.22,
                "directionalIntensity": 0.1
            },
            "time": {
                "timeOfDay": 2
            }
        }
    },
    "partly-cloudy": {
        "label": "Partly Cloudy",
        "config": {
            "sky": {
                "zenithColor": "#3570c9",
                "upperSkyColor": "#6b9edb",
                "horizonColor": "#c3d6e6",
                "lowerHorizonColor": "#929ba5",
                "hazeIntensity": 0.5
            },
            "sun": {
                "enabled": true,
                "size": 1.4,
                "intensity": 1.6,
                "glowIntensity": 0.5
            },
            "clouds": {
                "enabled": true,
                "type": "puffy",
                "coverage": 0.55,
                "density": 1.2,
                "opacity": 1,
                "speed": 1.1,
                "layerCount": 2,
                "lightInfluence": 0.9
            },
            "weather": {
                "type": "clear",
                "visibility": 0.95,
                "windStrength": 0.8
            },
            "time": {
                "timeOfDay": 11
            }
        }
    },
    "overcast": {
        "label": "Overcast",
        "config": {
            "sky": {
                "zenithColor": "#8a949e",
                "upperSkyColor": "#9aa4ae",
                "horizonColor": "#b6bcc2",
                "lowerHorizonColor": "#8e9298",
                "skySaturation": 0.3,
                "hazeIntensity": 0.8,
                "skyBrightness": 0.85,
                "gradientSoftness": 0.9
            },
            "sun": {
                "enabled": true,
                "intensity": 0.2,
                "glowIntensity": 0.25,
                "glowRadius": 50,
                "size": 2.5,
                "color": "#d8d8d4"
            },
            "clouds": {
                "enabled": true,
                "type": "overcast",
                "coverage": 0.9,
                "density": 1.5,
                "opacity": 1,
                "color": "#aab0b8",
                "shadowColor": "#6e747c",
                "lightInfluence": 0.25,
                "speed": 0.7
            },
            "weather": {
                "type": "clear",
                "visibility": 0.8
            },
            "atmosphere": {
                "fogColor": "#aeb4ba",
                "fogNear": 12,
                "fogFar": 95
            },
            "lighting": {
                "directionalIntensity": 0.7,
                "directionalColor": "#cfd4d8",
                "ambientColor": "#9aa1a8",
                "ambientIntensity": 1.1
            },
            "time": {
                "timeOfDay": 11
            }
        }
    },
    "dark-storm": {
        "label": "Dark Storm",
        "config": {
            "sky": {
                "zenithColor": "#171b22",
                "upperSkyColor": "#242a34",
                "horizonColor": "#3b414b",
                "lowerHorizonColor": "#1d2026",
                "skySaturation": 0.35,
                "skyBrightness": 0.7,
                "hazeIntensity": 1.1
            },
            "sun": {
                "enabled": true,
                "intensity": 0.08,
                "glowIntensity": 0.12,
                "size": 2,
                "color": "#9aa0a8"
            },
            "clouds": {
                "enabled": true,
                "type": "storm",
                "coverage": 0.95,
                "density": 2,
                "opacity": 1,
                "color": "#3e4450",
                "shadowColor": "#14171d",
                "lightInfluence": 0.3,
                "speed": 2.2,
                "windStrength": 2,
                "layerCount": 3
            },
            "weather": {
                "type": "storm",
                "intensity": 0.9,
                "windStrength": 1.6,
                "visibility": 0.45,
                "lightning": {
                    "enabled": true,
                    "frequency": 14,
                    "intensity": 1.3,
                    "bolts": true
                }
            },
            "atmosphere": {
                "fogColor": "#30353d",
                "fogNear": 5,
                "fogFar": 55,
                "visibilityDistance": 70
            },
            "lighting": {
                "directionalIntensity": 0.4,
                "directionalColor": "#8d949e",
                "ambientColor": "#2b3038",
                "ambientIntensity": 0.7
            },
            "time": {
                "timeOfDay": 15
            }
        }
    },
    "rainy-day": {
        "label": "Rainy Day",
        "config": {
            "sky": {
                "zenithColor": "#54606e",
                "upperSkyColor": "#6b7786",
                "horizonColor": "#929aa3",
                "lowerHorizonColor": "#6c727a",
                "skySaturation": 0.4,
                "skyBrightness": 0.85,
                "hazeIntensity": 0.95
            },
            "sun": {
                "enabled": true,
                "intensity": 0.15,
                "glowIntensity": 0.2,
                "size": 2.2,
                "color": "#c6ccd2"
            },
            "clouds": {
                "enabled": true,
                "type": "overcast",
                "coverage": 0.88,
                "density": 1.4,
                "color": "#79818c",
                "shadowColor": "#444a53",
                "lightInfluence": 0.2,
                "speed": 1.6
            },
            "weather": {
                "type": "rain",
                "intensity": 0.75,
                "precipitationDensity": 1.1,
                "windStrength": 0.9,
                "visibility": 0.6
            },
            "atmosphere": {
                "fogColor": "#7d858e",
                "fogNear": 8,
                "fogFar": 70,
                "visibilityDistance": 90
            },
            "lighting": {
                "directionalIntensity": 0.6,
                "directionalColor": "#b4bcc4",
                "ambientColor": "#6e767f",
                "ambientIntensity": 0.95
            },
            "time": {
                "timeOfDay": 14
            }
        }
    },
    "snowy-sky": {
        "label": "Snowy Sky",
        "config": {
            "sky": {
                "zenithColor": "#9db3c6",
                "upperSkyColor": "#b2c4d4",
                "horizonColor": "#dde6ee",
                "lowerHorizonColor": "#aeb8c2",
                "skySaturation": 0.45,
                "skyBrightness": 1.05,
                "hazeIntensity": 1.1
            },
            "sun": {
                "enabled": true,
                "intensity": 0.25,
                "glowIntensity": 0.35,
                "glowRadius": 45,
                "size": 2.4,
                "color": "#eef4fb"
            },
            "clouds": {
                "enabled": true,
                "type": "overcast",
                "coverage": 0.8,
                "density": 1.2,
                "color": "#cfdae5",
                "shadowColor": "#97a4b2",
                "lightInfluence": 0.3,
                "speed": 0.9
            },
            "weather": {
                "type": "snow",
                "intensity": 0.8,
                "precipitationDensity": 1,
                "windStrength": 0.5,
                "visibility": 0.7,
                "particleSize": 1.1
            },
            "atmosphere": {
                "fogColor": "#d2dce6",
                "fogNear": 10,
                "fogFar": 80,
                "visibilityDistance": 100
            },
            "lighting": {
                "directionalIntensity": 0.9,
                "directionalColor": "#e4edf6",
                "ambientColor": "#aebecd",
                "ambientIntensity": 1.2
            },
            "time": {
                "timeOfDay": 10
            }
        }
    },
    "foggy-morning": {
        "label": "Foggy Morning",
        "config": {
            "sky": {
                "zenithColor": "#9fa9ad",
                "upperSkyColor": "#b4bdc0",
                "horizonColor": "#d6dadb",
                "lowerHorizonColor": "#b0b4b5",
                "skySaturation": 0.25,
                "hazeIntensity": 1.6,
                "gradientSoftness": 1.2,
                "skyBrightness": 0.95
            },
            "sun": {
                "enabled": true,
                "intensity": 0.3,
                "glowIntensity": 0.9,
                "glowRadius": 55,
                "glowSoftness": 1,
                "size": 3,
                "color": "#f2e9d8"
            },
            "clouds": {
                "enabled": true,
                "type": "wispy",
                "coverage": 0.6,
                "opacity": 0.4,
                "color": "#d8dcdd",
                "shadowColor": "#a8adaf",
                "speed": 0.3
            },
            "weather": {
                "type": "clear",
                "visibility": 0.35
            },
            "atmosphere": {
                "fogType": "exp2",
                "fogDensity": 0.05,
                "fogColor": "#ccd2d4",
                "horizonHaze": 1.5,
                "visibilityDistance": 45
            },
            "lighting": {
                "directionalIntensity": 0.5,
                "ambientColor": "#b6babc",
                "ambientIntensity": 1.3
            },
            "time": {
                "timeOfDay": 7.2
            }
        }
    },
    "desert-heat": {
        "label": "Desert Heat",
        "config": {
            "sky": {
                "zenithColor": "#3f87cf",
                "upperSkyColor": "#8ab6dd",
                "horizonColor": "#f0e2bd",
                "lowerHorizonColor": "#bda886",
                "skySaturation": 0.85,
                "skyBrightness": 1.2,
                "hazeIntensity": 1.2,
                "atmosphereIntensity": 1.1
            },
            "sun": {
                "enabled": true,
                "color": "#fffbe8",
                "size": 1.8,
                "intensity": 3.2,
                "glowIntensity": 1.1,
                "glowRadius": 30
            },
            "clouds": {
                "enabled": true,
                "type": "wispy",
                "coverage": 0.12,
                "opacity": 0.4,
                "speed": 0.4
            },
            "weather": {
                "type": "clear",
                "visibility": 0.85
            },
            "atmosphere": {
                "fogColor": "#e8dcc0",
                "fogNear": 25,
                "fogFar": 200,
                "tint": "#ffe9b8",
                "tintStrength": 0.08
            },
            "lighting": {
                "directionalIntensity": 3.4,
                "directionalColor": "#fff4d4",
                "ambientColor": "#cbb48c",
                "ambientIntensity": 1.2
            },
            "time": {
                "timeOfDay": 13
            }
        }
    },
    "sandstorm": {
        "label": "Sandstorm",
        "config": {
            "sky": {
                "zenithColor": "#9a6a33",
                "upperSkyColor": "#b4813f",
                "horizonColor": "#d6a45c",
                "lowerHorizonColor": "#8e6434",
                "skySaturation": 0.9,
                "skyBrightness": 0.9,
                "hazeIntensity": 1.5,
                "gradientSoftness": 1.1
            },
            "sun": {
                "enabled": true,
                "color": "#e8b45e",
                "size": 3,
                "intensity": 0.5,
                "glowIntensity": 1.2,
                "glowRadius": 55,
                "glowSoftness": 1
            },
            "clouds": {
                "enabled": true,
                "type": "volcanic",
                "coverage": 0.7,
                "density": 1.4,
                "color": "#c08f4c",
                "shadowColor": "#6e4a23",
                "opacity": 0.8,
                "speed": 3,
                "windStrength": 2.5
            },
            "weather": {
                "type": "dust",
                "intensity": 1,
                "precipitationDensity": 1.4,
                "windStrength": 2.4,
                "windDirection": 70,
                "visibility": 0.25,
                "particleColor": "#d8b485",
                "particleOpacity": 0.8
            },
            "atmosphere": {
                "fogType": "exp2",
                "fogDensity": 0.045,
                "fogColor": "#c09050",
                "tint": "#e0a85c",
                "tintStrength": 0.25,
                "visibilityDistance": 40
            },
            "lighting": {
                "directionalIntensity": 0.9,
                "directionalColor": "#dfa860",
                "ambientColor": "#9c7442",
                "ambientIntensity": 1.1
            },
            "time": {
                "timeOfDay": 14
            }
        }
    },
    "volcanic-sky": {
        "label": "Volcanic Sky",
        "config": {
            "sky": {
                "zenithColor": "#180d10",
                "upperSkyColor": "#3a161a",
                "horizonColor": "#8c2d1c",
                "lowerHorizonColor": "#2b1210",
                "nightZenithColor": "#0a0506",
                "nightHorizonColor": "#2a0f0c",
                "skySaturation": 1.3,
                "skyBrightness": 0.9,
                "hazeIntensity": 1.2,
                "atmosphereIntensity": 1.8,
                "exposure": 1.15
            },
            "sun": {
                "enabled": true,
                "color": "#ff4418",
                "size": 2.6,
                "intensity": 1.4,
                "glowIntensity": 2,
                "glowRadius": 50,
                "glowSoftness": 0.9
            },
            "clouds": {
                "enabled": true,
                "type": "volcanic",
                "coverage": 0.78,
                "density": 1.7,
                "color": "#6b2d22",
                "shadowColor": "#140809",
                "opacity": 0.95,
                "lightInfluence": 1.6,
                "speed": 1.4,
                "height": 700
            },
            "weather": {
                "type": "ash",
                "intensity": 0.6,
                "precipitationDensity": 0.8,
                "windStrength": 0.8,
                "visibility": 0.55,
                "particleColor": "#3a3330"
            },
            "atmosphere": {
                "fogColor": "#4a1a14",
                "fogNear": 6,
                "fogFar": 70,
                "tint": "#ff5a28",
                "tintStrength": 0.12,
                "visibilityDistance": 80
            },
            "lighting": {
                "directionalIntensity": 1.2,
                "directionalColor": "#ff6a30",
                "ambientColor": "#5a241c",
                "ambientIntensity": 0.9
            },
            "time": {
                "timeOfDay": 16.5
            }
        }
    },
    "ash-filled": {
        "label": "Ash-Filled Sky",
        "config": {
            "sky": {
                "zenithColor": "#2b2926",
                "upperSkyColor": "#3d3a35",
                "horizonColor": "#595349",
                "lowerHorizonColor": "#312e2a",
                "skySaturation": 0.25,
                "skyBrightness": 0.75,
                "hazeIntensity": 1.3
            },
            "sun": {
                "enabled": true,
                "color": "#b5a28a",
                "size": 2.8,
                "intensity": 0.2,
                "glowIntensity": 0.5,
                "glowRadius": 45,
                "glowSoftness": 1
            },
            "clouds": {
                "enabled": true,
                "type": "volcanic",
                "coverage": 0.85,
                "density": 1.6,
                "color": "#4e4a44",
                "shadowColor": "#1e1c1a",
                "opacity": 1,
                "lightInfluence": 0.3,
                "speed": 1,
                "height": 600
            },
            "weather": {
                "type": "ash",
                "intensity": 0.95,
                "precipitationDensity": 1.3,
                "windStrength": 0.6,
                "visibility": 0.4,
                "particleColor": "#4a4440",
                "particleSize": 1.2
            },
            "atmosphere": {
                "fogType": "exp2",
                "fogDensity": 0.035,
                "fogColor": "#4c4841",
                "tint": "#6a6258",
                "tintStrength": 0.15,
                "visibilityDistance": 55
            },
            "lighting": {
                "directionalIntensity": 0.35,
                "directionalColor": "#9a9084",
                "ambientColor": "#4a4740",
                "ambientIntensity": 0.8
            },
            "time": {
                "timeOfDay": 12
            }
        }
    },
    "fantasy-purple": {
        "label": "Fantasy Purple Sky",
        "config": {
            "sky": {
                "zenithColor": "#2a0f52",
                "upperSkyColor": "#5b2391",
                "horizonColor": "#d87ae8",
                "lowerHorizonColor": "#3d2050",
                "skySaturation": 1.35,
                "skyContrast": 1.1,
                "hazeIntensity": 0.7,
                "atmosphereIntensity": 1.4,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 150,
                "elevation": 22,
                "color": "#ff9fe0",
                "size": 3.4,
                "intensity": 2,
                "glowIntensity": 1.8,
                "glowRadius": 42,
                "glowSoftness": 0.9
            },
            "moon": {
                "enabled": true,
                "azimuth": 330,
                "elevation": 48,
                "size": 3,
                "color": "#b7e4ff",
                "intensity": 1.2,
                "glowIntensity": 0.8,
                "phase": 0.65
            },
            "stars": {
                "enabled": true,
                "brightness": 1.4,
                "density": 50,
                "coverage": 0.45,
                "color": "#ffd9ff",
                "twinkleIntensity": 0.55
            },
            "clouds": {
                "enabled": true,
                "type": "wispy",
                "coverage": 0.45,
                "color": "#e3a8ff",
                "shadowColor": "#45206b",
                "opacity": 0.65,
                "lightInfluence": 1.3,
                "speed": 0.6
            },
            "weather": {
                "type": "clear",
                "visibility": 0.95
            },
            "atmosphere": {
                "fogColor": "#7a3fa8",
                "fogNear": 12,
                "fogFar": 120,
                "tint": "#c86aff",
                "tintStrength": 0.1
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ff9fe0",
                "directionalIntensity": 1.8,
                "ambientColor": "#6b4a9c",
                "ambientIntensity": 1
            },
            "time": {
                "driveCelestials": false,
                "timeOfDay": 20
            }
        }
    },
    "fantasy-alien": {
        "label": "Fantasy Alien Sky",
        "config": {
            "sky": {
                "zenithColor": "#042b2e",
                "upperSkyColor": "#0d5f58",
                "horizonColor": "#8fd66a",
                "lowerHorizonColor": "#2c4a35",
                "skySaturation": 1.4,
                "skyContrast": 1.15,
                "hazeIntensity": 0.6,
                "atmosphereIntensity": 1.2,
                "dayNightBlend": 0,
                "exposure": 1.05
            },
            "sun": {
                "enabled": true,
                "azimuth": 120,
                "elevation": 16,
                "color": "#d8ff7a",
                "size": 5.5,
                "intensity": 1.8,
                "glowIntensity": 1.4,
                "glowRadius": 38,
                "glowSoftness": 0.75
            },
            "moon": {
                "enabled": true,
                "azimuth": 250,
                "elevation": 35,
                "size": 6.5,
                "color": "#ff9a6a",
                "intensity": 1.1,
                "glowIntensity": 0.6,
                "phase": 0.72,
                "surfaceDetail": 0.8
            },
            "stars": {
                "enabled": true,
                "brightness": 1.1,
                "density": 38,
                "coverage": 0.35,
                "color": "#c6fff0"
            },
            "clouds": {
                "enabled": true,
                "type": "scattered",
                "coverage": 0.35,
                "color": "#a8ffd6",
                "shadowColor": "#0d4038",
                "opacity": 0.6,
                "lightInfluence": 1.5,
                "speed": 0.5,
                "height": 1300
            },
            "weather": {
                "type": "clear",
                "visibility": 0.95
            },
            "atmosphere": {
                "fogColor": "#2a7a63",
                "fogNear": 14,
                "fogFar": 130,
                "tint": "#6affc0",
                "tintStrength": 0.08
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#d8ff7a",
                "directionalIntensity": 1.9,
                "ambientColor": "#2f7a6c",
                "ambientIntensity": 1
            },
            "time": {
                "driveCelestials": false,
                "timeOfDay": 15
            }
        }
    },
    // ---- Cinematic: authored looks, sun placed by hand, palette frozen (dayNightBlend 0) ----
    "cine-ember-sea": {
        "label": "Cine · Ember Sea",
        "config": {
            "sky": {
                "zenithColor": "#3e3550",
                "upperSkyColor": "#a8404a",
                "horizonColor": "#ffae4a",
                "lowerHorizonColor": "#a13a26",
                "atmosphereIntensity": 1.8,
                "hazeIntensity": 0.35,
                "gradientSoftness": 0.7,
                "skySaturation": 1.25,
                "skyContrast": 1.1,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 0,
                "elevation": 2.5,
                "color": "#ffd27a",
                "size": 2.2,
                "intensity": 3,
                "glowIntensity": 1.6,
                "glowRadius": 30,
                "glowSoftness": 0.75,
                "raysIntensity": 0.25,
                "raysColor": "#ffb067",
                "raysLength": 35,
                "raysCount": 22,
                "raysSharpness": 1.6,
                "raysOverClouds": 0.2
            },
            "clouds": {
                "enabled": true,
                "type": "puffy",
                "coverage": 0.68,
                "density": 1.1,
                "scale": 1.3,
                "softness": 0.45,
                "variation": 0.7,
                "color": "#ffb48c",
                "shadowColor": "#5a3f5e",
                "lightInfluence": 1.4,
                "speed": 0.4,
                "direction": 20,
                "rimIntensity": 1.2,
                "rimTightness": 8,
                "rimEdge": 0.6,
                "glowColor": "#ff4a22",
                "glowIntensity": 1.1,
                "glowSpread": 0.75
            },
            "atmosphere": {
                "fogNear": 10,
                "fogFar": 110
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ff8a4a",
                "directionalIntensity": 1.6,
                "ambientColor": "#7a4a5a",
                "ambientIntensity": 0.8
            },
            "time": {
                "timeOfDay": 18.2,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    },
    "cine-golden-valley": {
        "label": "Cine · Golden Valley",
        "config": {
            "sky": {
                "zenithColor": "#5e1d06",
                "upperSkyColor": "#c94f0c",
                "horizonColor": "#ffc24a",
                "lowerHorizonColor": "#6a3410",
                "atmosphereIntensity": 2.2,
                "hazeIntensity": 0.6,
                "gradientSoftness": 0.9,
                "skySaturation": 1.3,
                "exposure": 1.1,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 12,
                "elevation": 7,
                "color": "#ffe08a",
                "size": 1.8,
                "intensity": 3.2,
                "glowIntensity": 2.2,
                "glowRadius": 45,
                "glowSoftness": 0.85,
                "raysIntensity": 0.9,
                "raysColor": "#ffd27a",
                "raysLength": 60,
                "raysCount": 14,
                "raysSharpness": 2.4,
                "raysSpeed": 0.1,
                "raysOverClouds": 0.55
            },
            "clouds": {
                "enabled": true,
                "type": "scattered",
                "coverage": 0.6,
                "density": 1.2,
                "scale": 0.9,
                "detail": 1.3,
                "softness": 0.4,
                "variation": 0.6,
                "color": "#ffcf7a",
                "shadowColor": "#4a1c0c",
                "lightInfluence": 1.6,
                "speed": 0.5,
                "direction": 0,
                "stretch": 1.8,
                "rimIntensity": 2,
                "rimTightness": 5,
                "rimEdge": 0.7,
                "glowColor": "#ff7a1a",
                "glowIntensity": 0.8,
                "glowSpread": 0.45,
                "sunGap": 0.35,
                "sunGapRadius": 9
            },
            "atmosphere": {
                "fogNear": 10,
                "fogFar": 120,
                "tint": "#ff9a2a",
                "tintStrength": 0.06
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ffb04a",
                "directionalIntensity": 2.2,
                "ambientColor": "#7a4a2a",
                "ambientIntensity": 0.9
            },
            "time": {
                "timeOfDay": 18,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    },
    "cine-candy-streaks": {
        "label": "Cine · Candy Streaks",
        "config": {
            "sky": {
                "zenithColor": "#1f2a8c",
                "upperSkyColor": "#7a3fb0",
                "horizonColor": "#ffb36a",
                "lowerHorizonColor": "#5a2a6a",
                "atmosphereIntensity": 1.4,
                "hazeIntensity": 0.4,
                "gradientSoftness": 1.1,
                "skySaturation": 1.35,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": -8,
                "elevation": 0.8,
                "color": "#ffd38a",
                "size": 1.4,
                "intensity": 2.4,
                "glowIntensity": 1.4,
                "glowRadius": 34,
                "glowSoftness": 0.9
            },
            "clouds": {
                "enabled": true,
                "type": "wispy",
                "coverage": 0.75,
                "density": 1.6,
                "scale": 0.8,
                "detail": 1.2,
                "softness": 0.6,
                "variation": 0.8,
                "color": "#ff9ac8",
                "shadowColor": "#4a2470",
                "lightInfluence": 1,
                "speed": 0.7,
                "direction": 90,
                "stretch": 6,
                "rimIntensity": 0.8,
                "rimTightness": 6,
                "rimEdge": 0.4,
                "glowColor": "#ff5c9e",
                "glowIntensity": 1.3,
                "glowSpread": 1
            },
            "atmosphere": {
                "fogNear": 10,
                "fogFar": 120
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ff8fb0",
                "directionalIntensity": 1.3,
                "ambientColor": "#5a4a9a",
                "ambientIntensity": 1
            },
            "time": {
                "timeOfDay": 18.3,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    },
    "cine-heaven-breach": {
        "label": "Cine · Heaven Breach",
        "config": {
            "sky": {
                "zenithColor": "#1a1c22",
                "upperSkyColor": "#3d3f47",
                "horizonColor": "#e0a070",
                "lowerHorizonColor": "#2a2a2e",
                "atmosphereIntensity": 1.2,
                "hazeIntensity": 0.55,
                "skySaturation": 0.9,
                "skyContrast": 1.25,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 0,
                "elevation": 24,
                "color": "#fff1d6",
                "size": 1.2,
                "intensity": 2.4,
                "glowIntensity": 1.4,
                "glowRadius": 22,
                "glowSoftness": 0.6,
                "raysIntensity": 1.6,
                "raysColor": "#fff0d0",
                "raysLength": 75,
                "raysCount": 11,
                "raysSharpness": 3.2,
                "raysSpeed": 0.08,
                "raysOverClouds": 0.8
            },
            "clouds": {
                "enabled": true,
                "type": "storm",
                "coverage": 0.55,
                "density": 1.2,
                "scale": 0.8,
                "detail": 1.1,
                "softness": 0.5,
                "variation": 0.5,
                "color": "#76737a",
                "shadowColor": "#18171d",
                "lightInfluence": 1.8,
                "speed": 0.35,
                "direction": 30,
                "rimIntensity": 3,
                "rimTightness": 10,
                "rimEdge": 0.9,
                "glowColor": "#c98a5a",
                "glowIntensity": 0.35,
                "glowSpread": 0.2,
                "sunGap": 0.75,
                "sunGapRadius": 16
            },
            "atmosphere": {
                "fogNear": 8,
                "fogFar": 100
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ffe6c0",
                "directionalIntensity": 2.4,
                "ambientColor": "#3a3c46",
                "ambientIntensity": 0.6
            },
            "time": {
                "timeOfDay": 16,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    },
    "cine-silver-lining": {
        "label": "Cine · Silver Lining",
        "config": {
            "sky": {
                "zenithColor": "#2c5aa8",
                "upperSkyColor": "#5c8ccc",
                "horizonColor": "#d6e2ee",
                "lowerHorizonColor": "#7a8696",
                "atmosphereIntensity": 0.8,
                "hazeIntensity": 0.4,
                "skyContrast": 1.15,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 5,
                "elevation": 32,
                "color": "#fffaf0",
                "size": 1.3,
                "intensity": 3,
                "glowIntensity": 1,
                "glowRadius": 20,
                "glowSoftness": 0.6,
                "raysIntensity": 0.7,
                "raysColor": "#ffffff",
                "raysLength": 45,
                "raysCount": 18,
                "raysSharpness": 2.6,
                "raysOverClouds": 0.15
            },
            "clouds": {
                "enabled": true,
                "type": "puffy",
                "coverage": 0.55,
                "density": 1.4,
                "scale": 1.1,
                "softness": 0.35,
                "variation": 0.6,
                "color": "#f4f6fa",
                "shadowColor": "#4c5566",
                "lightInfluence": 2,
                "speed": 0.5,
                "direction": 45,
                "rimIntensity": 4,
                "rimTightness": 7,
                "rimEdge": 1,
                "sunGap": 0.25,
                "sunGapRadius": 7
            },
            "atmosphere": {
                "fogNear": 20,
                "fogFar": 160
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#fff6e6",
                "directionalIntensity": 2.8,
                "ambientColor": "#8aa0c0",
                "ambientIntensity": 0.9
            },
            "time": {
                "timeOfDay": 14,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    },
    "cine-crimson-eclipse": {
        "label": "Cine · Crimson Eclipse",
        "config": {
            "sky": {
                "zenithColor": "#12040a",
                "upperSkyColor": "#4a0c14",
                "horizonColor": "#d8321e",
                "lowerHorizonColor": "#2a0808",
                "atmosphereIntensity": 2.4,
                "hazeIntensity": 0.6,
                "skySaturation": 1.4,
                "skyContrast": 1.3,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 0,
                "elevation": 4,
                "color": "#ff6a2a",
                "size": 7,
                "intensity": 2.2,
                "glowIntensity": 1.8,
                "glowRadius": 40,
                "glowSoftness": 0.9,
                "raysIntensity": 0.45,
                "raysColor": "#ff4a1a",
                "raysLength": 90,
                "raysCount": 8,
                "raysSharpness": 3.5,
                "raysSpeed": 0.05,
                "raysOverClouds": 0.1
            },
            "clouds": {
                "enabled": true,
                "type": "storm",
                "coverage": 0.38,
                "density": 1.6,
                "scale": 1.2,
                "softness": 0.3,
                "variation": 0.8,
                "color": "#3a0e12",
                "shadowColor": "#0a0204",
                "lightInfluence": 1.2,
                "speed": 0.3,
                "direction": 0,
                "stretch": 9,
                "rimIntensity": 2.4,
                "rimTightness": 12,
                "rimEdge": 1,
                "glowColor": "#ff3a14",
                "glowIntensity": 0.5,
                "glowSpread": 0
            },
            "atmosphere": {
                "fogNear": 6,
                "fogFar": 90,
                "tint": "#ff2a10",
                "tintStrength": 0.05
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ff4a20",
                "directionalIntensity": 1.4,
                "ambientColor": "#4a1418",
                "ambientIntensity": 0.6
            },
            "time": {
                "timeOfDay": 18.4,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    },
    "cine-lavender-afterglow": {
        "label": "Cine · Lavender Afterglow",
        "config": {
            "sky": {
                "zenithColor": "#2b2f6a",
                "upperSkyColor": "#8a76c0",
                "horizonColor": "#ffc8a0",
                "lowerHorizonColor": "#5a4a70",
                "atmosphereIntensity": 1.2,
                "hazeIntensity": 0.7,
                "gradientSoftness": 1.2,
                "skySaturation": 1.1,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 0,
                "elevation": -1.5,
                "color": "#ffb48a",
                "size": 1.6,
                "intensity": 1,
                "glowIntensity": 1.2,
                "glowRadius": 50,
                "glowSoftness": 1
            },
            "stars": {
                "enabled": true,
                "brightness": 0.6,
                "density": 44,
                "coverage": 0.3,
                "twinkleIntensity": 0.5
            },
            "clouds": {
                "enabled": true,
                "type": "scattered",
                "coverage": 0.55,
                "density": 1,
                "scale": 0.7,
                "detail": 1.2,
                "softness": 0.55,
                "variation": 0.7,
                "color": "#b8a6d8",
                "shadowColor": "#3a3260",
                "lightInfluence": 0.6,
                "speed": 0.35,
                "direction": 70,
                "stretch": 2.5,
                "rimIntensity": 0.3,
                "glowColor": "#ff9c8a",
                "glowIntensity": 1.5,
                "glowSpread": 0.85
            },
            "atmosphere": {
                "fogNear": 10,
                "fogFar": 120
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ffb0a0",
                "directionalIntensity": 0.9,
                "ambientColor": "#6a5a9a",
                "ambientIntensity": 1.1
            },
            "time": {
                "timeOfDay": 18.6,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    },
    "cine-mackerel-gold": {
        "label": "Cine · Mackerel Gold",
        "config": {
            "sky": {
                "zenithColor": "#1e4a8e",
                "upperSkyColor": "#5a86b8",
                "horizonColor": "#ffd9a0",
                "lowerHorizonColor": "#8a7a6a",
                "atmosphereIntensity": 1.4,
                "hazeIntensity": 0.45,
                "skySaturation": 1.15,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 10,
                "elevation": 9,
                "color": "#ffdc90",
                "size": 1.5,
                "intensity": 3,
                "glowIntensity": 1.3,
                "glowRadius": 28,
                "glowSoftness": 0.7,
                "raysIntensity": 0.4,
                "raysColor": "#ffe0a0",
                "raysLength": 40,
                "raysCount": 26,
                "raysSharpness": 1.8,
                "raysOverClouds": 0.3
            },
            "clouds": {
                "enabled": true,
                "type": "puffy",
                "coverage": 0.6,
                "density": 1.2,
                "scale": 3,
                "detail": 0.9,
                "softness": 0.4,
                "variation": 0.9,
                "color": "#fff0d0",
                "shadowColor": "#56607a",
                "lightInfluence": 1.4,
                "speed": 0.6,
                "direction": 110,
                "stretch": 2.2,
                "rimIntensity": 1.6,
                "rimTightness": 4,
                "rimEdge": 0.6,
                "glowColor": "#ffa040",
                "glowIntensity": 0.9,
                "glowSpread": 0.5
            },
            "atmosphere": {
                "fogNear": 14,
                "fogFar": 140
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ffcf80",
                "directionalIntensity": 2.2,
                "ambientColor": "#7a8aaa",
                "ambientIntensity": 0.9
            },
            "time": {
                "timeOfDay": 17.5,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    },
    "cine-storm-front": {
        "label": "Cine · Storm Front",
        "config": {
            "sky": {
                "zenithColor": "#14161c",
                "upperSkyColor": "#2c3038",
                "horizonColor": "#ff8a3a",
                "lowerHorizonColor": "#2a1c16",
                "atmosphereIntensity": 2.4,
                "hazeIntensity": 0.4,
                "skyContrast": 1.3,
                "skySaturation": 1.2,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": 0,
                "elevation": 3,
                "color": "#ffb050",
                "size": 2,
                "intensity": 3,
                "glowIntensity": 1.8,
                "glowRadius": 32,
                "glowSoftness": 0.8,
                "raysIntensity": 1.1,
                "raysColor": "#ffa850",
                "raysLength": 55,
                "raysCount": 12,
                "raysSharpness": 2.8,
                "raysSpeed": 0.12,
                "raysOverClouds": 0.35
            },
            "clouds": {
                "enabled": true,
                "type": "storm",
                "coverage": 0.6,
                "density": 1.4,
                "scale": 0.7,
                "detail": 1.2,
                "softness": 0.45,
                "variation": 0.6,
                "color": "#4a4a52",
                "shadowColor": "#0e0e12",
                "lightInfluence": 1.5,
                "speed": 1.1,
                "direction": 200,
                "stretch": 1.6,
                "rimIntensity": 2.2,
                "rimTightness": 5,
                "rimEdge": 0.8,
                "glowColor": "#ff6a1a",
                "glowIntensity": 1.6,
                "glowSpread": 0.05,
                "sunGap": 0.55,
                "sunGapRadius": 14
            },
            "weather": {
                "type": "clear",
                "lightning": {
                    "enabled": true,
                    "frequency": 3,
                    "intensity": 0.6,
                    "bolts": false
                }
            },
            "atmosphere": {
                "fogNear": 8,
                "fogFar": 100
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ff9040",
                "directionalIntensity": 1.8,
                "ambientColor": "#2e3240",
                "ambientIntensity": 0.6
            },
            "time": {
                "timeOfDay": 18.1,
                "driveCelestials": false
            }
        }
    },
    "cine-teal-orange": {
        "label": "Cine · Teal & Orange",
        "config": {
            "sky": {
                "zenithColor": "#0c3a4a",
                "upperSkyColor": "#2a7a8a",
                "horizonColor": "#ffb070",
                "lowerHorizonColor": "#3a3a3a",
                "atmosphereIntensity": 2,
                "hazeIntensity": 0.55,
                "gradientSoftness": 0.9,
                "skySaturation": 1.25,
                "skyContrast": 1.15,
                "dayNightBlend": 0
            },
            "sun": {
                "enabled": true,
                "azimuth": -15,
                "elevation": 6,
                "color": "#ffbe78",
                "size": 1.6,
                "intensity": 3.4,
                "glowIntensity": 2,
                "glowRadius": 38,
                "glowSoftness": 0.85,
                "raysIntensity": 0.7,
                "raysColor": "#ffb070",
                "raysLength": 120,
                "raysCount": 34,
                "raysSharpness": 1.3,
                "raysSpeed": 0.2,
                "raysOverClouds": 1
            },
            "clouds": {
                "enabled": true,
                "type": "wispy",
                "coverage": 0.45,
                "density": 1.2,
                "scale": 0.6,
                "softness": 0.6,
                "variation": 0.7,
                "color": "#ffd2a8",
                "shadowColor": "#1e4a56",
                "lightInfluence": 1.2,
                "speed": 0.5,
                "direction": 0,
                "stretch": 4,
                "rimIntensity": 1.5,
                "rimTightness": 5,
                "rimEdge": 0.5,
                "glowColor": "#ff8a3a",
                "glowIntensity": 0.9,
                "glowSpread": 0.35
            },
            "atmosphere": {
                "fogNear": 12,
                "fogFar": 140
            },
            "lighting": {
                "driveFromSun": false,
                "directionalColor": "#ffa868",
                "directionalIntensity": 2,
                "ambientColor": "#2a6a7a",
                "ambientIntensity": 1
            },
            "time": {
                "timeOfDay": 17.8,
                "driveCelestials": false
            },
            "weather": {
                "type": "clear"
            }
        }
    }
};
