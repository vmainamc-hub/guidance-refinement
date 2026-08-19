// APEX SENTINEL — WRITTEN OPERATOR FEEDBACK (additive, never statistical).
//
// Two strictly separate things live here:
//   TRADE FEEDBACK    — a note attached to a trade the operator confirmed.
//   SIGNAL OBSERVATION — a note about a signal that was NOT traded.
// Neither ever becomes a win, a loss, or a numeric learning weight.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RankedOpportunity } from "@/lib/apex/types";
import {
  FEEDBACK_CATEGORIES,
  addObservation,
  deleteObservation,
  deleteTradeFeedback,
  observationsFor,
  saveTradeFeedback,
  tradeFeedbackFor,
  updateObservation,
  type FeedbackCategory,
} from "@/lib/sentinel/trade-feedback";
import { useTradeFeedbackVersion } from "@/components/apex/TradeFeedback";

function fmt(ts: number) {
  return new Date(ts).toLocaleString();
}

function CategoryPicker({
  value,
  onChange,
}: {
  value: FeedbackCategory | null;
  onChange: (c: FeedbackCategory | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FEEDBACK_CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(value === c ? null : c)}
          className="rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em]"
          style={{
            borderColor: value === c ? "var(--neon)" : "var(--border)",
            color: value === c ? "var(--neon)" : "var(--muted-foreground)",
          }}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function Composer({
  title,
  placeholder,
  initialText,
  initialCategory,
  onSave,
  onCancel,
}: {
  title: string;
  placeholder: string;
  initialText?: string;
  initialCategory?: FeedbackCategory | null;
  onSave: (text: string, category: FeedbackCategory | null) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [category, setCategory] = useState<FeedbackCategory | null>(initialCategory ?? null);
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="mt-2 text-xs"
      />
      <div className="mt-2">
        <CategoryPicker value={category} onChange={setCategory} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-[11px]"
          disabled={!text.trim()}
          onClick={() => onSave(text, category)}
        >
          Save feedback
        </Button>
        {onCancel ? (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <p className="text-[10px] text-muted-foreground">
          Optional. A category is never required — free text is always enough.
        </p>
      </div>
    </div>
  );
}

function SavedNote({
  text,
  category,
  ts,
  onEdit,
  onDelete,
}: {
  text: string;
  category: FeedbackCategory | null;
  ts: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--bull)]">
        Feedback saved
      </p>
      <p className="mt-1 text-xs">{text}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {fmt(ts)}
        {category ? ` · ${category}` : ""}
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/** Written note on an explicitly marked trade. */
export function TradeFeedbackNoteEditor({ tradeId }: { tradeId: string }) {
  useTradeFeedbackVersion();
  const [editing, setEditing] = useState(false);
  const note = tradeFeedbackFor(tradeId);

  if (note && !editing) {
    return (
      <SavedNote
        text={note.text}
        category={note.category}
        ts={note.updatedAt ?? note.ts}
        onEdit={() => setEditing(true)}
        onDelete={() => deleteTradeFeedback(tradeId)}
      />
    );
  }
  return (
    <Composer
      title="Operator feedback"
      placeholder="Tell Sentinel what happened..."
      initialText={note?.text}
      initialCategory={note?.category ?? null}
      onSave={(text, category) => {
        saveTradeFeedback(tradeId, text, category);
        setEditing(false);
      }}
      onCancel={note ? () => setEditing(false) : undefined}
    />
  );
}

/** Note about a signal the operator did NOT trade. Never an outcome. */
export function SignalObservationEditor({ item }: { item: RankedOpportunity }) {
  useTradeFeedbackVersion();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const notes = observationsFor(item.symbol, item.contract.id);

  return (
    <div className="space-y-2">
      {open ? (
        <Composer
          title="Signal observation · not a trade"
          placeholder="I did not trade this. What did you notice?"
          onSave={(text, category) => {
            addObservation(item, text, category);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-[11px]"
            onClick={() => setOpen(true)}
          >
            Add observation
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Observations are recorded as notes only — never as a trade, win or loss.
          </p>
        </div>
      )}

      {notes.length ? (
        <div className="space-y-2">
          {notes.slice(0, 5).map((o) =>
            editingId === o.observationId ? (
              <Composer
                key={o.observationId}
                title="Edit observation"
                placeholder="Update your observation..."
                initialText={o.text}
                initialCategory={o.category}
                onSave={(text, category) => {
                  updateObservation(o.observationId, text, category);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <SavedNote
                key={o.observationId}
                text={o.text}
                category={o.category}
                ts={o.updatedAt ?? o.ts}
                onEdit={() => setEditingId(o.observationId)}
                onDelete={() => deleteObservation(o.observationId)}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}