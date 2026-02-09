import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["cjs"],
    dts: false,
    sourcemap: true,
    clean: true,
    target: "node22",
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { index: "src/index.ts" },
    format: ["cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "node22",
  },
]);
