// Display-only 3D models for construction and operating sites, drawn by a three.js layer inside MapLibre's WebGL
// context. Reads site data handed in by living-map; never touches game state. Each model kind is built procedurally
// (metres, Y up) and can be replaced by dropping `public/models/<kind>.glb` (metres, Y up, origin at the base centre).
import { MercatorCoordinate, type CustomLayerInterface, type Map as MlMap } from 'maplibre-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ModelKind = 'datacentre' | 'semiconductor' | 'ev' | 'renewables' | 'hq' | 'housing' | 'station' | 'clinic' | 'generic';
export interface ModelSite { key: string; at: [number, number]; kind: ModelKind; progress: number; done: boolean }

const ROT_X = new THREE.Matrix4().makeRotationX(Math.PI / 2);

// ---------------------------------------------------------------- materials and primitives
const mats = new Map<string, THREE.Material>();
const mat = (color: number, opts: { rough?: number; metal?: number; emissive?: number; map?: THREE.Texture } = {}) => {
  const key = `${color}:${opts.rough ?? 0.8}:${opts.metal ?? 0}:${opts.emissive ?? 0}:${opts.map?.uuid ?? ''}`;
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0, emissiveIntensity: 0.6, ...(opts.map ? { map: opts.map } : {}) }); mats.set(key, m); }
  return m;
};

