import { resolve } from "path";
const root = resolve(import.meta.dir, "..");
const r = await Bun.build({
  entrypoints: [resolve(root, "preview/main.tsx")],
  outdir: resolve(root, "preview/dist"),
  minify: true,
  target: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "alias",
    setup(b) {
      b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: resolve(root, "preview/lucide-shim.tsx") }));
      b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: resolve(root, "preview/supabase-stub.ts") }));
      b.onResolve({ filter: /^@\/lib\/upload$/ }, () => ({ path: resolve(root, "preview/upload-stub.ts") }));
      b.onResolve({ filter: /^@\/lib\/brand$/ }, () => ({ path: resolve(root, "preview/brand.ts") }));
      b.onResolve({ filter: /^@\// }, (a) => ({ path: Bun.resolveSync("./src/" + a.path.slice(2), root) }));
    },
  }],
});
if (!r.success) { console.error(r.logs); process.exit(1); }
console.log("ok", r.outputs.map((o) => o.path));
