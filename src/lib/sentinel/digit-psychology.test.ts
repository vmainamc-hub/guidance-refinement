import { describe, expect, it } from "vitest";
import {
  canonicalDigitState,
  contractPsychology,
  entryDigitPsychologyBias,
} from "./digit-psychology";

function biased(n: number, heavy: number, light: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = i % 20;
    if (r < 6) out.push(heavy);
    else if (r === 6) out.push(light === heavy ? (light + 1) % 10 : light);
    else out.push((i * 7 + 3) % 10);
  }
  return out;
}

describe("canonicalDigitState", () => {
  it("reports INSUFFICIENT with a thin buffer", () => {
    const s = canonicalDigitState([1, 2, 3]);
    expect(s.change).toBe("INSUFFICIENT");
    expect(s.green).toBeNull();
  });

  it("assigns green/red from measured frequency with no vetoed digits", () => {
    const s = canonicalDigitState(biased(1000, 3, 8));
    expect(s.n).toBe(1000);
    expect(s.green).toBe(3); // digit 3 is never excluded from a role
    expect(s.secondGreen).not.toBe(s.green);
    expect(s.red).not.toBeNull();
    expect(s.pct.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 5);
  });
});

describe("contractPsychology", () => {
  const state = canonicalDigitState(biased(1000, 3, 8));
  const over4 = contractPsychology(state, {
    label: "OVER 4",
    side: "OVER",
    barrier: 4,
    winners: [5, 6, 7, 8, 9],
  });

  it("derives zones from the contract's own winners", () => {
    expect(over4.winningZone).toEqual([5, 6, 7, 8, 9]);
    expect(over4.losingZone).toEqual([0, 1, 2, 3, 4]);
    expect(over4.positions.length).toBeGreaterThan(0);
  });

  it("keeps the ranking contribution bounded and never blocking", () => {
    expect(Math.abs(over4.rankingDelta)).toBeLessThanOrEqual(4);
    expect(["SUPPORT", "NEUTRAL", "CONFLICT"]).toContain(over4.verdict);
  });
});

describe("entryDigitPsychologyBias", () => {
  const state = canonicalDigitState(biased(1000, 3, 8));
  const under5 = contractPsychology(state, {
    label: "UNDER 5",
    side: "UNDER",
    barrier: 5,
    winners: [0, 1, 2, 3, 4],
  });

  it("stays inside ±3 for every digit", () => {
    for (let d = 0; d < 10; d++) {
      expect(Math.abs(entryDigitPsychologyBias(state, under5, d).points)).toBeLessThanOrEqual(3);
    }
  });

  it("has no influence when the canonical window is immature", () => {
    const thin = canonicalDigitState([1, 2, 3, 4]);
    expect(entryDigitPsychologyBias(thin, under5, 3).points).toBe(0);
  });
});
