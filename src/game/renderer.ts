import * as THREE from "three";
import {
  BALL_R,
  BTN_R,
  GOAL_DEPTH,
  GOAL_HALF,
  HX,
  HZ,
  type Body,
  type Match,
} from "./engine";
import type { Team } from "@/lib/teams";

export type CamMode = "tv" | "rail" | "goal" | "top";

const TIERS = 12;
const TD = 2.4;
const TH = 1.6;

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  draw(ctx);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makePitchTexture() {
  const S = 20;
  return canvasTex(HX * 2 * S, HZ * 2 * S, (c) => {
    const X = (x: number) => (x + HX) * S;
    const Z = (z: number) => (z + HZ) * S;
    const stripes = 12;
    const sw = (HX * 2) / stripes;
    for (let i = 0; i < stripes; i++) {
      c.fillStyle = i % 2 ? "#2e8b3b" : "#37a046";
      c.fillRect(X(-HX + i * sw), 0, sw * S + 1, HZ * 2 * S);
    }
    // ruído sutil de grama
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,40,0"},0.035)`;
      c.fillRect(Math.random() * HX * 2 * S, Math.random() * HZ * 2 * S, 3, 12);
    }
    c.strokeStyle = "rgba(255,255,255,0.92)";
    c.fillStyle = "rgba(255,255,255,0.92)";
    c.lineWidth = 6;
    c.strokeRect(X(-HX) + 3, Z(-HZ) + 3, HX * 2 * S - 6, HZ * 2 * S - 6);
    c.beginPath();
    c.moveTo(X(0), Z(-HZ));
    c.lineTo(X(0), Z(HZ));
    c.stroke();
    c.beginPath();
    c.arc(X(0), Z(0), 9 * S, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.arc(X(0), Z(0), 0.6 * S, 0, Math.PI * 2);
    c.fill();
    for (const s of [-1, 1]) {
      // grande área
      c.strokeRect(s < 0 ? X(-HX) : X(HX - 16), Z(-21), 16 * S, 42 * S);
      // pequena área
      c.strokeRect(s < 0 ? X(-HX) : X(HX - 6), Z(-15), 6 * S, 30 * S);
      // marca do pênalti
      c.beginPath();
      c.arc(X(s * (HX - 11)), Z(0), 0.5 * S, 0, Math.PI * 2);
      c.fill();
      // meia-lua
      c.beginPath();
      if (s < 0) c.arc(X(-HX + 11), Z(0), 8 * S, -0.9, 0.9);
      else c.arc(X(HX - 11), Z(0), 8 * S, Math.PI - 0.9, Math.PI + 0.9);
      c.stroke();
    }
  });
}

