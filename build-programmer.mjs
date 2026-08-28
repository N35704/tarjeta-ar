import { Document, NodeIO } from "@gltf-transform/core";
import { writeFileSync, mkdirSync } from "node:fs";

// A small blocky "programmer" figurine: head, torso, arms, legs + a glowing laptop.
function boxGeometry(w, h, d) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  function face(a, b, c, d2, normal) {
    return {
      pos: [...a, ...b, ...c, ...d2],
      norm: [...normal, ...normal, ...normal, ...normal],
      idx: [0, 1, 2, 0, 2, 3],
    };
  }
  const faces = [
    face([-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]),
    face([hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]),
    face([-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0]),
    face([-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0]),
    face([hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0]),
    face([-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0]),
  ];
  const pos = [], norm = [], idx = [];
  let base = 0;
  for (const f of faces) {
    pos.push(...f.pos);
    norm.push(...f.norm);
    idx.push(...f.idx.map((i) => i + base));
    base += 4;
  }
  return { pos: new Float32Array(pos), norm: new Float32Array(norm), idx: new Uint16Array(idx) };
}

const doc = new Document();
const buffer = doc.createBuffer();

function material(name, color, emissive) {
  const m = doc.createMaterial(name).setBaseColorFactor(color).setRoughnessFactor(0.6).setMetallicFactor(0.0);
  if (emissive) m.setEmissiveFactor(emissive).setEmissiveStrength ? m.setEmissiveFactor(emissive) : m.setEmissiveFactor(emissive);
  return m;
}

const matSkin = material("skin", [0.86, 0.73, 0.6, 1]);
const matShirt = material("shirt", [0.11, 0.17, 0.23, 1]);
const matPants = material("pants", [0.06, 0.09, 0.14, 1]);
const matLaptopBody = material("laptopBody", [0.2, 0.23, 0.27, 1]);
const matScreen = material("screen", [0.03, 0.05, 0.07, 1], [0.18, 0.83, 0.75]);

function addPart(name, w, h, d, mat, tx, ty, tz, rotDeg) {
  const geo = boxGeometry(w, h, d);
  const posAcc = doc.createAccessor().setType("VEC3").setArray(geo.pos).setBuffer(buffer);
  const normAcc = doc.createAccessor().setType("VEC3").setArray(geo.norm).setBuffer(buffer);
  const idxAcc = doc.createAccessor().setType("SCALAR").setArray(geo.idx).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute("POSITION", posAcc).setAttribute("NORMAL", normAcc).setIndices(idxAcc).setMaterial(mat);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  const node = doc.createNode(name).setMesh(mesh).setTranslation([tx, ty, tz]);
  if (rotDeg) {
    const rad = (rotDeg[0] * Math.PI) / 180;
    node.setRotation([Math.sin(rad / 2), 0, 0, Math.cos(rad / 2)]);
  }
  return node;
}

const root = doc.createNode("programmer");

// Proportions in meters (this whole figure gets scaled up in the AR page)
const legH = 0.05, torsoH = 0.06, headS = 0.042;

const legL = addPart("legL", 0.018, legH, 0.02, matPants, -0.014, legH / 2, 0);
const legR = addPart("legR", 0.018, legH, 0.02, matPants, 0.014, legH / 2, 0);
const torso = addPart("torso", 0.05, torsoH, 0.028, matShirt, 0, legH + torsoH / 2, 0);
const head = addPart("head", headS, headS, headS, matSkin, 0, legH + torsoH + headS / 2, 0);

const armY = legH + torsoH / 2 + 0.005;
const armL = addPart("armL", 0.014, 0.05, 0.014, matShirt, -0.033, armY, 0);
const armR = addPart("armR", 0.014, 0.05, 0.014, matShirt, 0.033, armY, 0);

// floating "screen" badge in front of the chest — reads as "code/laptop" without needing exact hinge geometry
const screenY = legH + torsoH - 0.01;
const screenBadge = addPart("screenBadge", 0.045, 0.03, 0.003, matScreen, 0, screenY, 0.028, [-12]);

for (const n of [legL, legR, torso, head, armL, armR, screenBadge]) {
  root.addChild(n);
}

const scene = doc.createScene("scene").addChild(root);
doc.getRoot().setDefaultScene(scene);

mkdirSync("assets", { recursive: true });
const io = new NodeIO();
await io.write("assets/programmer.glb", doc);
console.log("Wrote assets/programmer.glb");
