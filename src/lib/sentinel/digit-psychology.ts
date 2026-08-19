// APEX SENTINEL — CANONICAL DIGIT-FREQUENCY PSYCHOLOGY (1,000-TICK LAYER).
//
// NON-DESTRUCTIVE: this module adds one canonical, normalised digit-frequency
// state and a positional (winning / losing / boundary) reading of it per
// contract. It scores nothing on its own authority: every output is bounded
// evidence handed to the EXISTING ranking, entry and explanation layers.
//
// Roles are earned from the data. There is no universal digit veto here — a
// digit may hold any role when the observed frequencies say so.
//
//   GREEN          = highest-frequency digit over the canonical window
//   2ND GREEN      = second-highest
//   RED            = lowest-frequency digit
//   2ND RED        = second-lowest
//   MOST INCREASING= strongest validated recent gain in frequency
//   MOST DECREASING= strongest validated recent loss in frequency
//
// Shorter windows are NOT collapsed away: they decide whether the canonical
// configuration is stable, strengthening, weakening, rotating or invalidated.
import type { DigitIntel } from "../apex/digit-intel";

/** Canonical window length in ticks. */
export const CANONICAL_WINDOW = 1000;
/** Recency window used to measure change against the canonical structure. */
export const RECENCY_WINDOW = 200;
/** Minimum |pp| move before a digit is called increasing / decreasing. */
export const MOVE_MIN_PP = 0.5;

export type PsychologyChange =
  | "INSUFFICIENT"
  | "STABLE"
  | "STRENGTHENING"
  | "WEAKENING"
  | "ROTATING"
  | "INVALIDATED";

export interface CanonicalDigitState {
  /** Ticks actually used from the canonical window. */
  n: number;
  /** Per-digit share of the canonical window, in percent. */
  pct: number[];
  /** Per-digit recent share (RECENCY_WINDOW), in percent. */
  recentPct: number[];
  /** recentPct − pct, in percentage points. */
  deltaPp: number[];
  green: number | null;
  secondGreen: number | null;
  red: number | null;
  secondRed: number | null;
  mostIncreasing: number | null;
  mostDecreasing: number | null;
  change: PsychologyChange;
  changeDetail: string;
  summary: string;
}

function shareOf(seg: number[], d: number): number {
  if (!seg.length) return 0;
  let c = 0;
  for (const x of seg) if (x === d) c++;
  return (c / seg.length) * 100;
}

/**
 * Build the canonical 1,000-tick digit-frequency state. Pure, and derived only
 * from observed digits (the DigitIntel argument is used for corroboration of
 * momentum, never to invent a role).
 */
