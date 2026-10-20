import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "public/ecomos-app-icon.svg"));
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

await Promise.all(sizes.map((size) =>
  sharp(source).resize(size, size).png().toFile(path.join(root, `public/icon-${size}.png`)),
));
await Promise.all([
  sharp(source).resize(512, 512).png().toFile(path.join(root, "public/maskable-icon-512.png")),
  sharp(source).resize(180, 180).png().toFile(path.join(root, "public/apple-touch-icon.png")),
  sharp(source).resize(48, 48).png().toFile(path.join(root, "public/favicon.png")),
]);
