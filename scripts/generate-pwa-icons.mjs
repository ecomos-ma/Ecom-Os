import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The approved 512px icon is the source of truth. Never overwrite it.
const source = await readFile(path.join(root, "public/icon-512.png"));
const sizes = [72, 96, 128, 144, 152, 192, 384];
const background = "#da6387";
const icon = (size) => sharp(source).resize(size, size, { fit: "contain", background });

await Promise.all(sizes.map((size) =>
  icon(size).png().toFile(path.join(root, `public/icon-${size}.png`)),
));
// Inset the artwork so the logo stays inside Android's circular safe area.
const maskableArtwork = await icon(358).png().toBuffer();
await Promise.all([
  sharp({ create: { width: 512, height: 512, channels: 4, background } })
    .composite([{ input: maskableArtwork, gravity: "centre" }])
    .png().toFile(path.join(root, "public/maskable-icon-512.png")),
  icon(180).png().toFile(path.join(root, "public/apple-touch-icon.png")),
  icon(48).png().toFile(path.join(root, "public/favicon.png")),
]);
const faviconSizes = await Promise.all([16, 32, 48].map((size) => icon(size).png().toBuffer()));
await writeFile(path.join(root, "public/favicon.ico"), await pngToIco(faviconSizes));
console.log("Generated PWA, Apple, and favicon sizes from public/icon-512.png (original preserved).");