export function canonicalDigitState(
  digits: number[],
  intel?: DigitIntel | null,
): CanonicalDigitState {
  const window = digits.slice(-CANONICAL_WINDOW);
  const recent = digits.slice(-RECENCY_WINDOW);
  const n = window.length;
  const pct = Array.from({ length: 10 }, (_, d) => shareOf(window, d));
  const recentPct = Array.from({ length: 10 }, (_, d) => shareOf(recent, d));
  const deltaPp = pct.map((p, d) => recentPct[d] - p);

  const enough = n >= 300;
  const byFreq = pct.map((p, d) => ({ d, p })).sort((a, b) => b.p - a.p || a.d - b.d);
  const green = enough ? byFreq[0].d : null;
  const secondGreen = enough ? byFreq[1].d : null;
  const red = enough ? byFreq[byFreq.length - 1].d : null;
  const secondRed = enough ? byFreq[byFreq.length - 2].d : null;

  // Momentum is corroborated: the recent share move must agree in sign with the
  // per-digit momentum the existing intelligence layer already measures.
  const agrees = (d: number, sign: 1 | -1) => {
    const m = intel?.profiles?.[d]?.momentum;
    if (m === undefined) return true;
    return sign > 0 ? m >= 0 : m <= 0;
  };
  let inc: number | null = null;
  let dec: number | null = null;
  if (enough) {
    let bestUp = MOVE_MIN_PP;
    let bestDown = -MOVE_MIN_PP;
    for (let d = 0; d < 10; d++) {
      if (deltaPp[d] > bestUp && agrees(d, 1)) {
        bestUp = deltaPp[d];
        inc = d;
      }
      if (deltaPp[d] < bestDown && agrees(d, -1)) {
        bestDown = deltaPp[d];
        dec = d;
      }
    }
  }

  // ── Configuration change, from the shorter window ────────────────────
  let change: PsychologyChange = "INSUFFICIENT";
  let changeDetail = `Only ${n} tick(s) of canonical history — the 1,000-tick configuration is not yet measurable.`;
  if (enough && recent.length >= 80 && green !== null && red !== null) {
    const shortRank = recentPct.map((p, d) => ({ d, p })).sort((a, b) => b.p - a.p || a.d - b.d);
    const shortTop = shortRank[0].d;
    const shortBottomTwo = [shortRank[8].d, shortRank[9].d];
    const greenMove = deltaPp[green];
    if (shortBottomTwo.includes(green)) {
      change = "INVALIDATED";
      changeDetail = `Green digit ${green} has collapsed into the least-frequent pair of the last ${recent.length} ticks (${greenMove.toFixed(2)}pp).`;
    } else if (shortTop !== green && recentPct[green] < 10) {
      change = "ROTATING";
      changeDetail = `Leadership is rotating: digit ${shortTop} now leads the last ${recent.length} ticks while canonical green ${green} sits at ${recentPct[green].toFixed(2)}%.`;
    } else if (shortTop === green && greenMove >= 0.4) {
      change = "STRENGTHENING";
      changeDetail = `Green digit ${green} still leads the recent window and is gaining ${greenMove.toFixed(2)}pp.`;
    } else if (greenMove <= -0.6) {
      change = "WEAKENING";
      changeDetail = `Green digit ${green} is losing ${Math.abs(greenMove).toFixed(2)}pp of share in the last ${recent.length} ticks.`;
    } else {
      change = "STABLE";
      changeDetail = `Canonical configuration is holding (green ${green} moved ${greenMove.toFixed(2)}pp over the last ${recent.length} ticks).`;
    }
  }

  const summary = enough
    ? `GREEN ${green} · 2ND GREEN ${secondGreen} · RED ${red} · 2ND RED ${secondRed} · MOST INCREASING ${inc ?? "—"} · MOST DECREASING ${dec ?? "—"} (${n} ticks, ${change})`
    : `Canonical digit psychology unavailable — ${n} tick(s) of ${CANONICAL_WINDOW}.`;

  return {
    n,
    pct,
    recentPct,
    deltaPp,
    green,
    secondGreen,
    red,
    secondRed,
    mostIncreasing: inc,
    mostDecreasing: dec,
    change,
    changeDetail,
    summary,
  };
}

// ──────────────────────────────────────────────────────────────────────
// POSITIONAL PSYCHOLOGY — where the five roles sit for a given contract.
// ──────────────────────────────────────────────────────────────────────

export type Zone = "WINNING" | "LOSING" | "BOUNDARY" | "UNKNOWN";
export type PsychologyVerdict = "SUPPORT" | "NEUTRAL" | "CONFLICT";

export interface RolePosition {
  role: "GREEN" | "2ND GREEN" | "RED" | "2ND RED" | "MOST INCREASING" | "MOST DECREASING";
  digit: number | null;
  zone: Zone;
  /** +1 supports the contract, −1 conflicts, 0 neutral / not evaluable. */
  support: -1 | 0 | 1;
  note: string;
}

export interface ContractPsychology {
  contract: string;
  side: "OVER" | "UNDER";
  barrier: number;
  winningZone: number[];
  losingZone: number[];
  boundary: number[];
  positions: RolePosition[];
  /** 0..100 — 50 is neutral. */
  score: number;
  /** 0..100 — how much of the configuration could actually be measured. */
  confidence: number;
  verdict: PsychologyVerdict;
  /** Bounded ranking contribution in score points (±4). */
  rankingDelta: number;
  reasons: string[];
  cautions: string[];
  summary: string;
}

