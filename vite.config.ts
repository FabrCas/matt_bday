import { defineConfig } from "vite";
import yaml from "@modyfi/vite-plugin-yaml";

// base: "./" => asset con path relativi, funziona sia in locale sia sotto
// il sotto-percorso di GitHub Pages (es. utente.github.io/matt_bday/).
// yaml() => permette `import config from "./file.yaml"` (parsato in build).
export default defineConfig({
  base: "./",
  publicDir: "./static",
  plugins: [yaml()],
});