/** Window grid texture for facades (cached per colour pair). */
const facades = new Map<string, THREE.CanvasTexture>();
function facade(wall: string, glass: string, cols = 8, rows = 8): THREE.CanvasTexture {
  const key = `${wall}${glass}${cols}${rows}`;
  let t = facades.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = wall; g.fillRect(0, 0, 128, 128);
    g.fillStyle = glass;
    const cw = 128 / cols, rh = 128 / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) g.fillRect(i * cw + cw * 0.14, j * rh + rh * 0.2, cw * 0.72, rh * 0.6);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    facades.set(key, t);
  }
  return t;
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}
function cyl(r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rTop = r): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, 20), m);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}
/** A facade-textured block: the texture repeats with the block size so windows keep a constant scale. */
function tower(w: number, h: number, d: number, wall: string, glass: string, x = 0, y = 0, z = 0, floorH = 4): THREE.Mesh {
  const tex = facade(wall, glass).clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, Math.round(w / 16)), Math.max(1, Math.round(h / floorH / 8)));
  const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.25 });
  const roof = mat(0x8a95a0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

// ---------------------------------------------------------------- procedural models (metres, Y up, centred on the origin)
const dark =mat(0x4b5662), white = mat(0xeef2f5), steel = mat(0x9aa6b2, { metal: 0.5, rough: 0.4 });

function datacentre(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(100, 14, 54, mat(0xcfd6dd), 0, 0, 0));
  g.add(box(100, 1.2, 54, mat(0x3d8bfd, { emissive: 0x1a4fa0 }), 0, 14, 0)); // roof stripe
  for (let i = 0; i < 6; i++) g.add(box(9, 3, 9, steel, -38 + i * 15, 15.2, -12)); // rooftop chillers
  for (let i = 0; i < 4; i++) g.add(cyl(4.2, 9, white, -34 + i * 22, 14, 14));
  g.add(box(18, 8, 16, dark, 62, 0, 0)); // substation
  for (let i = 0; i < 3; i++) g.add(box(6, 5, 6, mat(0xd8dde2), 54 + i * 8, 0, -26)); // generators
  g.add(box(4, 10, 4, mat(0xff6b4a), 62, 8, 0));
  return g;
}
function semiconductor(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(110, 18, 46, mat(0xe4e8ec), 0, 0, 0));
  g.add(box(110, 2, 46, mat(0x2fb6a3, { emissive: 0x106f63 }), 0, 18, 0));
  for (let i = 0; i < 3; i++) g.add(cyl(3.2, 34, steel, -30 + i * 30, 18, -30));
  for (let i = 0; i < 4; i++) g.add(cyl(5, 12, white, -42 + i * 28, 0, 36));
  g.add(box(30, 10, 20, dark, 70, 0, 0));
  return g;
}
function ev(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(100, 9, 52, mat(0xd7dde3), 0, 0, 0));
  const saw = new THREE.Shape();
  saw.moveTo(0, 0); saw.lineTo(25, 0); saw.lineTo(25, 7); saw.lineTo(0, 0);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(saw, { depth: 52, bevelEnabled: false }), mat(0x5d7085));
    m.rotation.y = Math.PI / 2; m.position.set(-50 + i * 25, 9, 26);
    g.add(m);
  }
  g.add(cyl(2.5, 28, dark, 40, 9, -20));
  g.add(box(28, 4, 20, mat(0x2a9df4), 0, 0, 40)); // test track shed
  return g;
}
function renewables(): THREE.Group {
  const g = new THREE.Group();
  const panel = new THREE.MeshStandardMaterial({ color: 0x1d4a8a, roughness: 0.25, metalness: 0.6 });
  for (let i = 0; i < 12; i++) for (let j = 0; j < 7; j++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 7), panel);
    p.position.set(-80 + i * 15, 2.2, -45 + j * 14); p.rotation.x = -0.45;
    g.add(p, box(0.6, 1.6, 0.6, steel, -80 + i * 15, 0, -45 + j * 14));
  }
  for (const [x, z] of [[-60, 80], [0, 90], [60, 80]]) {
    g.add(cyl(1.4, 70, white, x, 0, z, 0.8));
    const hub = new THREE.Group();
    hub.position.set(x, 70, z + 1.8);
    for (let b = 0; b < 3; b++) { const blade = box(1, 30, 0.6, white, 0, 0, 0); blade.position.y = 15; const arm = new THREE.Group(); arm.rotation.z = (b * Math.PI * 2) / 3 + 0.4; arm.add(blade); hub.add(arm); }
    g.add(hub);
  }
  return g;
}
function hq(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(80, 10, 80, mat(0xc8d0d8), 0, 0, 0));
  g.add(tower(52, 70, 52, '#27465e', '#9fd8ef', 0, 10, 0));
  g.add(tower(38, 50, 38, '#2c5a77', '#b9e6f7', 0, 80, 0));
  g.add(tower(24, 30, 24, '#2f6a8b', '#d2f1fb', 0, 130, 0));
  g.add(cyl(0.7, 26, steel, 0, 160, 0, 0.1));
  return g;
}
function housing(): THREE.Group {
  const g = new THREE.Group();
  const heights = [88, 70, 56];
  heights.forEach((h, i) => g.add(tower(24, h, 24, '#d9cfc2', '#6c8ea8', -34 + i * 34, 0, 0, 3.2)));
  g.add(box(100, 4, 28, mat(0x7fae6a), 0, 0, 34)); // podium garden
  return g;
}
function station(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(70, 7, 20, mat(0xdfe5ea), 0, 0, 0));
  g.add(box(76, 1.4, 26, mat(0x3a7bd5), 0, 7, 0));
  g.add(box(90, 0.8, 5, dark, 0, 0, 14), box(90, 0.8, 5, dark, 0, 0, -14));
  g.add(box(0.6, 6, 0.6, steel, -30, 0, 0), box(0.6, 6, 0.6, steel, 30, 0, 0));
  return g;
}
function clinic(): THREE.Group {
  const g = new THREE.Group();
  g.add(tower(46, 20, 28, '#f1f4f6', '#8fc3d9', 0, 0, 0, 3.6));
  g.add(box(16, 5, 4, mat(0xe5484d, { emissive: 0x7a1d20 }), 0, 20, 12));
  return g;
}
function generic(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(46, 16, 34, mat(0xd8d2c8), 0, 0, 0));
  g.add(box(50, 3, 38, mat(0x7a8794), 0, 16, 0));
  return g;
}
const BUILDERS: Record<ModelKind, () => THREE.Group> = { datacentre, semiconductor, ev, renewables, hq, housing, station, clinic, generic };

/** Tower crane shown on a site while it is under construction. */
function crane(h: number): THREE.Group {
  const g = new THREE.Group();
  const yellow = mat(0xf5b400, { rough: 0.5 });
  g.add(box(2.4, h, 2.4, yellow, 0, 0, 0));
  g.add(box(46, 1.6, 1.6, yellow, 10, h, 0));
  g.add(box(1.4, 12, 1.4, yellow, 28, h - 12, 0));
  g.add(box(8, 4, 3, dark, -12, h - 3, 0));
  return g;
}

