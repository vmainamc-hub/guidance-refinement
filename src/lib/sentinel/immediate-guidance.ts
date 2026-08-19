// APEX SENTINEL — CHANNEL 1: IMMEDIATE OPERATOR GUIDANCE.
//
// This is NOT statistical learning. It is a temporary, bounded, auditable
// overlay that lets an operator observation influence the NEXT ranking cycle
// without waiting for confirmed trades. Channel 2 (validated statistical
// learning in operator-learning.ts) is untouched and keeps its sample gating.
//
// Hard rules honoured here:
//   • A written note NEVER becomes a WIN or a LOSS.
//   • A directive is scoped to the exact market × contract (× entry digit when
//     the snapshot has one). Market A never influences market B.
//   • Every directive expires; nothing here can become a permanent hidden veto.
//   • Adjustments are bounded and attributed; they may penalise, prefer or
//     suppress, but they can never fabricate evidence or force ENTER NOW.
//   • A later operator note supersedes the earlier directive for the same
//     source, and for the same scope + directive type.
import type { FeedbackCategory, TradeSnapshot } from "./trade-feedback";

const KEY = "sentinel.immediate-guidance.v1";

/** Default life of an immediate directive: short, relevant to the next signals. */
export const DEFAULT_TTL_MS = 30 * 60 * 1000;
/** No candidate may be moved by more than this by the immediate layer. */
export const MAX_GUIDANCE_RANKING_DELTA = 6;
/** No entry digit may be moved by more than this by the immediate layer. */
export const MAX_GUIDANCE_ENTRY_DELTA = 6;

export type DirectiveType =
  | "ENTRY_TIMING_LATE"
  | "DANGER_DIGIT"
  | "ENTRY_DIGIT_FAILING"
  | "MARKET_ROTATION"
  | "CAUTION"
  | "SUPPORT";

export interface OperatorDirective {
  id: string;
  /** Feedback/observation id this directive was derived from. */
  sourceId: string;
  ts: number;
  expiresAt: number;
  symbol: string;
  contract: string;
  contractLabel: string;
  /** Entry digit frozen in the feedback snapshot, when there was one. */
  entryDigit: number | null;
  /** Digit the operator explicitly named, when unambiguous. */
  targetDigit: number | null;
  type: DirectiveType;
  category: FeedbackCategory | null;
  text: string;
  label: string;
  /** Bounded, undecayed ranking contribution in score points. */
  rankingAdjustment: number;
  /** Bounded, undecayed entry-digit contribution in entry-point points. */
  entryDigitAdjustment: number;
}

interface Store {
  version: 1;
  directives: OperatorDirective[];
}

let store: Store | null = null;
let revision = 0;
const listeners = new Set<() => void>();

function blank(): Store {
  return { version: 1, directives: [] };
}

function load(): Store {
  if (store) return store;
  store = blank();
  if (typeof window === "undefined") return store;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      if (parsed && Array.isArray(parsed.directives)) {
        store = { version: 1, directives: parsed.directives.filter(Boolean) };
      }
    }
  } catch {
    store = blank();
  }
  return store;
}

function persist() {
  if (!store) return;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* storage full or unavailable — the in-memory overlay still applies */
    }
  }
  revision++;
  listeners.forEach((l) => l());
}

/** Monotonic revision — participates in every feedback-dependent cache key. */
export function guidanceRevision(): number {
  return revision;
}

