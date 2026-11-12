import { compile } from "/opt/npm-tools/node_modules/tailwindcss/dist/lib.mjs";
import fs from "fs"; import path from "path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
const twDir = "/opt/npm-tools/node_modules/tailwindcss";
const compiler = await compile(css, {
  base: root,
  loadStylesheet: async (id, base) => {
    const p = id === "tailwindcss" ? path.join(twDir, "index.css") : id.startsWith("tailwindcss/") ? path.join(twDir, id.slice(12)) : path.resolve(base, id);
    return { path: p, base: path.dirname(p), content: fs.readFileSync(p, "utf8") };
  },
});
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) && files.push(p); });
walk(path.join(root, "src")); walk(path.join(root, "app"));
const cand = new Set();
for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/[^\s"'`{}<>;]+/g)) cand.add(m[0]);
const out = compiler.build([...cand]);
fs.writeFileSync(path.join(root, "preview/dist/app.css"), out);
console.log("css bytes", out.length);
