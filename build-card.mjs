import { createCanvas, loadImage } from "@napi-rs/canvas";
import { Document, NodeIO } from "@gltf-transform/core";
import { writeFileSync, mkdirSync } from "node:fs";
import QRCode from "qrcode";

// ---- 1. Draw the card face texture ----
const TW = 1024, TH = 646; // ~85.6 x 54mm aspect ratio
const canvas = createCanvas(TW, TH);
const ctx = canvas.getContext("2d");

// background gradient
const bg = ctx.createLinearGradient(0, 0, TW, TH);
bg.addColorStop(0, "#0f1720");
bg.addColorStop(1, "#1c2b3a");
ctx.fillStyle = bg;
ctx.fillRect(0, 0, TW, TH);

// accent bar
ctx.fillStyle = "#2dd4bf";
ctx.fillRect(0, 0, 14, TH);

// name
ctx.fillStyle = "#ffffff";
ctx.font = "700 64px Arial";
ctx.textBaseline = "alphabetic";
ctx.fillText("Nestor Velazquez", 70, 300);

// puesto
ctx.fillStyle = "#2dd4bf";
ctx.font = "500 36px Arial";
ctx.fillText("Desarrollador de Software", 70, 355);

// divider
ctx.strokeStyle = "rgba(255,255,255,0.25)";
ctx.lineWidth = 2;
ctx.beginPath();
ctx.moveTo(70, 460);
ctx.lineTo(500, 460);
ctx.stroke();

// contact
ctx.fillStyle = "#cbd5e1";
ctx.font = "400 30px Arial";
ctx.fillText("n35704@gmail.com", 70, 510);

// QR code -> opens the AR page
const SITE_URL = "https://n35704.github.io/tarjeta-ar/";
const qrBuffer = await QRCode.toBuffer(SITE_URL, {
  type: "png",
  margin: 1,
  color: { dark: "#0f1720ff", light: "#ffffffff" },
  width: 400,
});
const qrImg = await loadImage(qrBuffer);
const QR_SIZE = 190;
const qrX = TW - QR_SIZE - 60;
const qrY = (TH - QR_SIZE) / 2;
const pad = 10;
ctx.fillStyle = "#ffffff";
ctx.fillRect(qrX - pad, qrY - pad, QR_SIZE + pad * 2, QR_SIZE + pad * 2);
ctx.drawImage(qrImg, qrX, qrY, QR_SIZE, QR_SIZE);

ctx.fillStyle = "#8fa3b8";
ctx.font = "400 20px Arial";
ctx.textAlign = "center";
ctx.fillText("Escanea para ver en AR", qrX + QR_SIZE / 2, qrY + QR_SIZE + pad + 26);
ctx.textAlign = "left";

const pngBuffer = await canvas.encode("png");
mkdirSync("assets", { recursive: true });
writeFileSync("assets/card-front.png", pngBuffer);

// ---- 2. Build the card mesh (thin box) ----
const W = 0.0856, H = 0.054, D = 0.0015; // meters, real card size
const hx = W / 2, hy = H / 2, hz = D / 2;

function face(a, b, c, d, normal) {
  // a,b,c,d are corner positions in CCW order (viewed from outside)
  return {
    pos: [...a, ...b, ...c, ...d],
    norm: [...normal, ...normal, ...normal, ...normal],
    uv: [0, 1, 1, 1, 1, 0, 0, 0],
    idx: [0, 1, 2, 0, 2, 3],
  };
}

// Front face (+Z) — the textured design
const front = face(
  [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  [0, 0, 1]
);

// Remaining faces (back + 4 sides) — plain material, merged into one primitive
const back = face(
  [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz],
  [0, 0, -1]
);
const top = face(
  [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz],
  [0, 1, 0]
);
const bottom = face(
  [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz],
  [0, -1, 0]
);
const right = face(
  [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz],
  [1, 0, 0]
);
const left = face(
  [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz],
  [-1, 0, 0]
);

function mergeFaces(faces) {
  const pos = [], norm = [], uv = [], idx = [];
  let base = 0;
  for (const f of faces) {
    pos.push(...f.pos);
    norm.push(...f.norm);
    uv.push(...f.uv);
    idx.push(...f.idx.map((i) => i + base));
    base += 4;
  }
  return {
    pos: new Float32Array(pos),
    norm: new Float32Array(norm),
    uv: new Float32Array(uv),
    idx: new Uint16Array(idx),
  };
}

const frontData = mergeFaces([front]);
const restData = mergeFaces([back, top, bottom, right, left]);

const doc = new Document();
const buffer = doc.createBuffer();

function addPrimitive(data, material) {
  const posAcc = doc.createAccessor().setType("VEC3").setArray(data.pos).setBuffer(buffer);
  const normAcc = doc.createAccessor().setType("VEC3").setArray(data.norm).setBuffer(buffer);
  const idxAcc = doc.createAccessor().setType("SCALAR").setArray(data.idx).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", posAcc).setAttribute("NORMAL", normAcc).setIndices(idxAcc).setMaterial(material);
  if (data.uv) {
    const uvAcc = doc.createAccessor().setType("VEC2").setArray(data.uv).setBuffer(buffer);
    prim.setAttribute("TEXCOORD_0", uvAcc);
  }
  return prim;
}

const texture = doc.createTexture("card-front").setImage(pngBuffer).setMimeType("image/png");
const matFront = doc.createMaterial("front").setBaseColorTexture(texture).setRoughnessFactor(0.55).setMetallicFactor(0.0);
const matSide = doc.createMaterial("side").setBaseColorFactor([0.09, 0.14, 0.2, 1]).setRoughnessFactor(0.7).setMetallicFactor(0.0);

const primFront = addPrimitive(frontData, matFront);
const primRest = addPrimitive(restData, matSide);

const mesh = doc.createMesh("card").addPrimitive(primFront).addPrimitive(primRest);
const node = doc.createNode("card").setMesh(mesh);
const scene = doc.createScene("scene").addChild(node);
doc.getRoot().setDefaultScene(scene);

const io = new NodeIO();
await io.write("assets/card.glb", doc);

console.log("Wrote assets/card-front.png and assets/card.glb");
