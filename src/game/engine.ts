import type { Team } from "@/lib/teams";

// ---------- Dimensões do campo (unidades do jogo) ----------
export const HX = 50; // meio comprimento (linha de fundo)
export const HZ = 32; // meia largura (linha lateral)
export const GOAL_HALF = 12.5; // meia largura do gol
export const GOAL_DEPTH = 6;
export const BTN_R = 2.6;
export const BALL_R = 1.3;

const STEP = 1 / 240;
const HALF_SECONDS = 90; // tempo de "física" por tempo de jogo
const THINK_TIME = 1.15;
const GOAL_TIME = 3.2;
const HALFTIME_TIME = 3.0;
const MAX_V = 88;

export type Kind = "ball" | "button" | "gk";

export interface Body {
  id: number;
  kind: Kind;
  team: 0 | 1 | -1;
  num: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  invM: number;
  damp: number;
  track: number; // usado pelo goleiro
}

export interface Plan {
  body: Body;
  dx: number;
  dz: number;
  speed: number;
  good: boolean;
}

export type Phase = "thinking" | "moving" | "goal" | "halftime" | "ended";

export type MatchEvent =
  | { type: "goal"; team: 0 | 1; own: boolean; minute: number }
  | { type: "kickoff"; team: 0 | 1 }
  | { type: "halftime" }
  | { type: "fulltime" }
  | { type: "shot"; team: 0 | 1; num: number; power: number }
  | { type: "hit"; intensity: number; ball: boolean }
  | { type: "post" };

const gauss = () => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Formação do time 0 (ataca para +x). O time 1 é espelhado.
const FORMATION: { num: number; x: number; z: number; kind: Kind }[] = [
  { num: 1, x: -(HX - 3.4), z: 0, kind: "gk" },
  { num: 2, x: -34, z: -11, kind: "button" },
  { num: 3, x: -34, z: 11, kind: "button" },
  { num: 4, x: -22, z: -18, kind: "button" },
  { num: 5, x: -22, z: 18, kind: "button" },
  { num: 6, x: -12, z: -9, kind: "button" },
  { num: 7, x: -12, z: 9, kind: "button" },
];

export class Match {
  teams: [Team, Team];
  bodies: Body[] = [];
  ball: Body;
  gks: [Body, Body];
  buttons: [Body[], Body[]] = [[], []];
  posts: { x: number; z: number; r: number }[] = [];

  score: [number, number] = [0, 0];
  clock = 0; // segundos de física
  half: 1 | 2 = 1;
  phase: Phase = "thinking";
  turn: 0 | 1 = 0;
  plan: Plan | null = null;
  lastScorer: 0 | 1 | null = null;
  readonly humanTeam: 0 | 1 | null;
  readonly localPlayers: boolean;

  private timer = THINK_TIME;
  private movesThisTurn = 0;
  private moveTime = 0;
  private mover: Body | null = null;
  private moverTouched = false;
  private lastTouch: 0 | 1 | -1 = -1;
  private acc = 0;
  private listeners: ((e: MatchEvent) => void)[] = [];
  private hitCooldown = 0;