export interface ContractShape {
  label: string;
  side: "OVER" | "UNDER";
  barrier: number;
  winners: number[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function zoneOf(d: number, winners: number[], boundary: number[]): Zone {
  if (boundary.includes(d)) return "BOUNDARY";
  return winners.includes(d) ? "WINNING" : "LOSING";
}

function decayingEnough(state: CanonicalDigitState, d: number, intel?: DigitIntel | null): boolean {
  const move = state.deltaPp[d] ?? 0;
  const p = intel?.profiles?.[d];
  return move < -MOVE_MIN_PP || (p ? p.pressure < 0 || p.frequencyVelocity < 0 : false);
}

/**
 * Evaluate the canonical roles against one contract's winning / losing /
 * boundary regions plus the operator's Over and Under parity psychology.
 *
 * Weighted evidence — never a binary gate. Nothing here can block a market;
 * it produces a bounded ranking contribution and an explanation.
 */
export function contractPsychology(
  state: CanonicalDigitState,
  shape: ContractShape,
  intel?: DigitIntel | null,
): ContractPsychology {
  const winners = shape.winners;
  const all = Array.from({ length: 10 }, (_, d) => d);
  const losers = all.filter((d) => !winners.includes(d));
  const boundary =
    shape.side === "OVER"
      ? [shape.barrier, shape.barrier + 1].filter((d) => d >= 0 && d <= 9)
      : [shape.barrier - 1, shape.barrier].filter((d) => d >= 0 && d <= 9);

  const positions: RolePosition[] = [];
  const reasons: string[] = [];
  const cautions: string[] = [];
  let gained = 0;
  let weightTotal = 0;
  let measured = 0;
  let measurable = 0;

  const add = (
    role: RolePosition["role"],
    digit: number | null,
    weight: number,
    evaluate: (d: number, zone: Zone) => { support: -1 | 0 | 1; note: string },
  ) => {
    measurable += 1;
    if (digit === null) {
      positions.push({ role, digit: null, zone: "UNKNOWN", support: 0, note: "Not measurable yet." });
      return;
    }
    measured += 1;
    const zone = zoneOf(digit, winners, boundary);
    const { support, note } = evaluate(digit, zone);
    positions.push({ role, digit, zone, support, note });
    weightTotal += weight;
    gained += support * weight;
    if (support > 0) reasons.push(`${role} ${digit} — ${note}`);
    if (support < 0) cautions.push(`${role} ${digit} — ${note}`);
  };

  const isEven = (d: number) => d % 2 === 0;

  // GREEN — highest-frequency digit. Parity psychology + zone position.
  add("GREEN", state.green, 26, (d, zone) => {
    const parityOk = shape.side === "OVER" ? isEven(d) : !isEven(d);
    // Extreme-green requirement preserved: Over prefers an exhausted 0,
    // Under prefers an exhausted 9.
    const extreme = (shape.side === "OVER" && d === 0) || (shape.side === "UNDER" && d === 9);
    if (extreme && !decayingEnough(state, d, intel)) {
      return {
        support: -1 as const,
        note: `sits on the extreme digit ${d} and is not decreasing — ${shape.side} psychology requires it to be fading.`,
      };
    }
    if (parityOk && zone !== "LOSING") {
      return {
        support: 1 as const,
        note: `${shape.side === "OVER" ? "even" : "odd"} and in the ${zone.toLowerCase()} region — supports ${shape.side}.`,
      };
    }
    if (!parityOk && zone === "LOSING") {
      return { support: -1 as const, note: `wrong parity and inside the losing region.` };
    }
    return {
      support: 0 as const,
      note: `${parityOk ? "correct parity" : "wrong parity"} but ${zone.toLowerCase()} position is mixed.`,
    };
  });

  add("2ND GREEN", state.secondGreen, 12, (_d, zone) =>
    zone === "WINNING"
      ? { support: 1 as const, note: "second-most-frequent digit reinforces the winning region." }
      : zone === "LOSING"
        ? { support: -1 as const, note: "second-most-frequent digit is feeding the losing region." }
        : { support: 0 as const, note: "sits on the contract boundary — no clear contribution." },
  );

  // RED — least frequent digit. Parity exclusions preserved (Over excludes 1,
  // Under excludes 8) and a red digit inside the losing region is support.
  add("RED", state.red, 20, (d, zone) => {
    const excluded = (shape.side === "OVER" && d === 1) || (shape.side === "UNDER" && d === 8);
    if (excluded) {
      return {
        support: -1 as const,
        note: `${shape.side} psychology explicitly excludes a red digit on ${d}.`,
      };
    }
    const parityOk = shape.side === "OVER" ? !isEven(d) : isEven(d);
    if (zone === "LOSING" && parityOk) {
      return { support: 1 as const, note: "least-frequent digit sits in the losing region with the preferred parity." };
    }
    if (zone === "LOSING") {
      return { support: 1 as const, note: "least-frequent digit sits in the losing region." };
    }
    if (zone === "WINNING") {
      return { support: -1 as const, note: "the winning region is currently the starved one." };
    }
    return { support: 0 as const, note: "sits on the contract boundary." };
  });

  add("2ND RED", state.secondRed, 10, (_d, zone) =>
    zone === "LOSING"
      ? { support: 1 as const, note: "second-least-frequent digit is also in the losing region." }
      : zone === "WINNING"
        ? { support: -1 as const, note: "a winning digit is among the starved ones." }
        : { support: 0 as const, note: "boundary position — neutral." },
  );

  add("MOST INCREASING", state.mostIncreasing, 22, (d, zone) =>
    zone === "WINNING"
      ? {
          support: 1 as const,
          note: `gaining ${state.deltaPp[d].toFixed(2)}pp inside the winning region.`,
        }
      : zone === "LOSING"
        ? {
            support: -1 as const,
            note: `gaining ${state.deltaPp[d].toFixed(2)}pp inside the LOSING region — pressure against the contract.`,
          }
        : { support: 0 as const, note: "building on the boundary — watch for a barrier test." },
  );

  add("MOST DECREASING", state.mostDecreasing, 8, (d, zone) =>
    zone === "LOSING"
      ? { support: 1 as const, note: `fading ${Math.abs(state.deltaPp[d]).toFixed(2)}pp out of the losing region.` }
      : zone === "WINNING"
        ? { support: -1 as const, note: `fading ${Math.abs(state.deltaPp[d]).toFixed(2)}pp out of the winning region.` }
        : { support: 0 as const, note: "fading on the boundary." },
  );

  const score = weightTotal > 0 ? Math.round(50 + (gained / weightTotal) * 50) : 50;
  const coverage = measurable ? measured / measurable : 0;
  const dataFactor = Math.min(1, state.n / CANONICAL_WINDOW);
  const changePenalty =
    state.change === "INVALIDATED" ? 0.55 : state.change === "ROTATING" ? 0.75 : 1;
  const confidence = Math.round(
    clamp((coverage * 55 + dataFactor * 45) * changePenalty, 0, 100),
  );
  const verdict: PsychologyVerdict = score >= 65 ? "SUPPORT" : score <= 35 ? "CONFLICT" : "NEUTRAL";
  const rankingDelta =
    Math.round(clamp(((score - 50) / 50) * 4 * (confidence / 100), -4, 4) * 10) / 10;

  if (state.change === "ROTATING" || state.change === "INVALIDATED") {
    cautions.push(`Configuration ${state.change} — ${state.changeDetail}`);
  }

  return {
    contract: shape.label,
    side: shape.side,
    barrier: shape.barrier,
    winningZone: winners,
    losingZone: losers,
    boundary,
    positions,
    score,
    confidence,
    verdict,
    rankingDelta,
    reasons,
    cautions,
    summary: `${shape.label}: digit psychology ${verdict} (${score}/100 at confidence ${confidence}/100, configuration ${state.change}).`,
  };
}

/**
 * Bounded, per-digit psychology bias for the Entry-Point Engine. It answers
 * "given this configuration, is entering on THIS digit psychologically sound?"
 * and never exceeds ±3 points, so it can shade a ranking but not create one.
 */
export function entryDigitPsychologyBias(
  state: CanonicalDigitState,
  psych: ContractPsychology,
  digit: number,
): { points: number; detail: string } {
  if (state.n < 300) {
    return { points: 0, detail: "Canonical digit psychology not measurable yet — no entry influence." };
  }
  const zone = zoneOf(digit, psych.winningZone, psych.boundary);
  const notes: string[] = [`entry digit ${digit} is in the ${zone.toLowerCase()} region`];
  let pts = 0;
  if (zone === "WINNING") pts += 1.2;
  if (zone === "LOSING") pts -= 1.5;
  if (zone === "BOUNDARY") pts -= 0.5;

  if (digit === state.mostIncreasing) {
    const bonus = zone === "LOSING" ? -1.2 : 1.2;
    pts += bonus;
    notes.push(`it is the MOST INCREASING digit (${state.deltaPp[digit].toFixed(2)}pp)`);
  }
  if (digit === state.mostDecreasing) {
    pts += zone === "WINNING" ? -0.8 : 0.6;
    notes.push(`it is the MOST DECREASING digit (${state.deltaPp[digit].toFixed(2)}pp)`);
  }
  if (digit === state.green) {
    pts += zone === "LOSING" ? -0.8 : 0.6;
    notes.push("it is the GREEN (highest-frequency) digit");
  }
  if (digit === state.red) {
    pts += zone === "LOSING" ? 0.5 : -0.4;
    notes.push("it is the RED (lowest-frequency) digit");
  }
  // The overall configuration verdict tilts every candidate slightly, and the
  // positional part above is what differentiates them.
  pts += psych.verdict === "SUPPORT" ? 0.5 : psych.verdict === "CONFLICT" ? -0.5 : 0;

  const scaled = pts * Math.max(0.4, psych.confidence / 100);
  return {
    points: Math.round(clamp(scaled, -3, 3) * 10) / 10,
    detail: `${notes.join("; ")}. Contract psychology ${psych.verdict} (${psych.score}/100).`,
  };
}
