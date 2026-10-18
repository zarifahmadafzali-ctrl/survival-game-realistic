import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" lets the build work from any GitHub Pages sub-path
export default defineConfig({ base: "./", plugins: [react(), tailwindcss()] });
