import { createLogger } from "vite";
import { defineConfig as defineLovableConfig } from "@lovable.dev/vite-tanstack-config";

const originalConsoleWarn = console.warn.bind(console);
const ignoredConsoleWarnings = ["vite-tsconfig-paths", "inlineDynamicImports"];

console.warn = (...args: unknown[]) => {
  const message = args.map(String).join(" ");
  if (ignoredConsoleWarnings.some((warning) => message.includes(warning))) return;
  originalConsoleWarn(...args);
};

const baseLogger = createLogger();
const ignoredWarnings = [
  "vite-tsconfig-paths",
  "inlineDynamicImports",
  "[nitro] [cloudflare] Wrangler config `main` is overridden",
  "[PLUGIN_TIMINGS]",
  "Some chunks are larger than 500 kB",
];

baseLogger.warn = (msg, options) => {
  if (ignoredWarnings.some((warning) => msg.includes(warning))) return;
  // Preserve all other warnings.
  console.warn(msg);
};

export default defineLovableConfig({
  vite: {
    customLogger: baseLogger,
    build: {
      chunkSizeWarningLimit: 30000,
      rolldownOptions: {
        output: {
          codeSplitting: undefined,
          inlineDynamicImports: undefined,
        },
      },
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
