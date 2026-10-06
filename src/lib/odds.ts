import type { Team } from "./teams";

export type Pick = "home" | "draw" | "away";

export interface Odds {
  home: number;
  draw: number;
  away: number;
}

const MARGIN = 0.92; // margem da casa

/** Probabilidades aproximadas a partir da força dos times. */
export function probabilities(home: Team, away: Team) {
  // calibrado com simulações do próprio jogo: ~34% de empates
  const d = (home.strength - away.strength) / 20;
  const pDraw = 0.34;
  const raw = 1 / (1 + Math.exp(-d));
  return {
    home: (1 - pDraw) * raw,
    draw: pDraw,
    away: (1 - pDraw) * (1 - raw),
  };
}

export function computeOdds(home: Team, away: Team): Odds {
  const p = probabilities(home, away);
  const f = (x: number) => Math.max(1.12, Math.round((MARGIN / x) * 100) / 100);
  return { home: f(p.home), draw: f(p.draw), away: f(p.away) };
}

export function resultOf(homeGoals: number, awayGoals: number): Pick {
  if (homeGoals > awayGoals) return "home";
  if (homeGoals < awayGoals) return "away";
  return "draw";
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
