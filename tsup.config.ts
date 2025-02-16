import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  clean: true,
  publicDir: true,
  external: ["@parcel/watcher"],


  minify: false,
  sourcemap: true,
  splitting: false,
  treeshake: false,
});
