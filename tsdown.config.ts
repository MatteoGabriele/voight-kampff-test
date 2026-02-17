import { defineConfig } from "tsdown";

export default defineConfig({
  exports: true,
  noExternal: ["dayjs", "dayjs/plugin/minMax"],
  minify: true,
  publint: true,
  dts: true,
});
