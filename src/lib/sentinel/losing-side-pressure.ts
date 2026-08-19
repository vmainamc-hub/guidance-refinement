// SENTINEL — LOSING-SIDE DIGIT INTELLIGENCE.
//
// Every digit that can make a contract LOSE is monitored, and the whole losing
// side is aggregated into ONE named, bounded ranking modifier:
// LOSING_SIDE_PRESSURE. It never flips a ranking on its own — it can only
// dampen (or very mildly reward) a contract, inside hard bounds, so a single
// noisy digit can never dominate the ranking.
import type { ThreatReport } from "@/lib/apex/threat";

export type LosingSidePressureState = "CALM" | "BUILDING" | "PRESSURED" | "HOSTILE";

export interface LosingSideContributor {
  digit: number;
  /** 0..100 individual threat score. */
  threat: number;
  /** Pressure above/below the digit's own baseline, in percentage points. */
  pressurePp: number;
  rising: boolean;
  state: string;
}

export interface LosingSidePressure {
  /** 0..100 aggregate hostility of the losing side. */
  index: number;
  state: LosingSidePressureState;
  /** Bounded ranking modifier applied multiplicatively: MIN_MODIFIER..MAX_MODIFIER. */
  modifier: number;
  /** Points removed from a 0..100 opportunity score by this modifier. */
  penaltyPoints: number;
  /** How many losing digits are simultaneously gaining. */
  risingCount: number;
  /** Losing digits ordered worst-first. */
  contributors: LosingSideContributor[];
  reason: string;
}

/** Hard bounds — the modifier can never exceed these, by design. */
export const LOSING_SIDE_MIN_MODIFIER = 0.72;
export const LOSING_SIDE_MAX_MODIFIER = 1.03;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function stateOf(index: number): LosingSidePressureState {
  if (index >= 72) return "HOSTILE";
  if (index >= 50) return "PRESSURED";
  if (index >= 28) return "BUILDING";
  return "CALM";
}

/**
 * Aggregate the whole losing side into a single bounded modifier.
 * Inputs are already-normalised threat-engine outputs, so this stays pure.
 */
export function losingSidePressure(threat: ThreatReport | null): LosingSidePressure {
  if (!threat || threat.losers.length === 0) {
    return {
      index: 0,
      state: "CALM",
      modifier: 1,
      penaltyPoints: 0,
      risingCount: 0,
      contributors: [],
      reason: "No losing-side telemetry available — modifier neutral.",
    };
  }

  const rising = new Set(threat.risingLosers);
  const contributors: LosingSideContributor[] = threat.threats
    .map((t) => ({
      digit: t.digit,
      threat: t.score,
      pressurePp: t.frequencyAcceleration * 100,
      rising: rising.has(t.digit),
      state: t.state,
    }))
    .sort((a, b) => b.threat - a.threat);

  const worst = contributors[0]?.threat ?? 0;
  const mean =
    contributors.length > 0
      ? contributors.reduce((s, c) => s + c.threat, 0) / contributors.length
      : 0;

  // Breadth: several losing digits rising at once is worse than one spike.
  const breadth = (threat.risingLosers.length / Math.max(1, threat.losers.length)) * 100;
  // Group mass gaining against the winning side.
  const massDrift = clamp(-threat.asymmetry, -1, 1) * 100;
  const recurrenceBump =
    threat.recurrence === "SEVERE" ? 14 : threat.recurrence === "ACTIVE" ? 8 : threat.recurrence === "WATCH" ? 3 : 0;

  const index = clamp(
    worst * 0.3 + mean * 0.2 + breadth * 0.2 + threat.groupThreat * 0.2 + clamp(massDrift, 0, 100) * 0.1 + recurrenceBump,
    0,
    100,
  );

  // Bounded modifier. Below the calm threshold the losing side is genuinely
  // quiet, which earns a very small (max +3%) reward; above it, a dampener.
  const modifier =
    index <= 20
      ? clamp(1 + (20 - index) / 20 * (LOSING_SIDE_MAX_MODIFIER - 1), 1, LOSING_SIDE_MAX_MODIFIER)
      : clamp(1 - ((index - 20) / 80) * (1 - LOSING_SIDE_MIN_MODIFIER), LOSING_SIDE_MIN_MODIFIER, 1);

  const state = stateOf(index);
  const top = contributors.slice(0, 3).map((c) => `${c.digit} (${c.threat.toFixed(0)}${c.rising ? "↑" : ""})`);
  const reason =
    `LOSING_SIDE_PRESSURE ${index.toFixed(0)}/100 (${state}) — ` +
    `${threat.risingLosers.length}/${threat.losers.length} losing digits rising, ` +
    `worst ${top.join(", ") || "none"}; group threat ${threat.groupThreat.toFixed(0)}, ` +
    `recurrence ${threat.recurrence}. Ranking modifier ×${modifier.toFixed(3)} (bounded ` +
    `${LOSING_SIDE_MIN_MODIFIER}–${LOSING_SIDE_MAX_MODIFIER}).`;

  return {
    index,
    state,
    modifier,
    penaltyPoints: 0,
    risingCount: threat.risingLosers.length,
    contributors,
    reason,
  };
}

/** Apply the bounded modifier to an opportunity score and record the cost. */
export function applyLosingSidePressure(
  opportunity: number,
  pressure: LosingSidePressure,
): { opportunity: number; pressure: LosingSidePressure } {
  const next = clamp(opportunity * pressure.modifier, 0, 100);
  return {
    opportunity: next,
    pressure: { ...pressure, penaltyPoints: Number((opportunity - next).toFixed(2)) },
  };
}
