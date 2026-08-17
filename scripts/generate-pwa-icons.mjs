import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, "..", "public", "favicon.svg");
const outDir = resolve(__dirname, "..", "public", "icons");

mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath, "utf-8");

const standardSizes = [
  { name: "icon-96x96.png", size: 96 },
  { name: "icon-192x192.png", size: 192 },
  { name: "icon-512x512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of standardSizes) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(resolve(outDir, name));
  console.log(`Generated ${name} (${size}x${size})`);
}

// Generate maskable icons with safe-zone padding (80% icon area centered on dark background)
const maskableSizes = [
  { name: "icon-192x192-maskable.png", size: 192 },
  { name: "icon-512x512-maskable.png", size: 512 },
];

for (const { name, size } of maskableSizes) {
  const innerSize = Math.round(size * 0.8);
  const innerPng = await sharp(Buffer.from(svg)).resize(innerSize, innerSize).png().toBuffer();
  
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 3, g: 7, b: 18, alpha: 1 }, // matches manifest background_color #030712
    }
  })
    .composite([{ input: innerPng, gravity: 'center' }])
    .png()
    .toFile(resolve(outDir, name));

  console.log(`Generated maskable ${name} (${size}x${size})`);
}