  constructor(home: Team, away: Team, spectator = false, localPlayers = false) {
    this.localPlayers = localPlayers;
    this.humanTeam = spectator ? null : 0;
    this.teams = [home, away];
    let id = 0;
    this.ball = {
      id: id++,
      kind: "ball",
      team: -1,
      num: 0,
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      r: BALL_R,
      invM: 1,
      damp: 0.7,
      track: 0,
    };
    this.bodies.push(this.ball);
    const gks: Body[] = [];
    for (const t of [0, 1] as const) {
      for (const f of FORMATION) {
        const b: Body = {
          id: id++,
          kind: f.kind,
          team: t,
          num: f.num,
          x: 0,
          z: 0,
          vx: 0,
          vz: 0,
          r: BTN_R,
          invM: f.kind === "gk" ? 0 : 1 / 3,
          damp: 3.4,
          track: 0,
        };
        this.bodies.push(b);
        if (f.kind === "gk") gks.push(b);
        else this.buttons[t].push(b);
      }
    }
    this.gks = [gks[0], gks[1]];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        this.posts.push({ x: sx * HX, z: sz * GOAL_HALF, r: 0.6 });
      }
    }
    this.resetPositions(0, false);
    this.prepareTurn();
  }

  on(fn: (e: MatchEvent) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(e: MatchEvent) {
    for (const l of this.listeners) l(e);
  }

  get minute() {
    return Math.min(90, Math.floor((this.clock / (HALF_SECONDS * 2)) * 90));
  }

  get goalProgress() {
    return this.phase === "goal" ? 1 - this.timer / GOAL_TIME : 0;
  }

  // ------------------------------------------------------------------
  resetPositions(kickTeam: 0 | 1, announce = true) {
    for (const t of [0, 1] as const) {
      const sign = t === 0 ? 1 : -1;
      const list = this.bodies.filter((b) => b.team === t);
      for (const b of list) {
        const f = FORMATION.find((ff) => ff.num === b.num)!;
        let fx = f.x;
        let fz = f.z;
        if (t === kickTeam) {
          if (b.num === 6) {
            fx = -6;
            fz = 0;
          } else if (b.num === 7) {
            fx = -10;
            fz = 12;
          }
        } else if (b.num === 6 || b.num === 7) {
          fx = -13;
        }
        b.x = fx * sign;
        b.z = fz * sign;
        b.vx = 0;
        b.vz = 0;
        b.track = 0;
      }
    }
    this.ball.x = 0;
    this.ball.z = 0;
    this.ball.vx = 0;
    this.ball.vz = 0;
    this.turn = kickTeam;
    this.movesThisTurn = 0;
    this.lastTouch = -1;
    if (announce) this.emit({ type: "kickoff", team: kickTeam });
  }

  // ------------------------------------------------------------------
  // IA: escolhe qual botão bater, direção e força.
  private planMove() {
    const team = this.turn;
    const dirX = team === 0 ? 1 : -1;
    const ball = this.ball;
    const skill = clamp((this.teams[team].strength - 60) / 30, 0, 1);
    const sigma = 0.02 + (1 - skill) * 0.1;

    const gz = (Math.random() * 2 - 1) * GOAL_HALF * 0.6;
    const goal = { x: dirX * HX, z: gz };
    let ax = goal.x - ball.x;
    let az = goal.z - ball.z;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    const distGoal = al;

    const others = this.bodies.filter((b) => b.kind !== "ball");

    let best: { s: Body; tx: number; tz: number; good: boolean; score: number } | null = null;
    for (const s of this.buttons[team]) {
      const bx = ball.x - s.x;
      const bz = ball.z - s.z;
      const dist = Math.hypot(bx, bz) || 0.001;
      const dot = (bx / dist) * ax + (bz / dist) * az;
      const good = dot > 0.35;
      let tx = ball.x;
      let tz = ball.z;
      if (good) {
        tx = ball.x - ax * (s.r + ball.r);
        tz = ball.z - az * (s.r + ball.r);
      }
      // penaliza caminhos bloqueados por outros botões
      let blocked = 0;
      const sx = tx - s.x;
      const sz = tz - s.z;
      const sl2 = sx * sx + sz * sz || 1;
      for (const o of others) {
        if (o === s) continue;
        const t = clamp(((o.x - s.x) * sx + (o.z - s.z) * sz) / sl2, 0, 1);
        const px = s.x + sx * t;
        const pz = s.z + sz * t;
        if (Math.hypot(o.x - px, o.z - pz) < o.r + s.r * 0.95) blocked += 1;
      }
      const score =
        dist + (good ? 0 : 45) + blocked * 30 + Math.random() * 8 * (1.4 - skill * 0.6);
      if (!best || score < best.score) best = { s, tx, tz, good, score };
    }
    const { s, tx, tz, good } = best!;

    let dx = tx - s.x;
    let dz = tz - s.z;
    const distT = Math.hypot(dx, dz) || 0.001;
    dx /= distT;
    dz /= distT;
    const ang = gauss() * sigma;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const ndx = dx * c - dz * sn;
    const ndz = dx * sn + dz * c;

    let vHit = good ? clamp(22 + distGoal * 0.55, 24, 52) : 14;
    if (good && distGoal < 16) vHit = 32;
    let v0 = s.damp * distT + vHit;
    v0 *= 1 + gauss() * 0.05 * (1.5 - skill);
    v0 = clamp(v0, 10, MAX_V);

    this.plan = { body: s, dx: ndx, dz: ndz, speed: v0, good };
  }

  private prepareTurn() {
    this.plan = null;
    if (!this.isHumanTurn) this.planMove();
  }

  get isHumanTurn() {
    return this.localPlayers || this.turn === this.humanTeam;
  }

  /** Inicia a mira do jogador humano em um de seus botões. */
  beginHumanAim(bodyId: number) {
    if (!this.isHumanTurn || this.phase !== "thinking") return false;
    const body = this.buttons[this.turn].find((b) => b.id === bodyId);
    if (!body) return false;
    this.plan = { body, dx: 1, dz: 0, speed: 0, good: true };
    return true;
  }

  /** Atualiza a direção/força da puxada. Retorna a força de 0 a 1. */
  aimHuman(dx: number, dz: number) {
    if (this.phase !== "thinking" || !this.isHumanTurn || !this.plan) return 0;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.01) {
      this.plan.speed = 0;
      return 0;
    }
    this.plan.dx = dx / distance;
    this.plan.dz = dz / distance;
    this.plan.speed = clamp(distance * 4.4, 8, MAX_V);
    return this.plan.speed / MAX_V;
  }

  cancelHumanAim() {
    if (this.phase === "thinking" && this.isHumanTurn) this.plan = null;
  }

  shootHuman() {
    if (this.phase !== "thinking" || !this.isHumanTurn || !this.plan || this.plan.speed < 8) {
      this.cancelHumanAim();
      return false;
    }
    this.launch();
    return true;
  }

  private launch() {
    const p = this.plan;
    if (!p) return;
    p.body.vx = p.dx * p.speed;
    p.body.vz = p.dz * p.speed;
    this.mover = p.body;
    this.moverTouched = false;
    this.moveTime = 0;
    this.phase = "moving";
    this.emit({ type: "shot", team: this.turn, num: p.body.num, power: p.speed / MAX_V });
    this.plan = null;
  }

  private endMove() {
    for (const b of this.bodies) {
      if (b.kind !== "gk") {
        b.vx = 0;
        b.vz = 0;
      }
    }
    const keep = this.moverTouched && this.lastTouch === this.turn;
    this.movesThisTurn++;
    if (keep && this.movesThisTurn < 3) {
      // mantém a vez
    } else {
      this.turn = this.turn === 0 ? 1 : 0;
      this.movesThisTurn = 0;
    }
    this.mover = null;

    const total = HALF_SECONDS * 2;
    if (this.half === 1 && this.clock >= HALF_SECONDS) {
      this.phase = "halftime";
      this.timer = HALFTIME_TIME;
      this.emit({ type: "halftime" });
      return;
    }
    if (this.half === 2 && this.clock >= total) {
      this.phase = "ended";
      this.emit({ type: "fulltime" });
      return;
    }
    this.phase = "thinking";
    this.timer = THINK_TIME;
    this.prepareTurn();
  }

  // ------------------------------------------------------------------
  /** Avança a simulação em `dt` segundos (já multiplicado pela velocidade). */
  update(dt: number) {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.tick(STEP);
    }
  }

  private tick(h: number) {
    this.stepPhysics(h);
    this.hitCooldown -= h;

    switch (this.phase) {
      case "thinking":
        if (!this.isHumanTurn) {
          this.timer -= h;
          if (this.timer <= 0) this.launch();
        }
        break;
      case "moving": {
        this.clock += h;
        this.moveTime += h;
        const b = this.ball;
        if (Math.abs(b.z) < GOAL_HALF) {
          if (b.x > HX + BALL_R) return this.goal(0);
          if (b.x < -HX - BALL_R) return this.goal(1);
        }
        if (this.moveTime > 4.5) {
          // atrito extra para encerrar jogadas longas
          for (const o of this.bodies) {
            if (o.kind !== "gk") {
              o.vx *= 1 - 3 * h;
              o.vz *= 1 - 3 * h;
            }
          }
        }
        if (this.isSettled() || this.moveTime > 9) this.endMove();
        break;
      }
      case "goal":
        this.timer -= h;
        if (this.timer <= 0) {
          const kick = (this.lastScorer === 0 ? 1 : 0) as 0 | 1;
          this.resetPositions(kick);
          this.phase = "thinking";
          this.timer = THINK_TIME;
          this.prepareTurn();
          // fim de jogo logo após o gol, se o tempo já acabou
          if (this.half === 1 && this.clock >= HALF_SECONDS) {
            this.phase = "halftime";
            this.timer = HALFTIME_TIME;
            this.emit({ type: "halftime" });
          } else if (this.half === 2 && this.clock >= HALF_SECONDS * 2) {
            this.phase = "ended";
            this.emit({ type: "fulltime" });
          }
        }
        break;
      case "halftime":
        this.timer -= h;
        if (this.timer <= 0) {
          this.half = 2;
          this.resetPositions(1);
          this.phase = "thinking";
          this.timer = THINK_TIME;
          this.prepareTurn();
        }
        break;
      case "ended":
        break;
    }
  }

  private goal(team: 0 | 1) {
    this.score[team]++;
    this.lastScorer = team;
    // gol contra: última toque foi do time que sofreu o gol
    const own = this.lastTouch === (team === 0 ? 1 : 0);
    this.phase = "goal";
    this.timer = GOAL_TIME;
    this.moverClear();
    this.emit({ type: "goal", team, own, minute: this.minute });
  }

  private moverClear() {
    this.mover = null;
    this.plan = null;
    for (const b of this.bodies) {
      if (b.kind === "button") {
        b.vx = 0;
        b.vz = 0;
      }
    }
  }

  private isSettled() {
    for (const b of this.bodies) {
      if (b.kind === "gk") continue;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > (b.kind === "ball" ? 1.2 : 0.7)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------
  private stepPhysics(h: number) {
    const bodies = this.bodies;

    // goleiros (cinemáticos)
    for (const gk of this.gks) {
      const skill = clamp((this.teams[gk.team as 0 | 1].strength - 60) / 30, 0, 1);
      const rate = 1.6 + skill * 1.6;
      gk.track += (this.ball.z - gk.track) * (1 - Math.exp(-rate * h));
      const lim = GOAL_HALF - gk.r - 0.4;
      const target = clamp(gk.track * 0.9, -lim, lim);
      const maxV = 5 + skill * 6;
      gk.vz = clamp((target - gk.z) * 8, -maxV, maxV);
      gk.vx = 0;
      gk.z += gk.vz * h;
    }

    // integração + atrito
    for (const b of bodies) {
      if (b.kind === "gk") continue;
      const f = Math.exp(-b.damp * h);
      b.vx *= f;
      b.vz *= f;
      b.x += b.vx * h;
      b.z += b.vz * h;
    }

    // colisões corpo-corpo
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const c = bodies[j];
        if (a.kind === "gk" && c.kind === "gk") continue;
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const rr = a.r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const nx = dx / d;
        const nz = dz / d;
        const total = a.invM + c.invM;
        if (total === 0) continue;
        const overlap = rr - d;
        a.x -= nx * overlap * (a.invM / total);
        a.z -= nz * overlap * (a.invM / total);
        c.x += nx * overlap * (c.invM / total);
        c.z += nz * overlap * (c.invM / total);
        const rel = (c.vx - a.vx) * nx + (c.vz - a.vz) * nz;
        if (rel < 0) {
          const e = a.kind === "ball" || c.kind === "ball" ? 0.82 : 0.6;
          const imp = (-(1 + e) * rel) / total;
          a.vx -= imp * a.invM * nx;
          a.vz -= imp * a.invM * nz;
          c.vx += imp * c.invM * nx;
          c.vz += imp * c.invM * nz;
          const intensity = -rel;
          const isBall = a.kind === "ball" || c.kind === "ball";
          if (isBall) {
            const other = a.kind === "ball" ? c : a;
            this.lastTouch = other.team as 0 | 1;
            if (other === this.mover) this.moverTouched = true;
          }
          if (intensity > 4 && this.hitCooldown <= 0) {
            this.hitCooldown = 0.04;
            this.emit({ type: "hit", intensity, ball: isBall });
          }
        }
      }
    }

    // traves (só a bola)
    const ball = this.ball;
    for (const p of this.posts) {
      const dx = ball.x - p.x;
      const dz = ball.z - p.z;
      const rr = ball.r + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.0001;
        const nx = dx / d;
        const nz = dz / d;
        ball.x = p.x + nx * rr;
        ball.z = p.z + nz * rr;
        const vn = ball.vx * nx + ball.vz * nz;
        if (vn < 0) {
          ball.vx -= 1.8 * vn * nx;
          ball.vz -= 1.8 * vn * nz;
          if (-vn > 6) this.emit({ type: "post" });
        }
      }
    }

    // paredes: botões
    for (const b of bodies) {
      if (b.kind !== "button") continue;
      const lx = HX - b.r;
      const lz = HZ - b.r;
      if (b.x > lx) {
        b.x = lx;
        if (b.vx > 0) b.vx *= -0.5;
      } else if (b.x < -lx) {
        b.x = -lx;
        if (b.vx < 0) b.vx *= -0.5;
      }
      if (b.z > lz) {
        b.z = lz;
        if (b.vz > 0) b.vz *= -0.5;
      } else if (b.z < -lz) {
        b.z = -lz;
        if (b.vz < 0) b.vz *= -0.5;
      }
    }

    // paredes: bola (com boca de gol)
    const R = ball.r;
    const e = 0.72;
    const goalHalfZ = GOAL_HALF - R;
    if (ball.z > HZ - R) {
      ball.z = HZ - R;
      if (ball.vz > 0) ball.vz *= -e;
    } else if (ball.z < -(HZ - R)) {
      ball.z = -(HZ - R);
      if (ball.vz < 0) ball.vz *= -e;
    }
    const ax = Math.abs(ball.x);
    const sx = Math.sign(ball.x) || 1;
    if (ax > HX) {
      // dentro do gol: rede lateral e do fundo
      if (Math.abs(ball.z) > goalHalfZ) {
        ball.z = Math.sign(ball.z) * goalHalfZ;
        ball.vz *= -0.3;
      }
      if (ax > HX + GOAL_DEPTH - R) {
        ball.x = sx * (HX + GOAL_DEPTH - R);
        if (ball.vx * sx > 0) ball.vx *= -0.25;
        ball.vz *= 0.6;
      }
    } else if (ax > HX - R && Math.abs(ball.z) > GOAL_HALF) {
      ball.x = sx * (HX - R);
      if (ball.vx * sx > 0) ball.vx *= -e;
    }

    for (const b of bodies) {
      if (b.kind === "gk") continue;
      const v2 = b.vx * b.vx + b.vz * b.vz;
      if (v2 > MAX_V * MAX_V * 2.2) {
        const k = (MAX_V * 1.48) / Math.sqrt(v2);
        b.vx *= k;
        b.vz *= k;
      }
    }
  }
}
