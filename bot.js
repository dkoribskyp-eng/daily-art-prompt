const { createCanvas } = require("canvas");
const fetch = require("node-fetch");
const FormData = require("form-data");

// RNG
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (seed >>> 7), 61 | seed)) ^ seed;
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

// Image (NOW WITH HEX LABELS INSIDE)
function createImage(colors) {
  const canvas = createCanvas(900, 260);
  const ctx = canvas.getContext("2d");

  const w = canvas.width / colors.length;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 20px sans-serif";

  colors.forEach((c, i) => {
    const x = i * w;

    // color block
    ctx.fillStyle = c;
    ctx.fillRect(x, 0, w, canvas.height);

    // contrast text color
    const rgb = parseInt(c.slice(1), 16);
    const r = (rgb >> 16) & 255;
    const g = (rgb >> 8) & 255;
    const b = rgb & 255;
    const brightness = (r + g + b) / 3;

    ctx.fillStyle = brightness > 140 ? "#000000" : "#ffffff";

    // hex label
    ctx.fillText(c.toUpperCase(), x + w / 2, canvas.height / 2);
  });

  return canvas.toBuffer("image/png");
}

// Send
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

// Main
async function run() {
  const now = new Date();
  const rand = mulberry32(dateToSeed(now));

  const colors = generatePalette(rand);
  const [a, b] = pickTwo(rand);
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
