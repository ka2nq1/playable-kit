/**
 * Headless screenshot of the running lab — `npm run shot`.
 *
 * Tuning VFX is a see-it loop, and a still frame is a surprisingly good instrument: it freezes a
 * burst you cannot pause by hand, and two shots taken either side of a parameter change show the
 * difference far more honestly than memory does. It also lets an agent (or CI) look at the effect
 * rather than take your word for it.
 *
 * Drives the Chrome already on the machine through playwright-core, so there is no browser
 * download and playwright stays out of the project's dependencies.
 *
 *   npm run shot                                      # default view, 4s warm-up
 *   npm run shot -- --out shots/sparks.png --wait 6000
 *   npm run shot -- --eval "__vfxLab.app.setCameraPreset('close')"
 */

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const url = arg("url", "http://localhost:5188/");
const out = resolve(arg("out", "shots/lab.png"));
const wait = Number(arg("wait", "4000"));
const evalScript = arg("eval", "");
const width = Number(arg("width", "1280"));
const height = Number(arg("height", "800"));
const keepPanel = argv.includes("--panel");

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let chromium;
try {
    ({ chromium } = await import("playwright-core"));
} catch {
    console.error("playwright-core is not installed. It is intentionally not a dependency of this project:\n" + "  npm i -D playwright-core");
    process.exit(1);
}

const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    // Lets the headless process fall back to software GL on machines without a usable GPU path.
    args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"],
});

try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const logs = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    // Particles need a few seconds of simulated time before a still frame is representative.
    await page.waitForTimeout(wait);

    if (!keepPanel) await page.evaluate(() => (window.__vfxLab.panel.visible = false));
    if (evalScript) {
        await page.evaluate(evalScript);
        await page.waitForTimeout(1200);
    }

    await mkdir(dirname(out), { recursive: true });
    await page.screenshot({ path: out });

    const stats = await page.evaluate(() => document.querySelector(".vl-stats")?.textContent ?? "");
    console.log(`wrote ${out}`);
    console.log(stats.trim());
    const problems = logs.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
    if (problems.length) console.log(problems.join("\n"));
} finally {
    await browser.close();
}
