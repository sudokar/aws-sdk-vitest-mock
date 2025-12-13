// <reference types='vitest' />
import { defineConfig, LibraryFormats } from "vite";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { nxCopyAssetsPlugin } from "@nx/vite/plugins/nx-copy-assets.plugin";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: "./node_modules/.vite/aws-sdk-vitest-mock",
  plugins: [
    nxViteTsPaths(),
    nxCopyAssetsPlugin(["README.md"]),
    dts({
      entryRoot: "src",
      tsconfigPath: "./tsconfig.lib.json",
    }),
  ],
  build: {
    outDir: "./dist",
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "vitest-setup": resolve(__dirname, "src/lib/vitest-setup.ts"),
      },
      name: "aws-sdk-vitest-mock",
      formats: ["es", "cjs"] satisfies LibraryFormats[],
    },
    rollupOptions: {
      external: ["vitest"],
    },
  },
  test: {
    name: "aws-sdk-vitest-mock",
    watch: false,
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    reporters: ["default"],
    coverage: {
      reportsDirectory: "./coverage/aws-sdk-vitest-mock",
      provider: "v8" as const,
    },
  },
}));
