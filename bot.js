const { createCanvas } = require("canvas");
const fetch = require("node-fetch");
const FormData = require("form-data");
const fs = require("fs");

// ─── RNG ────────────────────────────────────────

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | seed)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateToSeed(d) {
  return parseInt(
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
  );
}

// ─── COLOR MATH ─────────────────────────────────

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s));
  l = Math.max(0, Math.min(100, l));
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Remove colors that are too similar to each other
function deduplicate(colors, hueThresh = 18, lightThresh = 12) {
  const unique = [];
  for (const c of colors) {
    const hsl = hexToHsl(c);
    const isDupe = unique.some((u) => {
      const u2 = hexToHsl(u);
      const hueDiff = Math.min(Math.abs(hsl.h - u2.h), 360 - Math.abs(hsl.h - u2.h));
      return hueDiff < hueThresh && Math.abs(hsl.s - u2.s) < 15 && Math.abs(hsl.l - u2.l) < lightThresh;
    });
    if (!isDupe) unique.push(c);
  }
  return unique;
}

// Sort: group by hue family, then dark→light within each group
function sortPalette(colors) {
  return [...colors].sort((a, b) => {
    const ha = hexToHsl(a), hb = hexToHsl(b);
    const hueDiff = Math.min(Math.abs(ha.h - hb.h), 360 - Math.abs(ha.h - hb.h));
    if (hueDiff < 30) return ha.l - hb.l;
    return ha.h - hb.h;
  });
}

// Spread 7 lightness values evenly from dark to light
function makeLights(rand) {
  const lMin = 10 + rand() * 12;  // 10–22
  const lMax = 72 + rand() * 18;  // 72–90
  const step = (lMax - lMin) / 6;
  return Array.from({ length: 7 }, (_, i) =>
    Math.max(8, Math.min(92, lMin + step * i + (rand() - 0.5) * 6))
  );
}

function makeColor(rand, hue, l) {
  const s = 30 + rand() * 38; // 30–68
  return hslToHex(hue + (rand() - 0.5) * 8, s, Math.max(8, Math.min(92, l)));
}

function finalize(rand, raw, baseHue, target = 5) {
  let result = deduplicate(raw);
  let attempts = 0;
  while (result.length < target && attempts < 20) {
    attempts++;
    const candidate = makeColor(rand, baseHue + (rand() - 0.5) * 40, 15 + rand() * 70);
    const next = deduplicate([...result, candidate]);
    if (next.length > result.length) result = next;
  }
  return sortPalette(result.slice(0, target));
}

// ─── PALETTE TYPES ──────────────────────────────

function generatePalette(rand) {
  const baseHue = rand() * 360;
  const ls = makeLights(rand);

  const types = ["Monochromatic", "Analogous", "Complementary", "Split"];
  const type = types[Math.floor(rand() * types.length)];

  let raw = [];

  if (type === "Monochromatic") {
    raw = ls.map((l) => hslToHex(baseHue + (rand() - 0.5) * 6, 22 + rand() * 46, l));
  }

  if (type === "Analogous") {
    const spread = 22 + rand() * 16; // 22–38°
    const hues = [
      baseHue - spread,
      baseHue - spread * 0.5,
      baseHue,
      baseHue + spread * 0.5,
      baseHue + spread,
      baseHue - spread * 0.75,
      baseHue + spread * 0.75,
    ];
    raw = hues.map((h, i) => makeColor(rand, h, ls[i % ls.length]));
  }

  if (type === "Complementary") {
    const comp = baseHue + 180;
    const base3 = [0, 1, 2].map((i) => makeColor(rand, baseHue, ls[i]));
    const comp2 = [3, 4, 5].map((i) => makeColor(rand, comp, ls[i]));
    raw = [...base3, ...comp2];
  }

  if (type === "Split") {
    const s1 = baseHue + 150;
    const s2 = baseHue + 210;
    raw = [
      makeColor(rand, baseHue, ls[0]),
      makeColor(rand, baseHue, ls[1]),
      makeColor(rand, baseHue, ls[2]),
      makeColor(rand, s1, ls[3]),
      makeColor(rand, s1, ls[4]),
      makeColor(rand, s2, ls[5]),
      makeColor(rand, s2, ls[6]),
    ];
  }

  const palette = finalize(rand, raw, baseHue);
  return { colors: palette, type };
}

// ─── PROMPTS ────────────────────────────────────

function loadPrompts(path) {
  const data = fs.readFileSync(path, "utf-8");
  return data.split("\n").map((p) => p.trim()).filter(Boolean);
}

function pickPrompts(rand) {
  const A = loadPrompts("prompts/a.txt");
  const B = loadPrompts("prompts/b.txt");
  const a = A[Math.floor(rand() * A.length)];
  const b = B[Math.floor(rand() * B.length)];
  return [a, b];
}

// ─── IMAGE ──────────────────────────────────────

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function createImage(colors) {
  const canvas = createCanvas(900, 260);
  const ctx = canvas.getContext("2d");

  const w = canvas.width / colors.length;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 20px sans-serif";

  colors.forEach((c, i) => {
    const x = i * w;

    ctx.fillStyle = c;
    ctx.fillRect(x, 0, w, canvas.height);

    ctx.fillStyle = luminance(c) > 128 ? "#000000" : "#ffffff";
    ctx.fillText(c.toUpperCase(), x + w / 2, canvas.height / 2);
  });

  return canvas.toBuffer("image/png");
}

// ─── SEND ───────────────────────────────────────

async function send(message, image) {
  const form = new FormData();
  form.append("content", message);
  form.append("file", image, {
    filename: "palette.png",
    contentType: "image/png",
  });

  await fetch(process.env.WEBHOOK_URL, {
    method: "POST",
    body: form,
  });
}

// ─── MAIN ───────────────────────────────────────

async function run() {
  const now = new Date();
  const rand = mulberry32(dateToSeed(now));

  const { colors, type } = generatePalette(rand);
  const [a, b] = pickPrompts(rand);
  const image = createImage(colors);

  const message = [
    "# Daily Drawing Prompt",
    "",
    `**Palette:** ${type}`,
    "",
    `> **A:** _${a}_`,
    `> **B:** _${b}_`,
  ].join("\n");

  await send(message, image);
}

run();
