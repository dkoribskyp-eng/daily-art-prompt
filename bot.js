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

// ─── COLOR SYSTEM (ADVANCED) ─────────────────────

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
  const types = ["Analogous", "Complementary", "Triadic", "Split"];

  const type = types[Math.floor(rand() * types.length)];

  let hues = [];

  switch (type) {
    case "Analogous":
      hues = [base - 30, base - 15, base, base + 15, base + 30];
      break;
    case "Complementary":
      hues = [base, base + 180, base + 10, base + 190, base + 20];
      break;
    case "Triadic":
      hues = [base, base + 120, base + 240, base + 30, base + 150];
      break;
    case "Split":
      hues = [base, base + 150, base + 210, base + 30, base + 330];
      break;
  }

  return hues.map(h =>
    hslToHex(
      h,
      45 + rand() * 35,
      35 + rand() * 30
    )
  );
}

// ─── PROMPT SYSTEM (FILES) ───────────────────────

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
