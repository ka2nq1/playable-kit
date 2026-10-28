import { defineConfig } from "vite";

export default defineConfig({
    base: "./",
    server: { port: 5188, open: false },
    build: { target: "es2020", outDir: "dist" },
});
