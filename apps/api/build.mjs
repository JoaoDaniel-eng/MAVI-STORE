import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
// Dependências externas ficam no node_modules; o pacote do monorepo (@mavi/shared) é embutido.
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith("@mavi/"));

await build({
  entryPoints: { server: "src/server.ts", migrate: "src/db/migrate.ts", "create-owner": "src/scripts/create-owner.ts",
    "expire-reservations": "src/scripts/expire-reservations.ts",
    maintenance: "src/scripts/maintenance.ts",
    "seed-demo": "src/scripts/seed-demo.ts",
    "clean-demo": "src/scripts/clean-demo.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
});
