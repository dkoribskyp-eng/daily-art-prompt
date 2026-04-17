const { createCanvas } = require("canvas");
const fetch = require("node-fetch");
const FormData = require("form-data");

// RNG
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (seed >>> 7), 61 | seed)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateToSeed(d) {
  return parseInt(
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
  );
}

// Colors
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
  return Array.from({ length: 5 }, (_, i) =>
    hslToHex(base + i * 25, 50 + rand() * 30, 40 + rand() * 20)
  );
}

// Prompts
const PROMPTS = [
  "a lonely figure in fog",
  "a quiet room at night",
  "a surreal landscape",
  "a character in motion",
  "a fading memory",
  "a glowing object in darkness",
  "a scene before a storm",
  "a still emotional moment"
];

function pickTwo(rand) {
  return [...PROMPTS].sort(() => rand() - 0.5).slice(0, 2);
}

// Image
function createImage(colors) {
  const canvas = createCanvas(900, 220);
  const ctx = canvas.getContext("2d");

  const w = canvas.width / colors.length;

  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * w, 0, w, canvas.height);
  });

  return canvas.toBuffer("image/png");
}

// Send
async function send(message, image) {
  const form = new FormData();
  form.append("content", message);
  form.append("file", image, "palette.png");

  await fetch(process.env.WEBHOOK_URL, {
    method: "POST",
    body: form,
  });
}

// Main
async function run() {
  const now = new Date();
  const rand = mulberry32(dateToSeed(now));

  const colors = generatePalette(rand);
  const [a, b] = pickTwo(rand);
  const image = createImage(colors);

  const message = [
    "🎨 Daily Drawing Prompt",
    "",
    `A: ${a}`,
    `B: ${b}`,
    "",
    colors.join("  ")
  ].join("\n");

  await send(message, image);
}

run();