// ---------------------------------------------------------------- optional GLB overrides
const overrides = new Map<ModelKind, THREE.Object3D | null>();
const loader = new GLTFLoader();
async function loadOverride(kind: ModelKind, onReady: () => void): Promise<void> {
  if (overrides.has(kind)) return;
  overrides.set(kind, null);
  try {
    const url = `${import.meta.env.BASE_URL}models/${kind}.glb`;
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok || (head.headers.get('content-type') ?? '').includes('html')) return; // missing file: the dev server answers with the page
    const gltf = await loader.loadAsync(url);
    overrides.set(kind, gltf.scene);
    onReady();
  } catch { /* keep the procedural model */ }
}

// ---------------------------------------------------------------- the MapLibre custom layer
interface Instance { root: THREE.Group; model: THREE.Object3D; cranes: THREE.Object3D | null; kind: ModelKind; height: number; usesOverride: boolean }

export function createSiteModelLayer(map: MlMap): { layer: CustomLayerInterface; set(sites: ModelSite[]): void } {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(-0.5, -0.6, 1); // map space: x east, y south, z up
  scene.add(sun, new THREE.HemisphereLight(0xcfe6ff, 0x8a8f78, 0.8));
  const instances = new Map<string, Instance>();
  const siteAt = new Map<string, [number, number]>();
  let renderer: THREE.WebGLRenderer | null = null;

  const heightOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o).max.y;
  const build = (kind: ModelKind): { model: THREE.Object3D; usesOverride: boolean } => {
    const o = overrides.get(kind);
    return o ? { model: o.clone(true), usesOverride: true } : { model: BUILDERS[kind](), usesOverride: false };
  };

  const layer: CustomLayerInterface = {
    id: 'kl-site-models', type: 'custom', renderingMode: '3d',
    onAdd(_m, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext, antialias: true });
      renderer.autoClear = false;
    },
    onRemove() { renderer?.dispose(); renderer = null; },
    render(_gl, args) {
      if (!renderer || !instances.size) return;
      // Positions are taken relative to the map centre and folded into the projection in double precision,
      // so models do not jitter at street zoom (a float32 matrix cannot hold a Mercator offset to metre accuracy).
      const c = map.getCenter();
      const origin = MercatorCoordinate.fromLngLat([c.lng, c.lat], 0);
      camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(new THREE.Matrix4().makeTranslation(origin.x, origin.y, 0));
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      for (const [key, inst] of instances) {
        const at = siteAt.get(key)!;
        const mc = MercatorCoordinate.fromLngLat(at, 0);
        const s = mc.meterInMercatorCoordinateUnits();
        inst.root.matrixAutoUpdate = false;
        inst.root.matrix.makeTranslation(mc.x - origin.x, mc.y - origin.y, 0).scale(new THREE.Vector3(s, -s, s)).multiply(ROT_X);
        inst.root.matrixWorldNeedsUpdate = true; // auto-update is off, so tell three the matrix changed
      }
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };

  const set = (sites: ModelSite[]) => {
    const keep = new Set(sites.map((x) => x.key));
    for (const [k, inst] of instances) if (!keep.has(k)) { scene.remove(inst.root); instances.delete(k); siteAt.delete(k); }
    for (const x of sites) {
      siteAt.set(x.key, x.at);
      let inst = instances.get(x.key);
      if (!inst || (overrides.get(x.kind) && !inst.usesOverride)) {
        if (inst) scene.remove(inst.root);
        const { model, usesOverride } = build(x.kind);
        const root = new THREE.Group();
        root.add(model);
        const height = heightOf(model);
        const cranes = crane(Math.max(40, height * 0.6 + 20));
        cranes.position.set(-60, 0, -40);
        root.add(cranes);
        scene.add(root);
        inst = { root, model, cranes, kind: x.kind, height, usesOverride };
        instances.set(x.key, inst);
        void loadOverride(x.kind, () => { set(sites); map.triggerRepaint(); });
      }
      // Under construction the building rises with progress and the crane stays; finished sites show the full model.
      inst.model.scale.y = x.done ? 1 : 0.15 + 0.85 * Math.max(0, Math.min(1, x.progress));
      if (inst.cranes) inst.cranes.visible = !x.done;
    }
    map.triggerRepaint();
  };
  return { layer, set };
}
