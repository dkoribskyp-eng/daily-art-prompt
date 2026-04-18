const { createCanvas } = require("canvas");
const fetch = require("node-fetch");
const FormData = require("form-data");
const fs = require("fs");

// RNG
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

// ─── COLOR SYSTEM ───────────────────────────────

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
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

function generatePalette(rand) {
  const base = rand() * 360;

  const types = ["Analogous", "Complementary", "Split"];
  const type = types[Math.floor(rand() * types.length)];

  const sat = 55 + rand() * 20;       // 55–75
  const lightBase = 45 + rand() * 10; // 45–55

  let hues = [];

  if (type === "Analogous") {
    const spread = 20 + rand() * 10;
    hues = [
      base - spread,
      base - spread / 2,
      base,
      base + spread / 2,
      base + spread
    ];
  }

  if (type === "Complementary") {
    const comp = base + 180;
    hues = [
      base,
      base + 10,
      base - 10,
      comp,
      comp + 10
    ];
  }

  if (type === "Split") {
    const split1 = base + 150;
    const split2 = base + 210;
    hues = [
      base,
      base + 10,
      split1,
      split1 + 10,
      split2
    ];
  }

  return hues.map((h, i) =>
    hslToHex(
      h,
      sat,
      Math.max(35, Math.min(65, lightBase + (i - 2) * 6))
    )
  );
}

// ─── PROMPTS (FILES) ────────────────────────────

function loadPrompts(path) {
  const data = fs.readFileSync(path, "utf-8");
  return data.split("\n").map(p => p.trim()).filter(Boolean);
}

function pickPrompts(rand) {
  const A = loadPrompts("prompts/a.txt");
  const B = loadPrompts("prompts/b.txt");

  const a = A[Math.floor(rand() * A.length)];
  const b = B[Math.floor(rand() * B.length)];

  return [a, b];
}

// ─── IMAGE ──────────────────────────────────────

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

    const rgb = parseInt(c.slice(1), 16);
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    const brightness = (r + g + b) / 3;

    ctx.fillStyle = brightness > 140 ? "#000000" : "#ffffff";
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

  const colors = generatePalette(rand);
  const [a, b] = pickPrompts(rand);
  const image = createImage(colors);

  const message = [
    "# Daily Drawing Prompt",
    "",
    `> **A:** _${a}_`,
    `> **B:** _${b}_`
  ].join("\n");

  await send(message, image);
}

run();
