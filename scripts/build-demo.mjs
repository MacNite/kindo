#!/usr/bin/env node
// Builds the static demo for GitHub Pages (§20 D74) into demo/out.
//
// A copy of the app in .demo-build/ gets demo/src laid over it: the Server
// Actions become the in-browser household of demo/src/server/demo/browser.ts,
// and the route-group layouts take their snapshot from it. What needs a server
// (API routes, middleware, jobs, sign-in, pairing, setup, the service worker)
// is left out. Then `next build` exports plain files.
//
//   KINDO_DEMO_BASE_PATH=/kindo/demo   where the files will be served (default)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(root, ".demo-build");
const out = join(root, "demo", "out");

rmSync(work, { recursive: true, force: true });
mkdirSync(work);
for (const f of ["src", "public", "package.json", "tsconfig.json", "tailwind.config.ts", "postcss.config.mjs", "next-env.d.ts"]) {
  if (existsSync(join(root, f))) cpSync(join(root, f), join(work, f), { recursive: true });
}
// The service worker Serwist built for the real app, if any, has no place here.
for (const f of readdirSync(join(work, "public"))) if (/^(sw\.js|sw\.js\.map|swe-worker-.*\.js)$/.test(f)) rmSync(join(work, "public", f));
for (const f of [
  "src/app/api", "src/middleware.ts", "src/instrumentation.ts", "src/instrumentation-node.ts", "src/app/sw.ts", "src/app/manifest.ts",
  "src/app/pair", "src/app/setup", "src/app/offline",
]) rmSync(join(work, f), { recursive: true, force: true });
cpSync(join(root, "demo", "src"), join(work, "src"), { recursive: true, filter: (f) => !f.endsWith(".test.ts") });
cpSync(join(root, "demo", "next.config.ts"), join(work, "next.config.ts"));

// node_modules is found in the repository above .demo-build.
const r = spawnSync(process.execPath, [join(root, "node_modules", "next", "dist", "bin", "next"), "build"], {
  cwd: work, stdio: "inherit", env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
if (r.status !== 0) process.exit(r.status ?? 1);

rmSync(out, { recursive: true, force: true });
cpSync(join(work, "out"), out, { recursive: true });
console.log(`Static demo in ${out}`);