export function subscribeGuidance(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearGuidance() {
  store = blank();
  persist();
}

/** Test/maintenance helper — drops persisted state without emitting storage. */
export function resetGuidanceForTests() {
  store = blank();
  revision++;
}

export function activeDirectives(now = Date.now()): OperatorDirective[] {
  const s = load();
  const live = s.directives.filter((d) => d.expiresAt > now);
  if (live.length !== s.directives.length) {
    s.directives = live;
    persist();
  }
  return [...live].sort((a, b) => b.ts - a.ts);
}

export function removeDirectivesBySource(sourceId: string) {
  const s = load();
  const before = s.directives.length;
  s.directives = s.directives.filter((d) => d.sourceId !== sourceId);
  if (s.directives.length !== before) persist();
}

// ── INTERPRETATION (Part L) ───────────────────────────────────────────────
// Ambiguous text is never turned into a specific directional rule. When the
// meaning is not explicit, the note becomes a generic bounded caution on the
// exact snapshot it was written against.

const DIGIT_RE = /\bdigit\s*([0-9])\b/i;

function explicitDigit(text: string): number | null {
  const m = DIGIT_RE.exec(text);
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 0 && d <= 9 ? d : null;
}

export interface DerivedDirective {
  type: DirectiveType;
  label: string;
  rankingAdjustment: number;
  entryDigitAdjustment: number;
  targetDigit: number | null;
}

/** Pure interpretation, exported so the reasoning is testable in isolation. */
export function interpretFeedback(
  text: string,
  category: FeedbackCategory | null,
  snapshot: Pick<TradeSnapshot, "entryDigit">,
): DerivedDirective {
  const t = text.toLowerCase();
  const named = explicitDigit(text);

  const late = category === "ENTRY TOO LATE" || /too late|late entry|entered late/.test(t);
  if (late)
    return {
      type: "ENTRY_TIMING_LATE",
      label: "Operator: entry timing too late",
      rankingAdjustment: -3,
      entryDigitAdjustment: -3,
      targetDigit: named ?? snapshot.entryDigit,
    };

  const failing =
    category === "ENTRY DIGIT" &&
    /fail|not work|stopped|bad|avoid|use another|another digit|wrong/.test(t);
  if (failing)
    return {
      type: "ENTRY_DIGIT_FAILING",
      label: "Operator: this entry digit is failing",
      rankingAdjustment: -1.5,
      entryDigitAdjustment: -6,
      targetDigit: named ?? snapshot.entryDigit,
    };

  const danger = category === "DANGER" || /danger|dangerous|risky|becoming active/.test(t);
  if (danger)
    return {
      type: "DANGER_DIGIT",
      label: named !== null ? `Operator: digit ${named} dangerous here` : "Operator: danger reported",
      rankingAdjustment: named !== null ? -4 : -2.5,
      entryDigitAdjustment: named !== null ? -4 : 0,
      targetDigit: named,
    };

  const rotation = category === "MARKET ROTATION" || /rotat/.test(t);
  if (rotation)
    return {
      type: "MARKET_ROTATION",
      label: "Operator: market rotation — fresh confirmation required",
      rankingAdjustment: -3,
      entryDigitAdjustment: 0,
      targetDigit: null,
    };

  const strong =
    category === "STRONG SIGNAL" || /working well|clean setup|good entry|reliable/.test(t);
  if (strong)
    return {
      type: "SUPPORT",
      label: "Operator: setup reported as working",
      rankingAdjustment: 1.5,
      entryDigitAdjustment: 1,
      targetDigit: named ?? snapshot.entryDigit,
    };

  const weak =
    category === "WEAK SIGNAL" ||
    category === "PRESSURE REVERSAL" ||
    /weak|deterior|getting worse|unstable/.test(t);
  if (weak)
    return {
      type: "CAUTION",
      label: "Operator: setup reported as weakening",
      rankingAdjustment: -2,
      entryDigitAdjustment: 0,
      targetDigit: null,
    };

  // Ambiguous — a bounded attention marker on the exact snapshot only.
  return {
    type: "CAUTION",
    label: "Operator attention on this exact signal",
    rankingAdjustment: -1,
    entryDigitAdjustment: 0,
    targetDigit: null,
  };
}

export interface RecordDirectiveInput {
  sourceId: string;
  text: string;
  category: FeedbackCategory | null;
  snapshot: TradeSnapshot;
  ttlMs?: number;
  now?: number;
}

/**
 * Derive and store the immediate directive for one operator note. Re-recording
 * the same `sourceId` (the operator corrected the note) SUPERSEDES the old one.
 */
export function recordFeedbackDirective(input: RecordDirectiveInput): OperatorDirective | null {
  const clean = input.text.trim();
  if (!clean) return null;
  const now = input.now ?? Date.now();
  const derived = interpretFeedback(clean, input.category, input.snapshot);
  const s = load();
  // Supersede: same source, and same scope + type from an earlier note.
  s.directives = s.directives.filter(
    (d) =>
      d.sourceId !== input.sourceId &&
      !(
        d.symbol === input.snapshot.symbol &&
        d.contract === input.snapshot.contract &&
        d.type === derived.type &&
        d.targetDigit === derived.targetDigit
      ),
  );
  const directive: OperatorDirective = {
    id: `dir-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sourceId: input.sourceId,
    ts: now,
    expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
    symbol: input.snapshot.symbol,
    contract: input.snapshot.contract,
    contractLabel: input.snapshot.contractLabel,
    entryDigit: input.snapshot.entryDigit,
    targetDigit: derived.targetDigit,
    type: derived.type,
    category: input.category,
    text: clean,
    label: derived.label,
    rankingAdjustment: derived.rankingAdjustment,
    entryDigitAdjustment: derived.entryDigitAdjustment,
  };
  s.directives.push(directive);
  persist();
  return directive;
}

/** Linear decay to a 0.25 floor over the directive's lifetime. */
function decay(d: OperatorDirective, now: number): number {
  const life = d.expiresAt - d.ts;
  if (life <= 0) return 0;
  const remaining = (d.expiresAt - now) / life;
  if (remaining <= 0) return 0;
  return Math.max(0.25, Math.min(1, remaining));
}

export interface GuidanceEffect {
  /** Bounded ranking contribution for this market × contract, in score points. */
  points: number;
  /** Directives currently in force for this scope. */
  directives: OperatorDirective[];
  /** Compact, attributed explanation for the score factor and the UI chip. */
  detail: string;
  active: boolean;
}

const round = (v: number) => Math.round(v * 10) / 10;

export interface ImmediateGuidanceLookup {
  revision: number;
  /** Ranking effect for a market × contract candidate. */
  forCandidate: (symbol: string, contract: string) => GuidanceEffect;
  /** Bounded entry-point adjustment for one candidate entry digit. */
  entryAdjustment: (symbol: string, contract: string, digit: number) => number;
  /** Directives touching one entry digit, for transparency in the entry report. */
  forDigit: (symbol: string, contract: string, digit: number) => OperatorDirective[];
}

/** Snapshot the overlay once per ranking pass so a pass is internally consistent. */
export function immediateGuidanceLookup(now = Date.now()): ImmediateGuidanceLookup {
  const live = activeDirectives(now);

  const scoped = (symbol: string, contract: string) =>
    live.filter((d) => d.symbol === symbol && d.contract === contract);

  return {
    revision,
    forCandidate(symbol, contract) {
      const ds = scoped(symbol, contract);
      if (!ds.length)
        return {
          points: 0,
          directives: [],
          detail: "No immediate operator guidance is active for this market and contract.",
          active: false,
        };
      const raw = ds.reduce((a, d) => a + d.rankingAdjustment * decay(d, now), 0);
      const points = round(
        Math.max(-MAX_GUIDANCE_RANKING_DELTA, Math.min(MAX_GUIDANCE_RANKING_DELTA, raw)),
      );
      return {
        points,
        directives: ds,
        active: true,
        detail:
          `IMMEDIATE OPERATOR GUIDANCE (temporary, not statistical proof) — ` +
          ds
            .map(
              (d) =>
                `${d.label}${d.targetDigit !== null ? ` (digit ${d.targetDigit})` : ""}; expires ${new Date(d.expiresAt).toLocaleTimeString()}`,
            )
            .join(" · "),
      };
    },
    entryAdjustment(symbol, contract, digit) {
      const ds = scoped(symbol, contract).filter(
        (d) => d.entryDigitAdjustment !== 0 && (d.targetDigit ?? d.entryDigit) === digit,
      );
      if (!ds.length) return 0;
      const raw = ds.reduce((a, d) => a + d.entryDigitAdjustment * decay(d, now), 0);
      return round(
        Math.max(-MAX_GUIDANCE_ENTRY_DELTA, Math.min(MAX_GUIDANCE_ENTRY_DELTA, raw)),
      );
    },
    forDigit(symbol, contract, digit) {
      return scoped(symbol, contract).filter((d) => (d.targetDigit ?? d.entryDigit) === digit);
    },
  };
}