function makeNetTexture() {
  const t = canvasTex(64, 64, (c) => {
    c.clearRect(0, 0, 64, 64);
    c.strokeStyle = "rgba(255,255,255,0.75)";
    c.lineWidth = 3;
    c.strokeRect(0, 0, 64, 64);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeAdTexture() {
  const t = canvasTex(1024, 64, (c) => {
    const bands = ["#0b3d91", "#f2c400", "#0b7a3b", "#c8102e"];
    const labels = ["BRASILEIRÃO SÉRIE A", "FUTEBOL DE BOTÃO", "JOGUE COM RESPONSABILIDADE", "GOOOL!"];
    for (let i = 0; i < 4; i++) {
      c.fillStyle = bands[i];
      c.fillRect(i * 256, 0, 256, 64);
      c.fillStyle = i === 1 ? "#111" : "#fff";
      c.font = "bold 22px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(labels[i], i * 256 + 128, 34, 236);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeBallTexture() {
  return canvasTex(256, 128, (c) => {
    c.fillStyle = "#fafafa";
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = "#1a1a1a";
    const spots: [number, number][] = [
      [30, 30], [90, 40], [150, 25], [215, 45], [55, 95], [125, 90], [190, 100], [240, 100], [10, 100],
    ];
    for (const [x, y] of spots) {
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(a) * 13;
        const py = y + Math.sin(a) * 13;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.fill();
    }
  });
}

function makeButtonTexture(team: Team, num: number, gk: boolean) {
  const texture = canvasTex(256, 256, (c) => {
    const isYellow = team.primary.toLowerCase().startsWith("#f2c4");
    const bg = gk ? (isYellow ? "#19b8ff" : "#f5d90a") : team.primary;
    const ring = gk ? "#111111" : team.secondary;
    const fg = gk ? "#111111" : team.text;
    c.fillStyle = bg;
    c.fillRect(0, 0, 256, 256);
    c.lineWidth = 16;
    c.strokeStyle = ring;
    c.beginPath();
    c.arc(128, 128, 104, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = fg;
    c.font = "bold 92px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(String(num), 128, 150);
  });
  if (!gk) {
    const image = new Image();
    image.onload = () => {
      const canvas = texture.image as HTMLCanvasElement;
      const c = canvas.getContext("2d")!;
      c.save();
      c.beginPath();
      c.arc(128, 78, 48, 0, Math.PI * 2);
      c.clip();
      c.drawImage(image, 72, 42, 112, 72);
      c.restore();
      c.lineWidth = 7;
      c.strokeStyle = "rgba(255,255,255,.9)";
      c.beginPath();
      c.arc(128, 78, 49, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = team.text;
      c.font = "bold 66px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(String(num), 128, 180);
      texture.needsUpdate = true;
    };
    image.src = team.crest;
  }
  return texture;
}

interface Spot {
  x: number;
  y: number;
  z: number;
  phase: number;
  speed: number;
}

export class Stadium3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private meshes = new Map<number, THREE.Object3D>();
  private ballMesh!: THREE.Mesh;
  private crowd!: THREE.InstancedMesh;
  private spots: Spot[] = [];
  private dummy = new THREE.Object3D();
  private arrow = new THREE.Group();
  private arrowShaft!: THREE.Mesh;
  private arrowHead!: THREE.Mesh;
  private selRing!: THREE.Mesh;
  private confetti!: THREE.Points;
  private confVel: Float32Array;
  private confActive = 0;
  private camPos = new THREE.Vector3(0, 30, 60);
  private camLook = new THREE.Vector3(0, 0, 0);
  private goalSide = 1;
  private celebrate = 0;
  private time = 0;
  private ro: ResizeObserver;
  private disposed = false;

  constructor(
    private container: HTMLElement,
    private match: Match,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";

    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.5, 700);
    this.scene.background = new THREE.Color(0x060a14);
    this.scene.fog = new THREE.Fog(0x060a14, 160, 420);

    this.confVel = new Float32Array(400 * 3);

    this.buildLights();
    this.buildPitch();
    this.buildGoals();
    this.buildRails();
    this.buildStands();
    this.buildTowers();
    this.buildPlayers();
    this.buildIndicators();
    this.buildConfetti();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  // ---------------------------------------------------------------
  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2b4a2b, 0.75));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
    sun.position.set(25, 90, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 50;
    sc.bottom = -50;
    sc.near = 10;
    sc.far = 220;
    sun.shadow.bias = -0.0004;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9fb8ff, 0.5);
    fill.position.set(-40, 50, -50);
    this.scene.add(fill);
  }

  private buildPitch() {
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(HX * 2, HZ * 2),
      new THREE.MeshStandardMaterial({ map: makePitchTexture(), roughness: 0.95 }),
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.scene.add(pitch);

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 300),
      new THREE.MeshStandardMaterial({ color: 0x1d5a2b, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.03;
    outer.receiveShadow = true;
    this.scene.add(outer);

    // pista ao redor
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(HX * 2 + 20, HZ * 2 + 20),
      new THREE.MeshStandardMaterial({ color: 0x266b34, roughness: 1 }),
    );
    track.rotation.x = -Math.PI / 2;
    track.position.y = -0.02;
    track.receiveShadow = true;
    this.scene.add(track);
  }

  private buildGoals() {
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.2 });
    const netTex = makeNetTexture();
    const H = 5;
    const netMat = (rx: number, ry: number) => {
      const t = netTex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      return new THREE.MeshBasicMaterial({
        map: t,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    };
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const post = (z: number) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, H, 12), white);
        m.position.set(s * HX, H / 2, z);
        m.castShadow = true;
        g.add(m);
      };
      post(-GOAL_HALF);
      post(GOAL_HALF);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, GOAL_HALF * 2, 12), white);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(s * HX, H, 0);
      bar.castShadow = true;
      g.add(bar);
      // rede: fundo
      const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF * 2, H), netMat(GOAL_HALF * 2 / 1.2, H / 1.2));
      back.rotation.y = Math.PI / 2;
      back.position.set(s * (HX + GOAL_DEPTH), H / 2, 0);
      g.add(back);
      // topo
      const top = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HALF * 2), netMat(GOAL_DEPTH / 1.2, GOAL_HALF * 2 / 1.2));
      top.rotation.x = Math.PI / 2;
      top.position.set(s * (HX + GOAL_DEPTH / 2), H, 0);
      g.add(top);
      // laterais
      for (const z of [-GOAL_HALF, GOAL_HALF]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, H), netMat(GOAL_DEPTH / 1.2, H / 1.2));
        side.position.set(s * (HX + GOAL_DEPTH / 2), H / 2, z);
        g.add(side);
      }
      // hastes de trás
      for (const z of [-GOAL_HALF, GOAL_HALF]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, H, 8), white);
        rod.position.set(s * (HX + GOAL_DEPTH), H / 2, z);
        g.add(rod);
      }
      this.scene.add(g);
    }
  }

  private buildRails() {
    const adTex = makeAdTexture();
    const mk = (len: number, rot: boolean) => {
      const t = adTex.clone();
      t.needsUpdate = true;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(Math.max(1, len / 32), 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    };
    const H = 2.2;
    const add = (len: number, x: number, z: number, rot: boolean) => {
      const geo = new THREE.BoxGeometry(rot ? 0.8 : len, H, rot ? len : 0.8);
      const m = new THREE.Mesh(geo, mk(len, rot));
      m.position.set(x, H / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    for (const s of [-1, 1]) {
      add(HX * 2 + 1.6, 0, s * (HZ + 0.4), false);
      const seg = HZ - GOAL_HALF;
      for (const t of [-1, 1]) {
        add(seg, s * (HX + 0.4), t * (GOAL_HALF + seg / 2), true);
      }
    }
  }

  private buildStands() {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x39435a, roughness: 0.9 });
    const [home, away] = this.match.teams;
    const palette = (team: Team | null) => {
      const base = [0xe8eaf0, 0xffd54a, 0x5aa9ff, 0xff5a5a, 0x66d17a, 0x222633];
      const cols: number[] = [];
      if (team) {
        const p = new THREE.Color(team.primary).getHex();
        const s = new THREE.Color(team.secondary).getHex();
        for (let i = 0; i < 6; i++) cols.push(p);
        for (let i = 0; i < 3; i++) cols.push(s);
        cols.push(0xffffff);
        cols.push(base[Math.floor(Math.random() * base.length)]);
      } else {
        const a = [new THREE.Color(home.primary).getHex(), new THREE.Color(away.primary).getHex()];
        cols.push(a[0], a[0], a[1], a[1], ...base);
      }
      return cols;
    };

    const rows: {
      x: number;
      y: number;
      z: number;
      team: Team | null;
    }[] = [];

    const addTier = (
      sx: number,
      sz: number,
      axis: "side" | "end",
      i: number,
      team: Team | null,
    ) => {
      const h = (i + 1) * TH;
      if (axis === "side") {
        const zc = sz * (HZ + 12 + i * TD + TD / 2);
        const len = 128;
        const box = new THREE.Mesh(new THREE.BoxGeometry(len, h, TD), concrete);
        box.position.set(0, h / 2, zc);
        box.receiveShadow = true;
        this.scene.add(box);
        for (let x = -len / 2 + 1; x < len / 2; x += 1.3) rows.push({ x, y: h, z: zc, team });
      } else {
        const xc = sx * (64 + i * TD + TD / 2);
        const len = 88;
        const box = new THREE.Mesh(new THREE.BoxGeometry(TD, h, len), concrete);
        box.position.set(xc, h / 2, 0);
        box.receiveShadow = true;
        this.scene.add(box);
        for (let z = -len / 2 + 1; z < len / 2; z += 1.3) rows.push({ x: xc, y: h, z, team });
      }
    };

    for (let i = 0; i < TIERS; i++) {
      addTier(0, -1, "side", i, null);
      addTier(0, 1, "side", i, null);
      addTier(-1, 0, "end", i, home);
      addTier(1, 0, "end", i, away);
    }

    // muro de fundo/cobertura visual
    const back = new THREE.MeshStandardMaterial({ color: 0x141a29, roughness: 1 });
    const wallH = TIERS * TH + 14;
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(150, wallH, 1), back);
      w.position.set(0, wallH / 2, s * (HZ + 12 + TIERS * TD + 1));
      this.scene.add(w);
      const w2 = new THREE.Mesh(new THREE.BoxGeometry(1, wallH, 140), back);
      w2.position.set(s * (64 + TIERS * TD + 1), wallH / 2, 0);
      this.scene.add(w2);
    }

    const geo = new THREE.BoxGeometry(0.85, 1.25, 0.65);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    this.crowd = new THREE.InstancedMesh(geo, mat, rows.length);
    const c = new THREE.Color();
    rows.forEach((r, idx) => {
      const pal = palette(r.team);
      c.setHex(pal[Math.floor(Math.random() * pal.length)]);
      c.multiplyScalar(0.7 + Math.random() * 0.4);
      this.crowd.setColorAt(idx, c);
      this.spots.push({
        x: r.x + (Math.random() - 0.5) * 0.15,
        y: r.y + 0.62,
        z: r.z,
        phase: Math.random() * 10,
        speed: 4 + Math.random() * 5,
      });
    });
    this.crowd.frustumCulled = false;
    this.scene.add(this.crowd);
    this.updateCrowd();
  }

  private updateCrowd() {
    const amp = 0.03 + this.celebrate * 0.9;
    const t = this.time;
    const d = this.dummy;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const b = Math.abs(Math.sin(t * s.speed + s.phase)) * amp;
      d.position.set(s.x, s.y + b, s.z);
      d.updateMatrix();
      this.crowd.setMatrixAt(i, d.matrix);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  private buildTowers() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x8a94a8, roughness: 0.5, metalness: 0.5 });
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 52, 8), metal);
        pole.position.y = 26;
        g.add(pole);
        const head = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 1.2), lamp);
        head.position.y = 54;
        g.add(head);
        g.position.set(sx * 88, 0, sz * 62);
        g.lookAt(0, 54, 0);
        this.scene.add(g);
      }
    }
  }

  // ---------------------------------------------------------------
  private buildPlayers() {
    const ballMat = new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.4 });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), ballMat);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);

    const bodyGeo = new THREE.CylinderGeometry(BTN_R, BTN_R * 1.05, 0.9, 48);
    const topGeo = new THREE.CircleGeometry(BTN_R * 0.97, 48);
    const ringGeo = new THREE.RingGeometry(BTN_R * 0.97, BTN_R * 1.03, 48);
    for (const b of this.match.bodies) {
      if (b.kind === "ball") continue;
      const team = this.match.teams[b.team as 0 | 1];
      const g = new THREE.Group();
      g.userData.bodyId = b.id;
      const isGk = b.kind === "gk";
      const bodyMat = new THREE.MeshStandardMaterial({
        color: isGk ? 0x222222 : new THREE.Color(team.primary),
        roughness: 0.35,
        metalness: 0.1,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.userData.bodyId = b.id;
      body.position.y = 0.45;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      const top = new THREE.Mesh(
        topGeo,
        new THREE.MeshStandardMaterial({
          map: makeButtonTexture(team, b.num, isGk),
          roughness: 0.3,
        }),
      );
      top.userData.bodyId = b.id;
      top.rotation.x = -Math.PI / 2;
      top.rotation.z = b.team === 0 ? Math.PI / 2 : -Math.PI / 2;
      top.position.y = 0.92;
      g.add(top);
      const rim = new THREE.Mesh(
        ringGeo,
        new THREE.MeshStandardMaterial({ color: new THREE.Color(team.secondary), roughness: 0.3 }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.925;
      g.add(rim);
      this.scene.add(g);
      this.meshes.set(b.id, g);
    }
  }

  private buildIndicators() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false });
    this.arrowShaft = new THREE.Mesh(new THREE.BoxGeometry(1, 0.35, 0.7), mat);
    this.arrowHead = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.4, 16), mat);
    this.arrowHead.rotation.z = -Math.PI / 2;
    this.arrow.add(this.arrowShaft, this.arrowHead);
    this.arrow.renderOrder = 10;
    this.arrowShaft.renderOrder = 10;
    this.arrowHead.renderOrder = 10;
    this.arrow.visible = false;
    this.scene.add(this.arrow);

    this.selRing = new THREE.Mesh(
      new THREE.RingGeometry(BTN_R * 1.15, BTN_R * 1.45, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 0.08;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
  }

  private buildConfetti() {
    const n = 400;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.confetti = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 1.1, vertexColors: true, sizeAttenuation: true }),
    );
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    this.scene.add(this.confetti);
  }

  /** Dispara comemoração: torcida pula e confete sai do gol. */
  celebrateGoal(team: 0 | 1) {
    this.celebrate = 1;
    const t = this.match.teams[team];
    const cols = [new THREE.Color(t.primary), new THREE.Color(t.secondary), new THREE.Color(0xffffff), new THREE.Color(0xffd54a)];
    const pos = this.confetti.geometry.getAttribute("position") as THREE.BufferAttribute;
    const col = this.confetti.geometry.getAttribute("color") as THREE.BufferAttribute;
    const gx = (team === 0 ? 1 : -1) * (HX + 2);
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      pos.setXYZ(i, gx + (Math.random() - 0.5) * 4, 4 + Math.random() * 2, (Math.random() - 0.5) * GOAL_HALF * 1.6);
      this.confVel[i * 3] = -(team === 0 ? 1 : -1) * (6 + Math.random() * 16);
      this.confVel[i * 3 + 1] = 10 + Math.random() * 22;
      this.confVel[i * 3 + 2] = (Math.random() - 0.5) * 30;
      const c = cols[Math.floor(Math.random() * cols.length)];
      col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.confActive = 4;
    this.confetti.visible = true;
  }

  // ---------------------------------------------------------------
  resize() {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 70 : w / h < 1.5 ? 56 : 46;
    this.camera.updateProjectionMatrix();
  }

  getCanvas() {
    return this.renderer.domElement;
  }

  /** Converte uma posição da tela no ponto correspondente do gramado. */
  pointOnPitch(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    const point = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)
      ? { x: point.x, z: point.z }
      : null;
  }

  pickButton(clientX: number, clientY: number, team: 0 | 1) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, this.camera);
    for (const hit of ray.intersectObjects([...this.meshes.values()], true)) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object.userData.bodyId === undefined) object = object.parent;
      const id = object?.userData.bodyId as number | undefined;
      const body = id === undefined ? undefined : this.match.bodies.find((b) => b.id === id);
      if (body?.team === team && body.kind === "button") return body;
    }
    return null;
  }

  private syncBody(b: Body, dt: number) {
    const m = this.meshes.get(b.id);
    if (!m) return;
    m.position.set(b.x, 0, b.z);
  }

  render(dt: number, simDt: number, mode: CamMode) {
    if (this.disposed) return;
    this.time += dt;
    const match = this.match;

    for (const b of match.bodies) {
      if (b.kind === "ball") continue;
      this.syncBody(b, dt);
    }
    const ball = match.ball;
    this.ballMesh.position.set(ball.x, BALL_R, ball.z);
    const sp = Math.hypot(ball.vx, ball.vz);
    if (sp > 0.01) {
      const axis = new THREE.Vector3(ball.vz, 0, -ball.vx).normalize();
      this.ballMesh.rotateOnWorldAxis(axis, (sp * simDt) / BALL_R);
    }

    // indicadores de jogada
    const plan = match.plan;
    if (plan && match.phase === "thinking") {
      const team = match.teams[match.turn];
      const color = new THREE.Color(team.primary === "#ffffff" || team.primary === "#f2f2f2" || team.primary === "#f5f5f5" || team.primary === "#f4f4f4" ? team.secondary : team.primary);
      const bright = color.clone().lerp(new THREE.Color(0xffffff), 0.35);
      (this.arrowShaft.material as THREE.MeshBasicMaterial).color.copy(bright);
      (this.selRing.material as THREE.MeshBasicMaterial).color.copy(bright);
      const len = 3 + (plan.speed / 88) * 14;
      const shaftLen = Math.max(0.5, len - 2.4);
      const a = Math.atan2(plan.dz, plan.dx);
      this.arrow.visible = true;
      this.arrow.position.set(plan.body.x, 1.3, plan.body.z);
      this.arrow.rotation.y = -a;
      this.arrowShaft.scale.x = shaftLen;
      this.arrowShaft.position.x = BTN_R + shaftLen / 2;
      this.arrowHead.position.x = BTN_R + shaftLen + 1.1;
      this.selRing.visible = true;
      this.selRing.position.x = plan.body.x;
      this.selRing.position.z = plan.body.z;
      const pulse = 1 + Math.sin(this.time * 9) * 0.08;
      this.selRing.scale.set(pulse, pulse, pulse);
    } else {
      this.arrow.visible = false;
      this.selRing.visible = false;
    }

    // torcida
    if (match.phase === "goal") this.celebrate = Math.min(1, this.celebrate + dt * 2);
    else this.celebrate = Math.max(0, this.celebrate - dt * 0.5);
    this.updateCrowd();

    // confete
    if (this.confActive > 0) {
      this.confActive -= dt;
      const pos = this.confetti.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let vy = this.confVel[i * 3 + 1];
        vy -= 26 * dt;
        this.confVel[i * 3 + 1] = vy;
        let y = pos.getY(i) + vy * dt;
        if (y < 0.1) {
          y = 0.1;
          this.confVel[i * 3] = 0;
          this.confVel[i * 3 + 1] = 0;
          this.confVel[i * 3 + 2] = 0;
        }
        pos.setXYZ(
          i,
          pos.getX(i) + this.confVel[i * 3] * dt,
          y,
          pos.getZ(i) + this.confVel[i * 3 + 2] * dt,
        );
      }
      pos.needsUpdate = true;
      if (this.confActive <= 0) this.confetti.visible = false;
    }

    this.updateCamera(dt, mode);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(dt: number, mode: CamMode) {
    const b = this.match.ball;
    const bx = b.x;
    const bz = b.z;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();

    if (Math.abs(bx) > 14) this.goalSide = Math.sign(bx);

    if (this.match.phase === "goal") {
      const gx = THREE.MathUtils.clamp(bx, -46, 46);
      pos.set(gx * 0.9, 8, HZ + 8);
      look.set(bx, 1, bz);
      if (mode === "goal") {
        pos.set(this.goalSide * (HX + 22), 10, bz * 0.5 + 6);
      }
    } else {
      switch (mode) {
        case "tv":
          pos.set(bx * 0.55, 30, 60);
          look.set(bx * 0.78, 0, 1);
          break;
        case "rail":
          pos.set(bx * 0.85, 12, HZ + 9);
          look.set(bx, 0, bz * 0.5 - 3);
          break;
        case "goal":
          pos.set(this.goalSide * (HX + 20), 12.5, bz * 0.25);
          look.set(bx * 0.85, 0, bz * 0.6);
          break;
        case "top":
          pos.set(bx * 0.4, 84, 22);
          look.set(bx * 0.4, 0, 0);
          break;
      }
    }
    const k = 1 - Math.exp(-2.6 * dt);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, 1 - Math.exp(-4 * dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  dispose() {
    this.disposed = true;
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) {
        const mm = mat as THREE.MeshStandardMaterial;
        mm.map?.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
