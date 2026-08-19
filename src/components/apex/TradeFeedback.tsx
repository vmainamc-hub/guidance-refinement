// APEX SENTINEL — TRADE INTENT & OUTCOME FEEDBACK.
//
// A signal shown is NOT a trade taken. Nothing here is created automatically:
// the operator must explicitly mark a signal as traded before Sentinel ever
// asks for an outcome. Ignored signals are never asked about.
import { useSyncExternalStore } from "react";
import type { RankedOpportunity } from "@/lib/apex/types";
import { Button } from "@/components/ui/button";
import {
  SignalObservationEditor,
  TradeFeedbackNoteEditor,
} from "@/components/apex/OperatorFeedback";
import { OperatorLearningInline } from "@/components/apex/OperatorLearningSummary";
import {
  digitLearning,
  feedbackVersion,
  learningFor,
  listTrades,
  markTraded,
  pendingFor,
  resolveTrade,
  subscribeTradeFeedback,
  type TradeRecord,
} from "@/lib/sentinel/trade-feedback";
import {
  guidanceRevision,
  immediateGuidanceLookup,
  subscribeGuidance,
} from "@/lib/sentinel/immediate-guidance";

export function useTradeFeedbackVersion() {
  return useSyncExternalStore(subscribeTradeFeedback, feedbackVersion, () => 0);
}

export function useGuidanceRevision() {
  return useSyncExternalStore(subscribeGuidance, guidanceRevision, () => 0);
}

/**
 * CHANNEL 1 chip — shows that the operator's own note is influencing this
 * market × contract right now, and that the influence expires by itself.
 */
export function GuidanceChip({ item }: { item: RankedOpportunity }) {
  useGuidanceRevision();
  const effect = immediateGuidanceLookup().forCandidate(item.symbol, item.contract.id);
  if (!effect.active) return null;
  const soonest = Math.min(...effect.directives.map((d) => d.expiresAt));
  const mins = Math.max(1, Math.round((soonest - Date.now()) / 60000));
  return (
    <div
      title={effect.detail}
      className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--warn)]/60 bg-background/60 px-2.5 py-1"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--warn)]">
        Operator guidance active
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {effect.directives.length} directive{effect.directives.length > 1 ? "s" : ""} ·{" "}
        {effect.points >= 0 ? "+" : ""}
        {effect.points.toFixed(1)} pts · expires in {mins}m
      </span>
    </div>
  );
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

function PendingCard({ trade }: { trade: TradeRecord }) {
  const s = trade.snapshot;
  return (
    <div className="rounded-lg border border-[var(--warn)]/60 bg-background/60 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--warn)]">
        Trade recorded · awaiting outcome
      </p>
      <p className="mt-1 font-mono text-xs">
        {s.symbol} · {s.contractLabel} · entry digit {s.entryDigit ?? "WAIT"} · {fmtTime(trade.ts)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => resolveTrade(trade.id, "WIN")}
        >
          WIN
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-[11px]"
          onClick={() => resolveTrade(trade.id, "LOSS")}
        >
          LOSS
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => resolveTrade(trade.id, "CANCELLED")}
        >
          Skipped / cancelled
        </Button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Only WIN or LOSS updates learning. Cancelling records nothing against this setup.
      </p>
      <div className="mt-3">
        <TradeFeedbackNoteEditor tradeId={trade.id} />
      </div>
    </div>
  );
}

/** LEARNED SUPPORT — confirmed user-trade history only. Never fabricated. */
export function LearnedSupport({ item }: { item: RankedOpportunity }) {
  useTradeFeedbackVersion();
  const l = learningFor(item.symbol, item.contract.id);
  const d = item.entryPoint.preferred?.digit ?? null;
  const dl = digitLearning(item.symbol, item.contract.id, d);

  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        Learned support · confirmed user trades
      </p>
      {l.trades === 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          No sufficient user-trade history yet. The entry recommendation rests entirely on current
          market evidence.
        </p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-[11px]">
          <li>
            {item.symbol} · {item.contract.label}: {l.trades} confirmed trades ·{" "}
            {(l.winRate * 100).toFixed(1)}% win rate
          </li>
          <li>
            {dl
              ? `Entry digit ${dl.digit}: ${dl.trades} trades · ${(dl.winRate * 100).toFixed(1)}% (${dl.tier})`
              : d !== null
                ? `Entry digit ${d} has no confirmed user-trade history in this market/contract yet.`
                : "No validated entry digit to compare against learned history."}
          </li>
          <li className="text-muted-foreground">
            Learning confidence: {l.tier} · market and contract isolated
          </li>
        </ul>
      )}
      {l.tier === "INSUFFICIENT SAMPLE" ? (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Feedback is remembered; there is not yet enough related evidence for strong statistical
          inference.
        </p>
      ) : null}
    </div>
  );
}

export default function TradeFeedback({ item }: { item: RankedOpportunity }) {
  useTradeFeedbackVersion();
  const pending = pendingFor(item);
  const resolved = listTrades().find(
    (t) =>
      t.snapshot.symbol === item.symbol &&
      t.snapshot.contract === item.contract.id &&
      t.outcome !== "PENDING",
  );

  return (
    <div className="mt-3 space-y-2">
      <GuidanceChip item={item} />
      {pending ? (
        <PendingCard trade={pending} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" className="h-8 text-[11px]" onClick={() => markTraded(item)}>
              Mark as traded
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Sentinel only learns from trades you confirm. Ignoring this signal records nothing.
            </p>
          </div>
          {resolved ? (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Last confirmed trade · {resolved.outcome}
              </p>
              <div className="mt-1">
                <TradeFeedbackNoteEditor tradeId={resolved.id} />
              </div>
            </div>
          ) : null}
          <SignalObservationEditor item={item} />
        </>
      )}
      <LearnedSupport item={item} />
      <OperatorLearningInline />
    </div>
  );
}
