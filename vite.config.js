import { defineConfig } from "vite";

export default defineConfig({
  //relative asset paths so the build works from a subpath like user.github.io/music_viz_gltchr/
  base: "./",
});
