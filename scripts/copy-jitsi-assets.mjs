import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "vendor/jitsi");
const dest = join(root, ".vercel/output/functions/__server.func/vendor/jitsi");
if (!existsSync(src) || !existsSync(join(root, ".vercel/output/functions/__server.func"))) {
  process.exit(0);
}
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
