(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/game/engine.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BALL_R",
    ()=>BALL_R,
    "BTN_R",
    ()=>BTN_R,
    "GOAL_DEPTH",
    ()=>GOAL_DEPTH,
    "GOAL_HALF",
    ()=>GOAL_HALF,
    "HX",
    ()=>HX,
    "HZ",
    ()=>HZ,
    "Match",
    ()=>Match
]);
const HX = 50; // meio comprimento (linha de fundo)
const HZ = 32; // meia largura (linha lateral)
const GOAL_HALF = 12.5; // meia largura do gol
const GOAL_DEPTH = 6;
const BTN_R = 2.6;
const BALL_R = 1.3;
const STEP = 1 / 240;
const HALF_SECONDS = 90; // tempo de "física" por tempo de jogo
const THINK_TIME = 1.15;
const GOAL_TIME = 3.2;
const HALFTIME_TIME = 3.0;
const MAX_V = 88;
const gauss = ()=>{
    let u = 0;
    let v = 0;
    while(u === 0)u = Math.random();
    while(v === 0)v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (v, a, b)=>Math.max(a, Math.min(b, v));
// Formação do time 0 (ataca para +x). O time 1 é espelhado.
const FORMATION = [
    {
        num: 1,
        x: -(HX - 3.4),
        z: 0,
        kind: "gk"
    },
    {
        num: 2,
        x: -34,
        z: -11,
        kind: "button"
    },
    {
        num: 3,
        x: -34,
        z: 11,
        kind: "button"
    },
    {
        num: 4,
        x: -22,
        z: -18,
        kind: "button"
    },
    {
        num: 5,
        x: -22,
        z: 18,
        kind: "button"
    },
    {
        num: 6,
        x: -12,
        z: -9,
        kind: "button"
    },
    {
        num: 7,
        x: -12,
        z: 9,
        kind: "button"
    }
];
class Match {
    teams;
    bodies = [];
    ball;
    gks;
    buttons = [
        [],
        []
    ];
    posts = [];
    score = [
        0,
        0
    ];
    clock = 0;
    half = 1;
    phase = "thinking";
    turn = 0;
    plan = null;
    lastScorer = null;
    humanTeam = 0;
    timer = THINK_TIME;
    movesThisTurn = 0;
    moveTime = 0;
    mover = null;
    moverTouched = false;
    lastTouch = -1;
    acc = 0;
    listeners = [];
    hitCooldown = 0;
    constructor(home, away){
        this.teams = [
            home,
            away
        ];
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
            track: 0
        };
        this.bodies.push(this.ball);
        const gks = [];
        for (const t of [
            0,
            1
        ]){
            for (const f of FORMATION){
                const b = {
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
                    track: 0
                };
                this.bodies.push(b);
                if (f.kind === "gk") gks.push(b);
                else this.buttons[t].push(b);
            }
        }
        this.gks = [
            gks[0],
            gks[1]
        ];
        for (const sx of [
            -1,
            1
        ]){
            for (const sz of [
                -1,
                1
            ]){
                this.posts.push({
                    x: sx * HX,
                    z: sz * GOAL_HALF,
                    r: 0.6
                });
            }
        }
        this.resetPositions(0, false);
        this.prepareTurn();
    }
    on(fn) {
        this.listeners.push(fn);
        return ()=>{
            this.listeners = this.listeners.filter((l)=>l !== fn);
        };
    }
    emit(e) {
        for (const l of this.listeners)l(e);
    }
    get minute() {
        return Math.min(90, Math.floor(this.clock / (HALF_SECONDS * 2) * 90));
    }
    get goalProgress() {
        return this.phase === "goal" ? 1 - this.timer / GOAL_TIME : 0;
    }
    // ------------------------------------------------------------------
    resetPositions(kickTeam, announce = true) {
        for (const t of [
            0,
            1
        ]){
            const sign = t === 0 ? 1 : -1;
            const list = this.bodies.filter((b)=>b.team === t);
            for (const b of list){
                const f = FORMATION.find((ff)=>ff.num === b.num);
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
        if (announce) this.emit({
            type: "kickoff",
            team: kickTeam
        });
    }
    // ------------------------------------------------------------------
    // IA: escolhe qual botão bater, direção e força.
    planMove() {
        const team = this.turn;
        const dirX = team === 0 ? 1 : -1;
        const ball = this.ball;
        const skill = clamp((this.teams[team].strength - 60) / 30, 0, 1);
        const sigma = 0.02 + (1 - skill) * 0.1;
        const gz = (Math.random() * 2 - 1) * GOAL_HALF * 0.6;
        const goal = {
            x: dirX * HX,
            z: gz
        };
        let ax = goal.x - ball.x;
        let az = goal.z - ball.z;
        const al = Math.hypot(ax, az) || 1;
        ax /= al;
        az /= al;
        const distGoal = al;
        const others = this.bodies.filter((b)=>b.kind !== "ball");
        let best = null;
        for (const s of this.buttons[team]){
            const bx = ball.x - s.x;
            const bz = ball.z - s.z;
            const dist = Math.hypot(bx, bz) || 0.001;
            const dot = bx / dist * ax + bz / dist * az;
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
            for (const o of others){
                if (o === s) continue;
                const t = clamp(((o.x - s.x) * sx + (o.z - s.z) * sz) / sl2, 0, 1);
                const px = s.x + sx * t;
                const pz = s.z + sz * t;
                if (Math.hypot(o.x - px, o.z - pz) < o.r + s.r * 0.95) blocked += 1;
            }
            const score = dist + (good ? 0 : 45) + blocked * 30 + Math.random() * 8 * (1.4 - skill * 0.6);
            if (!best || score < best.score) best = {
                s,
                tx,
                tz,
                good,
                score
            };
        }
        const { s, tx, tz, good } = best;
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
        this.plan = {
            body: s,
            dx: ndx,
            dz: ndz,
            speed: v0,
            good
        };
    }
    prepareTurn() {
        this.plan = null;
        if (this.turn !== this.humanTeam) this.planMove();
    }
    /** Inicia a mira do jogador humano em um de seus botões. */ beginHumanAim(bodyId) {
        if (this.phase !== "thinking" || this.turn !== this.humanTeam) return false;
        const body = this.buttons[this.humanTeam].find((b)=>b.id === bodyId);
        if (!body) return false;
        this.plan = {
            body,
            dx: 1,
            dz: 0,
            speed: 0,
            good: true
        };
        return true;
    }
    /** Atualiza a direção/força da puxada. Retorna a força de 0 a 1. */ aimHuman(dx, dz) {
        if (this.phase !== "thinking" || this.turn !== this.humanTeam || !this.plan) return 0;
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
        if (this.phase === "thinking" && this.turn === this.humanTeam) this.plan = null;
    }
    shootHuman() {
        if (this.phase !== "thinking" || this.turn !== this.humanTeam || !this.plan || this.plan.speed < 8) {
            this.cancelHumanAim();
            return false;
        }
        this.launch();
        return true;
    }
    launch() {
        const p = this.plan;
        if (!p) return;
        p.body.vx = p.dx * p.speed;
        p.body.vz = p.dz * p.speed;
        this.mover = p.body;
        this.moverTouched = false;
        this.moveTime = 0;
        this.phase = "moving";
        this.emit({
            type: "shot",
            team: this.turn,
            num: p.body.num,
            power: p.speed / MAX_V
        });
        this.plan = null;
    }
    endMove() {
        for (const b of this.bodies){
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
            this.emit({
                type: "halftime"
            });
            return;
        }
        if (this.half === 2 && this.clock >= total) {
            this.phase = "ended";
            this.emit({
                type: "fulltime"
            });
            return;
        }
        this.phase = "thinking";
        this.timer = THINK_TIME;
        this.prepareTurn();
    }
    // ------------------------------------------------------------------
    /** Avança a simulação em `dt` segundos (já multiplicado pela velocidade). */ update(dt) {
        this.acc += Math.min(dt, 0.25);
        while(this.acc >= STEP){
            this.acc -= STEP;
            this.tick(STEP);
        }
    }
    tick(h) {
        this.stepPhysics(h);
        this.hitCooldown -= h;
        switch(this.phase){
            case "thinking":
                if (this.turn !== this.humanTeam) {
                    this.timer -= h;
                    if (this.timer <= 0) this.launch();
                }
                break;
            case "moving":
                {
                    this.clock += h;
                    this.moveTime += h;
                    const b = this.ball;
                    if (Math.abs(b.z) < GOAL_HALF) {
                        if (b.x > HX + BALL_R) return this.goal(0);
                        if (b.x < -HX - BALL_R) return this.goal(1);
                    }
                    if (this.moveTime > 4.5) {
                        // atrito extra para encerrar jogadas longas
                        for (const o of this.bodies){
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
                    const kick = this.lastScorer === 0 ? 1 : 0;
                    this.resetPositions(kick);
                    this.phase = "thinking";
                    this.timer = THINK_TIME;
                    this.prepareTurn();
                    // fim de jogo logo após o gol, se o tempo já acabou
                    if (this.half === 1 && this.clock >= HALF_SECONDS) {
                        this.phase = "halftime";
                        this.timer = HALFTIME_TIME;
                        this.emit({
                            type: "halftime"
                        });
                    } else if (this.half === 2 && this.clock >= HALF_SECONDS * 2) {
                        this.phase = "ended";
                        this.emit({
                            type: "fulltime"
                        });
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
    goal(team) {
        this.score[team]++;
        this.lastScorer = team;
        // gol contra: última toque foi do time que sofreu o gol
        const own = this.lastTouch === (team === 0 ? 1 : 0);
        this.phase = "goal";
        this.timer = GOAL_TIME;
        this.moverClear();
        this.emit({
            type: "goal",
            team,
            own,
            minute: this.minute
        });
    }
    moverClear() {
        this.mover = null;
        this.plan = null;
        for (const b of this.bodies){
            if (b.kind === "button") {
                b.vx = 0;
                b.vz = 0;
            }
        }
    }
    isSettled() {
        for (const b of this.bodies){
            if (b.kind === "gk") continue;
            const sp = Math.hypot(b.vx, b.vz);
            if (sp > (b.kind === "ball" ? 1.2 : 0.7)) return false;
        }
        return true;
    }
    // ------------------------------------------------------------------
    stepPhysics(h) {
        const bodies = this.bodies;
        // goleiros (cinemáticos)
        for (const gk of this.gks){
            const skill = clamp((this.teams[gk.team].strength - 60) / 30, 0, 1);
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
        for (const b of bodies){
            if (b.kind === "gk") continue;
            const f = Math.exp(-b.damp * h);
            b.vx *= f;
            b.vz *= f;
            b.x += b.vx * h;
            b.z += b.vz * h;
        }
        // colisões corpo-corpo
        for(let i = 0; i < bodies.length; i++){
            const a = bodies[i];
            for(let j = i + 1; j < bodies.length; j++){
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
                    const imp = -(1 + e) * rel / total;
                    a.vx -= imp * a.invM * nx;
                    a.vz -= imp * a.invM * nz;
                    c.vx += imp * c.invM * nx;
                    c.vz += imp * c.invM * nz;
                    const intensity = -rel;
                    const isBall = a.kind === "ball" || c.kind === "ball";
                    if (isBall) {
                        const other = a.kind === "ball" ? c : a;
                        this.lastTouch = other.team;
                        if (other === this.mover) this.moverTouched = true;
                    }
                    if (intensity > 4 && this.hitCooldown <= 0) {
                        this.hitCooldown = 0.04;
                        this.emit({
                            type: "hit",
                            intensity,
                            ball: isBall
                        });
                    }
                }
            }
        }
        // traves (só a bola)
        const ball = this.ball;
        for (const p of this.posts){
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
                    if (-vn > 6) this.emit({
                        type: "post"
                    });
                }
            }
        }
        // paredes: botões
        for (const b of bodies){
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
        for (const b of bodies){
            if (b.kind === "gk") continue;
            const v2 = b.vx * b.vx + b.vz * b.vz;
            if (v2 > MAX_V * MAX_V * 2.2) {
                const k = MAX_V * 1.48 / Math.sqrt(v2);
                b.vx *= k;
                b.vz *= k;
            }
        }
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/game/renderer.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Stadium3D",
    ()=>Stadium3D
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/three@0.186.1/node_modules/three/build/three.core.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/three@0.186.1/node_modules/three/build/three.module.js [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/game/engine.ts [app-client] (ecmascript)");
;
;
const TIERS = 12;
const TD = 2.4;
const TH = 1.6;
function canvasTex(w, h, draw) {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d");
    draw(ctx);
    const t = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CanvasTexture"](cv);
    t.colorSpace = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SRGBColorSpace"];
    t.anisotropy = 8;
    return t;
}
function makePitchTexture() {
    const S = 20;
    return canvasTex(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] * 2 * S, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] * 2 * S, (c)=>{
        const X = (x)=>(x + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"]) * S;
        const Z = (z)=>(z + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"]) * S;
        const stripes = 12;
        const sw = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] * 2 / stripes;
        for(let i = 0; i < stripes; i++){
            c.fillStyle = i % 2 ? "#2e8b3b" : "#37a046";
            c.fillRect(X(-__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + i * sw), 0, sw * S + 1, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] * 2 * S);
        }
        // ruído sutil de grama
        for(let i = 0; i < 9000; i++){
            c.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,40,0"},0.035)`;
            c.fillRect(Math.random() * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] * 2 * S, Math.random() * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] * 2 * S, 3, 12);
        }
        c.strokeStyle = "rgba(255,255,255,0.92)";
        c.fillStyle = "rgba(255,255,255,0.92)";
        c.lineWidth = 6;
        c.strokeRect(X(-__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"]) + 3, Z(-__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"]) + 3, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] * 2 * S - 6, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] * 2 * S - 6);
        c.beginPath();
        c.moveTo(X(0), Z(-__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"]));
        c.lineTo(X(0), Z(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"]));
        c.stroke();
        c.beginPath();
        c.arc(X(0), Z(0), 9 * S, 0, Math.PI * 2);
        c.stroke();
        c.beginPath();
        c.arc(X(0), Z(0), 0.6 * S, 0, Math.PI * 2);
        c.fill();
        for (const s of [
            -1,
            1
        ]){
            // grande área
            c.strokeRect(s < 0 ? X(-__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"]) : X(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] - 16), Z(-21), 16 * S, 42 * S);
            // pequena área
            c.strokeRect(s < 0 ? X(-__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"]) : X(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] - 6), Z(-15), 6 * S, 30 * S);
            // marca do pênalti
            c.beginPath();
            c.arc(X(s * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] - 11)), Z(0), 0.5 * S, 0, Math.PI * 2);
            c.fill();
            // meia-lua
            c.beginPath();
            if (s < 0) c.arc(X(-__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + 11), Z(0), 8 * S, -0.9, 0.9);
            else c.arc(X(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] - 11), Z(0), 8 * S, Math.PI - 0.9, Math.PI + 0.9);
            c.stroke();
        }
    });
}
function makeNetTexture() {
    const t = canvasTex(64, 64, (c)=>{
        c.clearRect(0, 0, 64, 64);
        c.strokeStyle = "rgba(255,255,255,0.75)";
        c.lineWidth = 3;
        c.strokeRect(0, 0, 64, 64);
    });
    t.wrapS = t.wrapT = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RepeatWrapping"];
    return t;
}
function makeAdTexture() {
    const t = canvasTex(1024, 64, (c)=>{
        const bands = [
            "#0b3d91",
            "#f2c400",
            "#0b7a3b",
            "#c8102e"
        ];
        const labels = [
            "BRASILEIRÃO SÉRIE A",
            "FUTEBOL DE BOTÃO",
            "JOGUE COM RESPONSABILIDADE",
            "GOOOL!"
        ];
        for(let i = 0; i < 4; i++){
            c.fillStyle = bands[i];
            c.fillRect(i * 256, 0, 256, 64);
            c.fillStyle = i === 1 ? "#111" : "#fff";
            c.font = "bold 22px sans-serif";
            c.textAlign = "center";
            c.textBaseline = "middle";
            c.fillText(labels[i], i * 256 + 128, 34, 236);
        }
    });
    t.wrapS = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RepeatWrapping"];
    return t;
}
function makeBallTexture() {
    return canvasTex(256, 128, (c)=>{
        c.fillStyle = "#fafafa";
        c.fillRect(0, 0, 256, 128);
        c.fillStyle = "#1a1a1a";
        const spots = [
            [
                30,
                30
            ],
            [
                90,
                40
            ],
            [
                150,
                25
            ],
            [
                215,
                45
            ],
            [
                55,
                95
            ],
            [
                125,
                90
            ],
            [
                190,
                100
            ],
            [
                240,
                100
            ],
            [
                10,
                100
            ]
        ];
        for (const [x, y] of spots){
            c.beginPath();
            for(let i = 0; i < 5; i++){
                const a = i / 5 * Math.PI * 2 - Math.PI / 2;
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
function makeButtonTexture(team, num, gk) {
    const texture = canvasTex(256, 256, (c)=>{
        const isYellow = team.primary.toLowerCase().startsWith("#f2c4");
        const bg = gk ? isYellow ? "#19b8ff" : "#f5d90a" : team.primary;
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
        image.onload = ()=>{
            const canvas = texture.image;
            const c = canvas.getContext("2d");
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
class Stadium3D {
    container;
    match;
    renderer;
    scene;
    camera;
    meshes;
    ballMesh;
    crowd;
    spots;
    dummy;
    arrow;
    arrowShaft;
    arrowHead;
    selRing;
    confetti;
    confVel;
    confActive;
    camPos;
    camLook;
    goalSide;
    celebrate;
    time;
    ro;
    disposed;
    constructor(container, match){
        this.container = container;
        this.match = match;
        this.scene = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Scene"]();
        this.meshes = new Map();
        this.spots = [];
        this.dummy = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Object3D"]();
        this.arrow = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Group"]();
        this.confActive = 0;
        this.camPos = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector3"](0, 30, 60);
        this.camLook = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector3"](0, 0, 0);
        this.goalSide = 1;
        this.celebrate = 0;
        this.time = 0;
        this.disposed = false;
        this.renderer = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["WebGLRenderer"]({
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PCFSoftShadowMap"];
        this.renderer.toneMapping = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ACESFilmicToneMapping"];
        this.renderer.toneMappingExposure = 1.05;
        container.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.display = "block";
        this.renderer.domElement.style.width = "100%";
        this.renderer.domElement.style.height = "100%";
        this.camera = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PerspectiveCamera"](48, 16 / 9, 0.5, 700);
        this.scene.background = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](0x060a14);
        this.scene.fog = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fog"](0x060a14, 160, 420);
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
        this.ro = new ResizeObserver(()=>this.resize());
        this.ro.observe(container);
        this.resize();
    }
    // ---------------------------------------------------------------
    buildLights() {
        this.scene.add(new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HemisphereLight"](0xcfe0ff, 0x2b4a2b, 0.75));
        const sun = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DirectionalLight"](0xfff4e0, 1.9);
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
        const fill = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DirectionalLight"](0x9fb8ff, 0.5);
        fill.position.set(-40, 50, -50);
        this.scene.add(fill);
    }
    buildPitch() {
        const pitch = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlaneGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] * 2, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] * 2), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            map: makePitchTexture(),
            roughness: 0.95
        }));
        pitch.rotation.x = -Math.PI / 2;
        pitch.receiveShadow = true;
        this.scene.add(pitch);
        const outer = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlaneGeometry"](400, 300), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            color: 0x1d5a2b,
            roughness: 1
        }));
        outer.rotation.x = -Math.PI / 2;
        outer.position.y = -0.03;
        outer.receiveShadow = true;
        this.scene.add(outer);
        // pista ao redor
        const track = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlaneGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] * 2 + 20, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] * 2 + 20), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            color: 0x266b34,
            roughness: 1
        }));
        track.rotation.x = -Math.PI / 2;
        track.position.y = -0.02;
        track.receiveShadow = true;
        this.scene.add(track);
    }
    buildGoals() {
        const white = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            color: 0xffffff,
            roughness: 0.35,
            metalness: 0.2
        });
        const netTex = makeNetTexture();
        const H = 5;
        const netMat = (rx, ry)=>{
            const t = netTex.clone();
            t.needsUpdate = true;
            t.wrapS = t.wrapT = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RepeatWrapping"];
            t.repeat.set(rx, ry);
            return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshBasicMaterial"]({
                map: t,
                transparent: true,
                side: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DoubleSide"],
                depthWrite: false
            });
        };
        for (const s of [
            -1,
            1
        ]){
            const g = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Group"]();
            const post = (z)=>{
                const m = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CylinderGeometry"](0.45, 0.45, H, 12), white);
                m.position.set(s * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"], H / 2, z);
                m.castShadow = true;
                g.add(m);
            };
            post(-__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"]);
            post(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"]);
            const bar = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CylinderGeometry"](0.45, 0.45, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"] * 2, 12), white);
            bar.rotation.x = Math.PI / 2;
            bar.position.set(s * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"], H, 0);
            bar.castShadow = true;
            g.add(bar);
            // rede: fundo
            const back = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlaneGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"] * 2, H), netMat(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"] * 2 / 1.2, H / 1.2));
            back.rotation.y = Math.PI / 2;
            back.position.set(s * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_DEPTH"]), H / 2, 0);
            g.add(back);
            // topo
            const top = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlaneGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_DEPTH"], __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"] * 2), netMat(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_DEPTH"] / 1.2, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"] * 2 / 1.2));
            top.rotation.x = Math.PI / 2;
            top.position.set(s * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_DEPTH"] / 2), H, 0);
            g.add(top);
            // laterais
            for (const z of [
                -__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"],
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"]
            ]){
                const side = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PlaneGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_DEPTH"], H), netMat(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_DEPTH"] / 1.2, H / 1.2));
                side.position.set(s * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_DEPTH"] / 2), H / 2, z);
                g.add(side);
            }
            // hastes de trás
            for (const z of [
                -__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"],
                __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"]
            ]){
                const rod = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CylinderGeometry"](0.2, 0.2, H, 8), white);
                rod.position.set(s * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_DEPTH"]), H / 2, z);
                g.add(rod);
            }
            this.scene.add(g);
        }
    }
    buildRails() {
        const adTex = makeAdTexture();
        const mk = (len, rot)=>{
            const t = adTex.clone();
            t.needsUpdate = true;
            t.wrapS = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RepeatWrapping"];
            t.repeat.set(Math.max(1, len / 32), 1);
            return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
                map: t,
                roughness: 0.6
            });
        };
        const H = 2.2;
        const add = (len, x, z, rot)=>{
            const geo = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BoxGeometry"](rot ? 0.8 : len, H, rot ? len : 0.8);
            const m = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](geo, mk(len, rot));
            m.position.set(x, H / 2, z);
            m.castShadow = true;
            m.receiveShadow = true;
            this.scene.add(m);
        };
        for (const s of [
            -1,
            1
        ]){
            add(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] * 2 + 1.6, 0, s * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] + 0.4), false);
            const seg = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] - __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"];
            for (const t of [
                -1,
                1
            ]){
                add(seg, s * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + 0.4), t * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"] + seg / 2), true);
            }
        }
    }
    buildStands() {
        const concrete = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            color: 0x39435a,
            roughness: 0.9
        });
        const [home, away] = this.match.teams;
        const palette = (team)=>{
            const base = [
                0xe8eaf0,
                0xffd54a,
                0x5aa9ff,
                0xff5a5a,
                0x66d17a,
                0x222633
            ];
            const cols = [];
            if (team) {
                const p = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](team.primary).getHex();
                const s = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](team.secondary).getHex();
                for(let i = 0; i < 6; i++)cols.push(p);
                for(let i = 0; i < 3; i++)cols.push(s);
                cols.push(0xffffff);
                cols.push(base[Math.floor(Math.random() * base.length)]);
            } else {
                const a = [
                    new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](home.primary).getHex(),
                    new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](away.primary).getHex()
                ];
                cols.push(a[0], a[0], a[1], a[1], ...base);
            }
            return cols;
        };
        const rows = [];
        const addTier = (sx, sz, axis, i, team)=>{
            const h = (i + 1) * TH;
            if (axis === "side") {
                const zc = sz * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] + 12 + i * TD + TD / 2);
                const len = 128;
                const box = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BoxGeometry"](len, h, TD), concrete);
                box.position.set(0, h / 2, zc);
                box.receiveShadow = true;
                this.scene.add(box);
                for(let x = -len / 2 + 1; x < len / 2; x += 1.3)rows.push({
                    x,
                    y: h,
                    z: zc,
                    team
                });
            } else {
                const xc = sx * (64 + i * TD + TD / 2);
                const len = 88;
                const box = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BoxGeometry"](TD, h, len), concrete);
                box.position.set(xc, h / 2, 0);
                box.receiveShadow = true;
                this.scene.add(box);
                for(let z = -len / 2 + 1; z < len / 2; z += 1.3)rows.push({
                    x: xc,
                    y: h,
                    z,
                    team
                });
            }
        };
        for(let i = 0; i < TIERS; i++){
            addTier(0, -1, "side", i, null);
            addTier(0, 1, "side", i, null);
            addTier(-1, 0, "end", i, home);
            addTier(1, 0, "end", i, away);
        }
        // muro de fundo/cobertura visual
        const back = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            color: 0x141a29,
            roughness: 1
        });
        const wallH = TIERS * TH + 14;
        for (const s of [
            -1,
            1
        ]){
            const w = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BoxGeometry"](150, wallH, 1), back);
            w.position.set(0, wallH / 2, s * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] + 12 + TIERS * TD + 1));
            this.scene.add(w);
            const w2 = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BoxGeometry"](1, wallH, 140), back);
            w2.position.set(s * (64 + TIERS * TD + 1), wallH / 2, 0);
            this.scene.add(w2);
        }
        const geo = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BoxGeometry"](0.85, 1.25, 0.65);
        const mat = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            roughness: 0.8
        });
        this.crowd = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["InstancedMesh"](geo, mat, rows.length);
        const c = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"]();
        rows.forEach((r, idx)=>{
            const pal = palette(r.team);
            c.setHex(pal[Math.floor(Math.random() * pal.length)]);
            c.multiplyScalar(0.7 + Math.random() * 0.4);
            this.crowd.setColorAt(idx, c);
            this.spots.push({
                x: r.x + (Math.random() - 0.5) * 0.15,
                y: r.y + 0.62,
                z: r.z,
                phase: Math.random() * 10,
                speed: 4 + Math.random() * 5
            });
        });
        this.crowd.frustumCulled = false;
        this.scene.add(this.crowd);
        this.updateCrowd();
    }
    updateCrowd() {
        const amp = 0.03 + this.celebrate * 0.9;
        const t = this.time;
        const d = this.dummy;
        for(let i = 0; i < this.spots.length; i++){
            const s = this.spots[i];
            const b = Math.abs(Math.sin(t * s.speed + s.phase)) * amp;
            d.position.set(s.x, s.y + b, s.z);
            d.updateMatrix();
            this.crowd.setMatrixAt(i, d.matrix);
        }
        this.crowd.instanceMatrix.needsUpdate = true;
    }
    buildTowers() {
        const metal = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            color: 0x8a94a8,
            roughness: 0.5,
            metalness: 0.5
        });
        const lamp = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshBasicMaterial"]({
            color: 0xfffbe6
        });
        for (const sx of [
            -1,
            1
        ]){
            for (const sz of [
                -1,
                1
            ]){
                const g = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Group"]();
                const pole = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CylinderGeometry"](0.9, 1.4, 52, 8), metal);
                pole.position.y = 26;
                g.add(pole);
                const head = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BoxGeometry"](12, 7, 1.2), lamp);
                head.position.y = 54;
                g.add(head);
                g.position.set(sx * 88, 0, sz * 62);
                g.lookAt(0, 54, 0);
                this.scene.add(g);
            }
        }
    }
    // ---------------------------------------------------------------
    buildPlayers() {
        const ballMat = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
            map: makeBallTexture(),
            roughness: 0.4
        });
        this.ballMesh = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["SphereGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BALL_R"], 32, 20), ballMat);
        this.ballMesh.castShadow = true;
        this.scene.add(this.ballMesh);
        const bodyGeo = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CylinderGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"], __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"] * 1.05, 0.9, 48);
        const topGeo = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CircleGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"] * 0.97, 48);
        const ringGeo = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RingGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"] * 0.97, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"] * 1.03, 48);
        for (const b of this.match.bodies){
            if (b.kind === "ball") continue;
            const team = this.match.teams[b.team];
            const g = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Group"]();
            g.userData.bodyId = b.id;
            const isGk = b.kind === "gk";
            const bodyMat = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
                color: isGk ? 0x222222 : new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](team.primary),
                roughness: 0.35,
                metalness: 0.1
            });
            const body = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](bodyGeo, bodyMat);
            body.userData.bodyId = b.id;
            body.position.y = 0.45;
            body.castShadow = true;
            body.receiveShadow = true;
            g.add(body);
            const top = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](topGeo, new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
                map: makeButtonTexture(team, b.num, isGk),
                roughness: 0.3
            }));
            top.userData.bodyId = b.id;
            top.rotation.x = -Math.PI / 2;
            top.rotation.z = b.team === 0 ? Math.PI / 2 : -Math.PI / 2;
            top.position.y = 0.92;
            g.add(top);
            const rim = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](ringGeo, new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshStandardMaterial"]({
                color: new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](team.secondary),
                roughness: 0.3
            }));
            rim.rotation.x = -Math.PI / 2;
            rim.position.y = 0.925;
            g.add(rim);
            this.scene.add(g);
            this.meshes.set(b.id, g);
        }
    }
    buildIndicators() {
        const mat = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshBasicMaterial"]({
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            depthTest: false
        });
        this.arrowShaft = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BoxGeometry"](1, 0.35, 0.7), mat);
        this.arrowHead = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["ConeGeometry"](1.3, 2.4, 16), mat);
        this.arrowHead.rotation.z = -Math.PI / 2;
        this.arrow.add(this.arrowShaft, this.arrowHead);
        this.arrow.renderOrder = 10;
        this.arrowShaft.renderOrder = 10;
        this.arrowHead.renderOrder = 10;
        this.arrow.visible = false;
        this.scene.add(this.arrow);
        this.selRing = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Mesh"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["RingGeometry"](__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"] * 1.15, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"] * 1.45, 40), new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MeshBasicMaterial"]({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["DoubleSide"]
        }));
        this.selRing.rotation.x = -Math.PI / 2;
        this.selRing.position.y = 0.08;
        this.selRing.visible = false;
        this.scene.add(this.selRing);
    }
    buildConfetti() {
        const n = 400;
        const geo = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BufferGeometry"]();
        geo.setAttribute("position", new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BufferAttribute"](new Float32Array(n * 3), 3));
        geo.setAttribute("color", new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BufferAttribute"](new Float32Array(n * 3), 3));
        this.confetti = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Points"](geo, new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["PointsMaterial"]({
            size: 1.1,
            vertexColors: true,
            sizeAttenuation: true
        }));
        this.confetti.frustumCulled = false;
        this.confetti.visible = false;
        this.scene.add(this.confetti);
    }
    /** Dispara comemoração: torcida pula e confete sai do gol. */ celebrateGoal(team) {
        this.celebrate = 1;
        const t = this.match.teams[team];
        const cols = [
            new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](t.primary),
            new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](t.secondary),
            new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](0xffffff),
            new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](0xffd54a)
        ];
        const pos = this.confetti.geometry.getAttribute("position");
        const col = this.confetti.geometry.getAttribute("color");
        const gx = (team === 0 ? 1 : -1) * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + 2);
        const n = pos.count;
        for(let i = 0; i < n; i++){
            pos.setXYZ(i, gx + (Math.random() - 0.5) * 4, 4 + Math.random() * 2, (Math.random() - 0.5) * __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["GOAL_HALF"] * 1.6);
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
    /** Converte uma posição da tela no ponto correspondente do gramado. */ pointOnPitch(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector2"]((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Raycaster"]();
        ray.setFromCamera(mouse, this.camera);
        const point = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector3"]();
        return ray.ray.intersectPlane(new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Plane"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector3"](0, 1, 0), 0), point) ? {
            x: point.x,
            z: point.z
        } : null;
    }
    pickButton(clientX, clientY, team) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector2"]((clientX - rect.left) / rect.width * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Raycaster"]();
        ray.setFromCamera(mouse, this.camera);
        for (const hit of ray.intersectObjects([
            ...this.meshes.values()
        ], true)){
            let object = hit.object;
            while(object && object.userData.bodyId === undefined)object = object.parent;
            const id = object?.userData.bodyId;
            const body = id === undefined ? undefined : this.match.bodies.find((b)=>b.id === id);
            if (body?.team === team && body.kind === "button") return body;
        }
        return null;
    }
    syncBody(b, dt) {
        const m = this.meshes.get(b.id);
        if (!m) return;
        m.position.set(b.x, 0, b.z);
    }
    render(dt, simDt, mode) {
        if (this.disposed) return;
        this.time += dt;
        const match = this.match;
        for (const b of match.bodies){
            if (b.kind === "ball") continue;
            this.syncBody(b, dt);
        }
        const ball = match.ball;
        this.ballMesh.position.set(ball.x, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BALL_R"], ball.z);
        const sp = Math.hypot(ball.vx, ball.vz);
        if (sp > 0.01) {
            const axis = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector3"](ball.vz, 0, -ball.vx).normalize();
            this.ballMesh.rotateOnWorldAxis(axis, sp * simDt / __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BALL_R"]);
        }
        // indicadores de jogada
        const plan = match.plan;
        if (plan && match.phase === "thinking") {
            const team = match.teams[match.turn];
            const color = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](team.primary === "#ffffff" || team.primary === "#f2f2f2" || team.primary === "#f5f5f5" || team.primary === "#f4f4f4" ? team.secondary : team.primary);
            const bright = color.clone().lerp(new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Color"](0xffffff), 0.35);
            this.arrowShaft.material.color.copy(bright);
            this.selRing.material.color.copy(bright);
            const len = 3 + plan.speed / 88 * 14;
            const shaftLen = Math.max(0.5, len - 2.4);
            const a = Math.atan2(plan.dz, plan.dx);
            this.arrow.visible = true;
            this.arrow.position.set(plan.body.x, 1.3, plan.body.z);
            this.arrow.rotation.y = -a;
            this.arrowShaft.scale.x = shaftLen;
            this.arrowShaft.position.x = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"] + shaftLen / 2;
            this.arrowHead.position.x = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["BTN_R"] + shaftLen + 1.1;
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
            const pos = this.confetti.geometry.getAttribute("position");
            for(let i = 0; i < pos.count; i++){
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
                pos.setXYZ(i, pos.getX(i) + this.confVel[i * 3] * dt, y, pos.getZ(i) + this.confVel[i * 3 + 2] * dt);
            }
            pos.needsUpdate = true;
            if (this.confActive <= 0) this.confetti.visible = false;
        }
        this.updateCamera(dt, mode);
        this.renderer.render(this.scene, this.camera);
    }
    updateCamera(dt, mode) {
        const b = this.match.ball;
        const bx = b.x;
        const bz = b.z;
        const pos = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector3"]();
        const look = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Vector3"]();
        if (Math.abs(bx) > 14) this.goalSide = Math.sign(bx);
        if (this.match.phase === "goal") {
            const gx = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$three$40$0$2e$186$2e$1$2f$node_modules$2f$three$2f$build$2f$three$2e$core$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["MathUtils"].clamp(bx, -46, 46);
            pos.set(gx * 0.9, 8, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] + 8);
            look.set(bx, 1, bz);
            if (mode === "goal") {
                pos.set(this.goalSide * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + 22), 10, bz * 0.5 + 6);
            }
        } else {
            switch(mode){
                case "tv":
                    pos.set(bx * 0.55, 30, 60);
                    look.set(bx * 0.78, 0, 1);
                    break;
                case "rail":
                    pos.set(bx * 0.85, 12, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HZ"] + 9);
                    look.set(bx, 0, bz * 0.5 - 3);
                    break;
                case "goal":
                    pos.set(this.goalSide * (__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["HX"] + 20), 12.5, bz * 0.25);
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
        this.scene.traverse((o)=>{
            const m = o;
            if (m.geometry) m.geometry.dispose();
            const mat = m.material;
            if (Array.isArray(mat)) mat.forEach((x)=>x.dispose());
            else if (mat) {
                const mm = mat;
                mm.map?.dispose();
                mat.dispose();
            }
        });
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/game/sfx.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Efeitos sonoros sintetizados (sem arquivos de áudio). */ __turbopack_context__.s([
    "Sfx",
    ()=>Sfx
]);
class Sfx {
    ctx = null;
    master = null;
    crowdGain = null;
    muted = false;
    init() {
        if (this.ctx) {
            void this.ctx.resume();
            return;
        }
        const AC = window.AudioContext ?? window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.8;
        this.master.connect(this.ctx.destination);
        // murmúrio contínuo da torcida
        const buf = this.noiseBuffer(3);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 650;
        bp.Q.value = 0.5;
        this.crowdGain = this.ctx.createGain();
        this.crowdGain.gain.value = 0.05;
        src.connect(bp).connect(this.crowdGain).connect(this.master);
        src.start();
    }
    noiseBuffer(seconds) {
        const ctx = this.ctx;
        const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for(let i = 0; i < d.length; i++)d[i] = Math.random() * 2 - 1;
        return buf;
    }
    setMuted(m) {
        this.muted = m;
        if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
    }
    blip(freq, dur, vol, type = "square") {
        if (!this.ctx || !this.master) return;
        const t = this.ctx.currentTime;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.5), t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.02);
    }
    hit(intensity, ball) {
        const v = Math.min(0.18, 0.02 + intensity * 0.004);
        this.blip(ball ? 520 + Math.random() * 120 : 260 + Math.random() * 60, 0.07, v, ball ? "triangle" : "square");
    }
    flick() {
        this.blip(900, 0.05, 0.05, "triangle");
    }
    post() {
        this.blip(1400, 0.35, 0.12, "sine");
    }
    whistle(long = false) {
        if (!this.ctx) return;
        this.blip(2600, long ? 0.9 : 0.35, 0.08, "sine");
        setTimeout(()=>this.blip(2900, long ? 0.9 : 0.35, 0.08, "sine"), long ? 350 : 200);
    }
    cheer() {
        if (!this.ctx || !this.master || !this.crowdGain) return;
        const t = this.ctx.currentTime;
        this.crowdGain.gain.cancelScheduledValues(t);
        this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
        this.crowdGain.gain.linearRampToValueAtTime(0.32, t + 0.4);
        this.crowdGain.gain.linearRampToValueAtTime(0.05, t + 4.5);
        this.blip(700, 0.5, 0.05, "sawtooth");
    }
}
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/GameView.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>GameView
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.2.6_@babel+core@7.29.7_supports-color@7.2.0__react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.2.6_@babel+core@7.29.7_supports-color@7.2.0__react-dom@19.2.6_react@19.2.6__react@19.2.6/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/game/engine.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$renderer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/game/renderer.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$sfx$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/game/sfx.ts [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$odds$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/odds.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
;
const CAMS = [
    {
        id: "tv",
        label: "TV"
    },
    {
        id: "rail",
        label: "Beira"
    },
    {
        id: "goal",
        label: "Atrás do gol"
    },
    {
        id: "top",
        label: "Aérea"
    }
];
function pickLabel(pick, home, away) {
    if (pick === "home") return `${home.name} vence`;
    if (pick === "away") return `${away.name} vence`;
    return "Empate";
}
function GameView({ home, away, bet, onFinish, onExit }) {
    _s();
    const mountRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const speedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(2);
    const camRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])("tv");
    const sfxRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    const finishRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(onFinish);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "GameView.useEffect": ()=>{
            finishRef.current = onFinish;
        }
    }["GameView.useEffect"], [
        onFinish
    ]);
    const [speed, setSpeed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(2);
    const [cam, setCam] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("tv");
    const [muted, setMuted] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [hud, setHud] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])({
        score: [
            0,
            0
        ],
        minute: 0,
        half: 1,
        phase: "thinking",
        turn: 0
    });
    const [banner, setBanner] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const [feed, setFeed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])([
        `Apito inicial! ${home.name} x ${away.name}`
    ]);
    const [confirmExit, setConfirmExit] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    const [aimPower, setAimPower] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(0);
    const [isAiming, setIsAiming] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(false);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "GameView.useEffect": ()=>{
            const el = mountRef.current;
            const match = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$engine$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Match"](home, away);
            const stadium = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$renderer$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Stadium3D"](el, match);
            const sfx = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$game$2f$sfx$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Sfx"]();
            sfxRef.current = sfx;
            let bannerTimer;
            let finishTimer;
            const say = {
                "GameView.useEffect.say": (t)=>setFeed({
                        "GameView.useEffect.say": (f)=>[
                                t,
                                ...f
                            ].slice(0, 6)
                    }["GameView.useEffect.say"])
            }["GameView.useEffect.say"];
            const showBanner = {
                "GameView.useEffect.showBanner": (b, ms)=>{
                    setBanner(b);
                    clearTimeout(bannerTimer);
                    bannerTimer = setTimeout({
                        "GameView.useEffect.showBanner": ()=>setBanner(null)
                    }["GameView.useEffect.showBanner"], ms);
                }
            }["GameView.useEffect.showBanner"];
            const off = match.on({
                "GameView.useEffect.off": (e)=>{
                    switch(e.type){
                        case "goal":
                            {
                                const team = e.team === 0 ? home : away;
                                stadium.celebrateGoal(e.team);
                                sfx.cheer();
                                sfx.whistle();
                                showBanner({
                                    text: "GOOOOL!",
                                    sub: `${team.name} ${e.own ? "(gol contra do adversário)" : ""}`.trim(),
                                    color: team.primary
                                }, 2800);
                                say(`${e.minute}' GOL do ${team.name}! ${match.score[0]} x ${match.score[1]}`);
                                break;
                            }
                        case "kickoff":
                            say(`Bola rolando: saída de bola do ${e.team === 0 ? home.name : away.name}.`);
                            break;
                        case "halftime":
                            sfx.whistle(true);
                            showBanner({
                                text: "INTERVALO",
                                sub: `${match.score[0]} x ${match.score[1]}`,
                                color: "#0f172a"
                            }, 2600);
                            say(`Fim do 1º tempo: ${match.score[0]} x ${match.score[1]}`);
                            break;
                        case "fulltime":
                            sfx.whistle(true);
                            showBanner({
                                text: "FIM DE JOGO",
                                sub: `${home.name} ${match.score[0]} x ${match.score[1]} ${away.name}`,
                                color: "#0f172a"
                            }, 4000);
                            say(`Fim de jogo: ${match.score[0]} x ${match.score[1]}`);
                            finishTimer = setTimeout({
                                "GameView.useEffect.off": ()=>finishRef.current(match.score[0], match.score[1])
                            }["GameView.useEffect.off"], 2800);
                            break;
                        case "shot":
                            sfx.flick();
                            break;
                        case "hit":
                            sfx.hit(e.intensity, e.ball);
                            break;
                        case "post":
                            sfx.post();
                            say("NA TRAVE!");
                            break;
                    }
                }
            }["GameView.useEffect.off"]);
            const hudTimer = setInterval({
                "GameView.useEffect.hudTimer": ()=>{
                    setHud({
                        score: [
                            match.score[0],
                            match.score[1]
                        ],
                        minute: match.minute,
                        half: match.half,
                        phase: match.phase,
                        turn: match.turn
                    });
                }
            }["GameView.useEffect.hudTimer"], 120);
            let raf = 0;
            let last = performance.now();
            const loop = {
                "GameView.useEffect.loop": (now)=>{
                    const dt = Math.min((now - last) / 1000, 0.1);
                    last = now;
                    let sim = dt * speedRef.current;
                    const simTotal = sim;
                    while(sim > 0){
                        const step = Math.min(sim, 0.2);
                        match.update(step);
                        sim -= step;
                    }
                    stadium.render(dt, simTotal, camRef.current);
                    raf = requestAnimationFrame(loop);
                }
            }["GameView.useEffect.loop"];
            raf = requestAnimationFrame(loop);
            const unlock = {
                "GameView.useEffect.unlock": ()=>sfx.init()
            }["GameView.useEffect.unlock"];
            window.addEventListener("pointerdown", unlock, {
                once: true
            });
            window.addEventListener("keydown", unlock, {
                once: true
            });
            const canvas = stadium.getCanvas();
            let selectedId = null;
            const pointerDown = {
                "GameView.useEffect.pointerDown": (event)=>{
                    const body = stadium.pickButton(event.clientX, event.clientY, 0);
                    if (!body || !match.beginHumanAim(body.id)) return;
                    selectedId = body.id;
                    canvas.setPointerCapture(event.pointerId);
                    setIsAiming(true);
                    setAimPower(0);
                    event.preventDefault();
                }
            }["GameView.useEffect.pointerDown"];
            const pointerMove = {
                "GameView.useEffect.pointerMove": (event)=>{
                    if (selectedId === null) return;
                    const body = match.bodies.find({
                        "GameView.useEffect.pointerMove.body": (b)=>b.id === selectedId
                    }["GameView.useEffect.pointerMove.body"]);
                    const point = stadium.pointOnPitch(event.clientX, event.clientY);
                    if (!body || !point) return;
                    // Estilingue: puxe para trás e solte para lançar na direção oposta.
                    setAimPower(match.aimHuman(body.x - point.x, body.z - point.z));
                    event.preventDefault();
                }
            }["GameView.useEffect.pointerMove"];
            const pointerUp = {
                "GameView.useEffect.pointerUp": (event)=>{
                    if (selectedId === null) return;
                    selectedId = null;
                    if (!match.shootHuman()) setAimPower(0);
                    setIsAiming(false);
                    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
                    event.preventDefault();
                }
            }["GameView.useEffect.pointerUp"];
            canvas.style.touchAction = "none";
            canvas.addEventListener("pointerdown", pointerDown);
            canvas.addEventListener("pointermove", pointerMove);
            canvas.addEventListener("pointerup", pointerUp);
            canvas.addEventListener("pointercancel", pointerUp);
            return ({
                "GameView.useEffect": ()=>{
                    cancelAnimationFrame(raf);
                    clearInterval(hudTimer);
                    clearTimeout(bannerTimer);
                    clearTimeout(finishTimer);
                    off();
                    window.removeEventListener("pointerdown", unlock);
                    window.removeEventListener("keydown", unlock);
                    canvas.removeEventListener("pointerdown", pointerDown);
                    canvas.removeEventListener("pointermove", pointerMove);
                    canvas.removeEventListener("pointerup", pointerUp);
                    canvas.removeEventListener("pointercancel", pointerUp);
                    stadium.dispose();
                }
            })["GameView.useEffect"];
        }
    }["GameView.useEffect"], [
        home,
        away
    ]);
    const changeSpeed = (s)=>{
        speedRef.current = s;
        setSpeed(s);
    };
    const changeCam = (c)=>{
        camRef.current = c;
        setCam(c);
    };
    const toggleMute = ()=>{
        const m = !muted;
        setMuted(m);
        sfxRef.current?.init();
        sfxRef.current?.setMuted(m);
    };
    const current = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$odds$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["resultOf"])(hud.score[0], hud.score[1]);
    const winning = current === bet.pick;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 bg-black text-white select-none",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                ref: mountRef,
                className: "absolute inset-0"
            }, void 0, false, {
                fileName: "[project]/src/components/GameView.tsx",
                lineNumber: 234,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-stretch overflow-hidden rounded-xl bg-slate-950/85 shadow-2xl ring-1 ring-white/15 backdrop-blur",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2 px-3 py-2 sm:px-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                        src: home.crest,
                                        alt: "",
                                        className: "h-6 w-8 rounded-sm object-cover shadow"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/GameView.tsx",
                                        lineNumber: 240,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-sm font-bold tracking-wide sm:text-lg",
                                        children: home.short
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/GameView.tsx",
                                        lineNumber: 241,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/GameView.tsx",
                                lineNumber: 239,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center bg-white px-3 text-2xl font-black tabular-nums text-slate-900 sm:px-4 sm:text-3xl",
                                children: [
                                    hud.score[0],
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "px-1.5 text-slate-400",
                                        children: "-"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/GameView.tsx",
                                        lineNumber: 244,
                                        columnNumber: 27
                                    }, this),
                                    hud.score[1]
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/GameView.tsx",
                                lineNumber: 243,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center gap-2 px-3 py-2 sm:px-4",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-sm font-bold tracking-wide sm:text-lg",
                                        children: away.short
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/GameView.tsx",
                                        lineNumber: 247,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("img", {
                                        src: away.crest,
                                        alt: "",
                                        className: "h-6 w-8 rounded-sm object-cover shadow"
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/GameView.tsx",
                                        lineNumber: 248,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/GameView.tsx",
                                lineNumber: 246,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex min-w-[72px] flex-col items-center justify-center bg-emerald-600 px-3 text-xs font-semibold leading-tight",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-base font-black tabular-nums",
                                        children: [
                                            hud.minute,
                                            "'"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/GameView.tsx",
                                        lineNumber: 251,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "opacity-90",
                                        children: [
                                            hud.half,
                                            "º tempo"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/GameView.tsx",
                                        lineNumber: 252,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/GameView.tsx",
                                lineNumber: 250,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 238,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-1 text-center text-xs font-medium text-white/80 drop-shadow",
                        children: hud.phase === "ended" ? "Encerrado" : hud.phase === "halftime" ? "Intervalo" : hud.turn === 0 ? `Sua vez · ${home.name}` : `CPU pensando · ${away.name}`
                    }, void 0, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 255,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/GameView.tsx",
                lineNumber: 237,
                columnNumber: 7
            }, this),
            hud.phase === "thinking" && hud.turn === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute bottom-5 left-1/2 z-10 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl bg-slate-950/85 px-5 py-3 text-center shadow-2xl ring-1 ring-white/15 backdrop-blur",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "font-bold text-emerald-300",
                        children: isAiming ? "Solte para chutar" : "Clique em um botão, puxe para trás e solte"
                    }, void 0, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 268,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-0.5 text-xs text-white/65",
                        children: [
                            "Você joga com ",
                            home.name,
                            ". Quanto mais puxar, mais forte será a jogada."
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 271,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2 h-2 overflow-hidden rounded-full bg-white/15",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500 transition-[width]",
                            style: {
                                width: `${Math.round(aimPower * 100)}%`
                            }
                        }, void 0, false, {
                            fileName: "[project]/src/components/GameView.tsx",
                            lineNumber: 273,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 272,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/GameView.tsx",
                lineNumber: 267,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute left-3 top-3 z-10 w-56 rounded-xl bg-slate-950/80 p-3 text-xs shadow-xl ring-1 ring-white/15 backdrop-blur sm:w-64 sm:text-sm",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-[10px] font-semibold uppercase tracking-widest text-emerald-400",
                        children: "Sua aposta"
                    }, void 0, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 283,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-1 font-semibold",
                        children: pickLabel(bet.pick, home, away)
                    }, void 0, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 284,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-white/70",
                        children: [
                            (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$odds$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBRL"])(bet.stake),
                            " @ ",
                            bet.odds.toFixed(2)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 285,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "mt-1 text-white/70",
                        children: [
                            "Retorno: ",
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "font-bold text-amber-300",
                                children: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$odds$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBRL"])(Math.round(bet.stake * bet.odds))
                            }, void 0, false, {
                                fileName: "[project]/src/components/GameView.tsx",
                                lineNumber: 289,
                                columnNumber: 20
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 288,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: `mt-2 rounded-md px-2 py-1 text-center text-xs font-bold ${winning ? "bg-emerald-500/25 text-emerald-300" : "bg-rose-500/25 text-rose-300"}`,
                        children: winning ? "Ganhando agora" : "Perdendo agora"
                    }, void 0, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 291,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/GameView.tsx",
                lineNumber: 282,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute right-3 top-3 z-10 flex flex-col items-end gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-1 rounded-xl bg-slate-950/80 p-1 ring-1 ring-white/15 backdrop-blur",
                        children: CAMS.map((c)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: ()=>changeCam(c.id),
                                className: `rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:text-sm ${cam === c.id ? "bg-emerald-500 text-white" : "text-white/75 hover:bg-white/10"}`,
                                children: c.label
                            }, c.id, false, {
                                fileName: "[project]/src/components/GameView.tsx",
                                lineNumber: 304,
                                columnNumber: 13
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 302,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1 rounded-xl bg-slate-950/80 p-1 ring-1 ring-white/15 backdrop-blur",
                        children: [
                            [
                                1,
                                2,
                                4,
                                8
                            ].map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: ()=>changeSpeed(s),
                                    className: `rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:text-sm ${speed === s ? "bg-amber-400 text-slate-900" : "text-white/75 hover:bg-white/10"}`,
                                    children: [
                                        s,
                                        "x"
                                    ]
                                }, s, true, {
                                    fileName: "[project]/src/components/GameView.tsx",
                                    lineNumber: 317,
                                    columnNumber: 13
                                }, this)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: toggleMute,
                                className: "rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/10 sm:text-sm",
                                title: "Som",
                                children: muted ? "🔇" : "🔊"
                            }, void 0, false, {
                                fileName: "[project]/src/components/GameView.tsx",
                                lineNumber: 327,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 315,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        onClick: ()=>setConfirmExit(true),
                        className: "rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-white/15 backdrop-blur hover:bg-rose-500/20",
                        children: "Sair"
                    }, void 0, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 335,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/GameView.tsx",
                lineNumber: 301,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute bottom-3 left-3 z-10 max-w-[70%] space-y-1 sm:max-w-sm",
                children: feed.slice(0, 4).map((f, i)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "w-fit rounded-md bg-slate-950/70 px-2.5 py-1 text-xs text-white shadow ring-1 ring-white/10 backdrop-blur",
                        style: {
                            opacity: 1 - i * 0.22
                        },
                        children: f
                    }, `${f}-${i}`, false, {
                        fileName: "[project]/src/components/GameView.tsx",
                        lineNumber: 346,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/GameView.tsx",
                lineNumber: 344,
                columnNumber: 7
            }, this),
            banner && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center px-4",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "animate-[pop_0.35s_ease-out] rounded-2xl px-8 py-5 text-center shadow-2xl ring-2 ring-white/40",
                    style: {
                        background: `linear-gradient(135deg, ${banner.color}, #020617)`
                    },
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-4xl font-black tracking-wider drop-shadow sm:text-6xl",
                            children: banner.text
                        }, void 0, false, {
                            fileName: "[project]/src/components/GameView.tsx",
                            lineNumber: 363,
                            columnNumber: 13
                        }, this),
                        banner.sub && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-1 text-base font-semibold text-white/90 sm:text-xl",
                            children: banner.sub
                        }, void 0, false, {
                            fileName: "[project]/src/components/GameView.tsx",
                            lineNumber: 364,
                            columnNumber: 28
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/GameView.tsx",
                    lineNumber: 359,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/GameView.tsx",
                lineNumber: 358,
                columnNumber: 9
            }, this),
            confirmExit && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-0 z-30 grid place-items-center bg-black/70 p-4",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "w-full max-w-sm rounded-2xl bg-slate-900 p-6 text-center ring-1 ring-white/15",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-lg font-bold",
                            children: "Sair da partida?"
                        }, void 0, false, {
                            fileName: "[project]/src/components/GameView.tsx",
                            lineNumber: 372,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "mt-2 text-sm text-white/70",
                            children: [
                                "Se sair agora você perde a aposta de ",
                                (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$odds$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["formatBRL"])(bet.stake),
                                "."
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/GameView.tsx",
                            lineNumber: 373,
                            columnNumber: 13
                        }, this),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "mt-5 flex gap-3",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: ()=>setConfirmExit(false),
                                    className: "flex-1 rounded-xl bg-white/10 py-2.5 font-semibold hover:bg-white/20",
                                    children: "Continuar assistindo"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/GameView.tsx",
                                    lineNumber: 375,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$2$2e$6_$40$babel$2b$core$40$7$2e$29$2e$7_supports$2d$color$40$7$2e$2$2e$0_$5f$react$2d$dom$40$19$2e$2$2e$6_react$40$19$2e$2$2e$6_$5f$react$40$19$2e$2$2e$6$2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                    onClick: onExit,
                                    className: "flex-1 rounded-xl bg-rose-600 py-2.5 font-semibold hover:bg-rose-500",
                                    children: "Sair"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/GameView.tsx",
                                    lineNumber: 381,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/GameView.tsx",
                            lineNumber: 374,
                            columnNumber: 13
                        }, this)
                    ]
                }, void 0, true, {
                    fileName: "[project]/src/components/GameView.tsx",
                    lineNumber: 371,
                    columnNumber: 11
                }, this)
            }, void 0, false, {
                fileName: "[project]/src/components/GameView.tsx",
                lineNumber: 370,
                columnNumber: 9
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/GameView.tsx",
        lineNumber: 233,
        columnNumber: 5
    }, this);
}
_s(GameView, "QnnzEXIq0JWg9+IDVkP4j6nJnZ8=");
_c = GameView;
var _c;
__turbopack_context__.k.register(_c, "GameView");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/GameView.tsx [app-client] (ecmascript, next/dynamic entry)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/src/components/GameView.tsx [app-client] (ecmascript)"));
}),
]);

//# sourceMappingURL=src_0bm1x7f._.js.map