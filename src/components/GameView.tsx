"use client";

import { useEffect, useRef, useState } from "react";
import { Match, type MatchEvent, type Phase } from "@/game/engine";
import { Stadium3D, type CamMode } from "@/game/renderer";
import { Sfx } from "@/game/sfx";
import { formatBRL, resultOf, type Pick } from "@/lib/odds";
import type { Team } from "@/lib/teams";

export interface ActiveBet {
  pick: Pick;
  stake: number; // centavos
  odds: number;
}

interface Props {
  spectator?: boolean;
  home: Team;
  away: Team;
  bet: ActiveBet;
  onFinish: (homeGoals: number, awayGoals: number) => void;
  onExit: () => void;
}

interface Hud {
  score: [number, number];
  minute: number;
  half: 1 | 2;
  phase: Phase;
  turn: 0 | 1;
}

const CAMS: { id: CamMode; label: string }[] = [
  { id: "tv", label: "TV" },
  { id: "rail", label: "Beira" },
  { id: "goal", label: "Atrás do gol" },
  { id: "top", label: "Aérea" },
];

function pickLabel(pick: Pick, home: Team, away: Team) {
  if (pick === "home") return `${home.name} vence`;
  if (pick === "away") return `${away.name} vence`;
  return "Empate";
}

export default function GameView({ home, away, bet, onFinish, onExit, spectator = false }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef(2);
  const camRef = useRef<CamMode>("tv");
  const sfxRef = useRef<Sfx | null>(null);
  const finishRef = useRef(onFinish);

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  const [speed, setSpeed] = useState(2);
  const [cam, setCam] = useState<CamMode>("tv");
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<Hud>({
    score: [0, 0],
    minute: 0,
    half: 1,
    phase: "thinking",
    turn: 0,
  });
  const [banner, setBanner] = useState<{ text: string; sub?: string; color: string } | null>(null);
  const [feed, setFeed] = useState<string[]>([`Apito inicial! ${home.name} x ${away.name}`]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [aimPower, setAimPower] = useState(0);
  const [isAiming, setIsAiming] = useState(false);

  useEffect(() => {
    const el = mountRef.current!;
    const match = new Match(home, away, spectator);
    const stadium = new Stadium3D(el, match);
    const sfx = new Sfx();
    sfxRef.current = sfx;
    let bannerTimer: ReturnType<typeof setTimeout> | undefined;
    let finishTimer: ReturnType<typeof setTimeout> | undefined;

    const say = (t: string) => setFeed((f) => [t, ...f].slice(0, 6));
    const showBanner = (b: { text: string; sub?: string; color: string }, ms: number) => {
      setBanner(b);
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => setBanner(null), ms);
    };

    const off = match.on((e: MatchEvent) => {
      switch (e.type) {
        case "goal": {
          const team = e.team === 0 ? home : away;
          stadium.celebrateGoal(e.team);
          sfx.cheer();
          sfx.whistle();
          showBanner(
            {
              text: "GOOOOL!",
              sub: `${team.name} ${e.own ? "(gol contra do adversário)" : ""}`.trim(),
              color: team.primary,
            },
            2800,
          );
          say(`${e.minute}' GOL do ${team.name}! ${match.score[0]} x ${match.score[1]}`);
          break;
        }
        case "kickoff":
          say(`Bola rolando: saída de bola do ${e.team === 0 ? home.name : away.name}.`);
          break;
        case "halftime":
          sfx.whistle(true);
          showBanner({ text: "INTERVALO", sub: `${match.score[0]} x ${match.score[1]}`, color: "#0f172a" }, 2600);
          say(`Fim do 1º tempo: ${match.score[0]} x ${match.score[1]}`);
          break;
        case "fulltime":
          sfx.whistle(true);
          showBanner({ text: "FIM DE JOGO", sub: `${home.name} ${match.score[0]} x ${match.score[1]} ${away.name}`, color: "#0f172a" }, 4000);
          say(`Fim de jogo: ${match.score[0]} x ${match.score[1]}`);
          finishTimer = setTimeout(() => finishRef.current(match.score[0], match.score[1]), 2800);
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
    });

    const hudTimer = setInterval(() => {
      setHud({
        score: [match.score[0], match.score[1]],
        minute: match.minute,
        half: match.half,
        phase: match.phase,
        turn: match.turn,
      });
    }, 120);

    let raf = 0;
    const portraitMobile = window.matchMedia("(max-width: 767px) and (orientation: portrait) and (pointer: coarse)");
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      let sim = portraitMobile.matches ? 0 : dt * speedRef.current;
      const simTotal = sim;
      while (sim > 0) {
        const step = Math.min(sim, 0.2);
        match.update(step);
        sim -= step;
      }
      stadium.render(dt, simTotal, camRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const unlock = () => sfx.init();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    const canvas = stadium.getCanvas();
    let selectedId: number | null = null;
    const pointerDown = (event: PointerEvent) => {
      const body = stadium.pickButton(event.clientX, event.clientY, 0);
      if (!body || !match.beginHumanAim(body.id)) return;
      selectedId = body.id;
      canvas.setPointerCapture(event.pointerId);
      setIsAiming(true);
      setAimPower(0);
      event.preventDefault();
    };
    const pointerMove = (event: PointerEvent) => {
      if (selectedId === null) return;
      const body = match.bodies.find((b) => b.id === selectedId);
      const point = stadium.pointOnPitch(event.clientX, event.clientY);
      if (!body || !point) return;
      // Estilingue: puxe para trás e solte para lançar na direção oposta.
      setAimPower(match.aimHuman(body.x - point.x, body.z - point.z));
      event.preventDefault();
    };
    const pointerUp = (event: PointerEvent) => {
      if (selectedId === null) return;
      selectedId = null;
      if (!match.shootHuman()) setAimPower(0);
      setIsAiming(false);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      event.preventDefault();
    };
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudTimer);
      clearTimeout(bannerTimer);
      clearTimeout(finishTimer);
      off();
      sfx.dispose();
      sfxRef.current = null;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      stadium.dispose();
    };
  }, [home, away, spectator]);

  const changeSpeed = (s: number) => {
    speedRef.current = s;
    setSpeed(s);
  };
  const changeCam = (c: CamMode) => {
    camRef.current = c;
    setCam(c);
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    sfxRef.current?.init();
    sfxRef.current?.setMuted(m);
  };

  const current = resultOf(hud.score[0], hud.score[1]);
  const winning = current === bet.pick;

  return (
    <div className="game-screen fixed inset-0 bg-black text-white select-none">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="rotate-notice absolute inset-0 z-40 flex-col items-center justify-center bg-slate-950 px-8 text-center" role="status">
        <span className="mb-5 text-6xl" aria-hidden="true">↻</span>
        <h2 className="text-2xl font-black text-emerald-300">Gire o celular para jogar</h2>
        <p className="mt-3 max-w-xs text-white/70">Deixe o aparelho deitado para ver todo o campo. A partida fica pausada enquanto você gira a tela.</p>
        <button onClick={onExit} className="mt-8 rounded-xl bg-white/10 px-5 py-3 font-semibold">Voltar às seleções</button>
      </div>

      {/* Placar */}
      <div className="game-score pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
        <div className="flex items-stretch overflow-hidden rounded-xl bg-slate-950/85 shadow-2xl ring-1 ring-white/15 backdrop-blur">
          <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
            <img src={home.crest} alt="" className="h-6 w-8 rounded-sm object-cover shadow" />
            <span className="text-sm font-bold tracking-wide sm:text-lg">{home.short}</span>
          </div>
          <div className="flex items-center bg-white px-3 text-2xl font-black tabular-nums text-slate-900 sm:px-4 sm:text-3xl">
            {hud.score[0]}<span className="px-1.5 text-slate-400">-</span>{hud.score[1]}
          </div>
          <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
            <span className="text-sm font-bold tracking-wide sm:text-lg">{away.short}</span>
            <img src={away.crest} alt="" className="h-6 w-8 rounded-sm object-cover shadow" />
          </div>
          <div className="flex min-w-[72px] flex-col items-center justify-center bg-emerald-600 px-3 text-xs font-semibold leading-tight">
            <span className="text-base font-black tabular-nums">{hud.minute}&apos;</span>
            <span className="opacity-90">{hud.half}º tempo</span>
          </div>
        </div>
        <p className="mt-1 text-center text-xs font-medium text-white/80 drop-shadow">
          {hud.phase === "ended"
            ? "Encerrado"
            : hud.phase === "halftime"
              ? "Intervalo"
              : spectator
                ? `CPU · ${hud.turn === 0 ? home.name : away.name}`
                : hud.turn === 0
                ? `Sua vez · ${home.name}`
                : `CPU pensando · ${away.name}`}
        </p>
      </div>

      {!spectator && hud.phase === "thinking" && hud.turn === 0 && (
        <div className="game-aim pointer-events-none absolute bottom-5 left-1/2 z-10 w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl bg-slate-950/85 px-5 py-3 text-center shadow-2xl ring-1 ring-white/15 backdrop-blur">
          <p className="font-bold text-emerald-300">
            {isAiming ? "Solte para chutar" : "Clique em um botão, puxe para trás e solte"}
          </p>
          <p className="mt-0.5 text-xs text-white/65">Você joga com {home.name}. Quanto mais puxar, mais forte será a jogada.</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-rose-500 transition-[width]"
              style={{ width: `${Math.round(aimPower * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Aposta */}
      {bet.stake > 0 && <div className="game-bet absolute left-3 top-3 z-10 w-56 rounded-xl bg-slate-950/80 p-3 text-xs shadow-xl ring-1 ring-white/15 backdrop-blur sm:w-64 sm:text-sm">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">Sua aposta</p>
        <p className="mt-1 font-semibold">{pickLabel(bet.pick, home, away)}</p>
        <p className="text-white/70">
          {formatBRL(bet.stake)} @ {bet.odds.toFixed(2)}
        </p>
        <p className="mt-1 text-white/70">
          Retorno: <span className="font-bold text-amber-300">{formatBRL(Math.round(bet.stake * bet.odds))}</span>
        </p>
        <p
          className={`mt-2 rounded-md px-2 py-1 text-center text-xs font-bold ${
            winning ? "bg-emerald-500/25 text-emerald-300" : "bg-rose-500/25 text-rose-300"
          }`}
        >
          {winning ? "Ganhando agora" : "Perdendo agora"}
        </p>
      </div>

      }
      {/* Controles */}
      <div className="game-controls absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-950/80 p-1 ring-1 ring-white/15 backdrop-blur">
          {CAMS.map((c) => (
            <button
              key={c.id}
              onClick={() => changeCam(c.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
                cam === c.id ? "bg-emerald-500 text-white" : "text-white/75 hover:bg-white/10"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-slate-950/80 p-1 ring-1 ring-white/15 backdrop-blur">
          {[1, 2, 4, 8].map((s) => (
            <button
              key={s}
              onClick={() => changeSpeed(s)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
                speed === s ? "bg-amber-400 text-slate-900" : "text-white/75 hover:bg-white/10"
              }`}
            >
              {s}x
            </button>
          ))}
          <button
            onClick={toggleMute}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/10 sm:text-sm"
            title="Som"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
        <button
          onClick={() => setConfirmExit(true)}
          className="rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-rose-300 ring-1 ring-white/15 backdrop-blur hover:bg-rose-500/20"
        >
          Sair
        </button>
      </div>

      {/* Narração */}
      <div className="game-feed pointer-events-none absolute bottom-3 left-3 z-10 max-w-[70%] space-y-1 sm:max-w-sm">
        {feed.slice(0, 4).map((f, i) => (
          <p
            key={`${f}-${i}`}
            className="w-fit rounded-md bg-slate-950/70 px-2.5 py-1 text-xs text-white shadow ring-1 ring-white/10 backdrop-blur"
            style={{ opacity: 1 - i * 0.22 }}
          >
            {f}
          </p>
        ))}
      </div>

      {/* Banner */}
      {banner && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center px-4">
          <div
            className="animate-[pop_0.35s_ease-out] rounded-2xl px-8 py-5 text-center shadow-2xl ring-2 ring-white/40"
            style={{ background: `linear-gradient(135deg, ${banner.color}, #020617)` }}
          >
            <p className="text-4xl font-black tracking-wider drop-shadow sm:text-6xl">{banner.text}</p>
            {banner.sub && <p className="mt-1 text-base font-semibold text-white/90 sm:text-xl">{banner.sub}</p>}
          </div>
        </div>
      )}

      {confirmExit && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 text-center ring-1 ring-white/15">
            <p className="text-lg font-bold">Sair da partida?</p>
            <p className="mt-2 text-sm text-white/70">{bet.stake === 0 ? "Voltar para a escolha das seleções?" : `Se sair agora você perde a aposta de ${formatBRL(bet.stake)}.`}</p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmExit(false)}
                className="flex-1 rounded-xl bg-white/10 py-2.5 font-semibold hover:bg-white/20"
              >
                Continuar assistindo
              </button>
              <button onClick={onExit} className="flex-1 rounded-xl bg-rose-600 py-2.5 font-semibold hover:bg-rose-500">
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
