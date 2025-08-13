# Balatro‑Style **Rock • Paper • Scissors** — README

A small, replayable prototype that mixes Rock‑Paper‑Scissors with Balatro‑like sequential scoring, artifacts, and juicy VFX. This document explains all core mechanics, scoring, artifacts, flow, and tweak points.

---

## 1) Goal of the Game

Win each **match** by ending with a higher **Total Score** than the AI. After every win you collect an **Artifact** and move to the next **Round**, where you must play **one more hand** than before (capped at **9**).

---

## 2) Quick Start (How to Play)

1. **Pick your hands** from ✊ (Rock), 🖐️ (Paper), ✌️ (Scissors). In Round 1 you pick **1** hand; Round 2 you pick **2**, etc.
2. Click **Lock In**. The AI secretly selects the same number of hands.
3. Each pair of hands is resolved **sequentially** (Compare 1, then 2, …). Scores tick up with animations and VFX.
4. Highest **Total** after all compares wins the match. On a win, pick **one artifact**; you advance, your hand count increases by +1 (max **9**).
5. On a draw, you **retry** the same round. On a loss, start a **New Run**.

---

## 3) Core Rules

### Hands & Rounds

- **Round 1:** choose 1 hand → 1 compare.
- **Round N:** choose N hands → N sequential compares.
- Player choices are shown in numbered **slots**.

### Sequential Resolution

For each compare (i = 1…N):

1. Establish starting values: **Base = 100**, **Mult = 1.0** for both Player and AI.
2. Apply **onCompareStart** artifact effects (your artifacts only).
3. Resolve RPS outcome and apply **×1.5** multiplier to the **winner of that compare** (Player or AI).
4. Compute compare score per side: **Score = Base × Mult**.
5. Add to running totals; show result tag (WIN/LOSE or nothing on tie).
6. Run **onCompareEnd** artifact effects (your artifacts only).

### Scoring Formula (per compare)

```
PlayerCompareScore  = PlayerBase × PlayerMult
AICompareScore       = AIBase × AIMult
```

- **Base** starts at **100** each compare.
- **Mult** starts at **1.0** each compare.
- Artifact effects may change **Base** (usually additive) and **Mult** (additive or multiplicative) before RPS resolution.
- **RPS win** on that compare multiplies the winner’s **Mult** by **×1.5** (applied **after** artifact effects that happen onCompareStart).

### Match Result

- Sum of all compare scores creates **Totals** for Player and AI.
- Some artifacts may add a bonus **after** all compares via **onMatchEnd**.
- Final comparison decides **WIN / LOSE / DRAW**.

### Tie Handling

- **DRAW:** the round is replayed with the same hand count (no artifact reward).

---

## 4) Artifacts System

Artifacts are persistent bonuses you collect on wins. They can fire at different **hook points** during a match.

### Hook Points

- **onMatchStart(ctx):** Once, before any compare resolves this match.
- **onCompareStart(ctx):** Before each compare’s scoring and RPS multiplier.
- **onCompareEnd(ctx):** After each compare’s result; can set up effects for the next compare.
- **onMatchEnd(ctx):** Once, after all compares; can modify the final total.

### Scope & Stacking

- **Your artifacts only** affect your side (Player).
- All applicable artifacts at a hook point **stack** in reading order.
- **Base** changes are typically **additive** (e.g., +100 base).
- **Mult** changes can be **additive** (e.g., +0.3) or **multiplicative** (e.g., ×1.2).
- Order within a compare: all **onCompareStart** buffs → **RPS ×1.5** if you win → score computed.

### Context Object (for devs)

Each hook receives `ctx` with:

- `round`, `compareIndex`, `handsCount`
- `playerChoices`, `aiChoices` (arrays of hand IDs)
- `pHand`, `aHand` (hand IDs for current compare)
- `mod` → `{ p:{ base, mult }, a:{ base, mult } }`
- `carry` → object for per‑match temporary state (e.g., “next compare gets +25 base”)
- `totals` → `{ p, a }` running totals (numbers)
- `lastResult` → `'player' | 'ai' | 'tie' | null`

### Included Artifacts (pool)

- **Granite Gauntlet** _(Common)_ — **onCompareStart**: If you play **Rock**, **+100 base**.
- **Paper Crane** _(Common)_ — **onCompareStart**: If you play **Paper**, **+100 base**.
- **Shear Sharpeners** _(Common)_ — **onCompareStart**: If you play **Scissors**, **+100 base**.
- **Basalt Banner** _(Uncommon)_ — **onCompareStart**: If you played **≥2 Rocks** this match, **+2.5 Mult**.
- **Opening Gambit** _(Uncommon)_ — **onMatchStart**: store **+50 base** for first compare; **onCompareStart** at compare `0`: add it.
- **Counter Surge** _(Uncommon)_ — **onCompareEnd**: if you **lost**, next compare gets **+0.5 Mult** (consumed on next **onCompareStart**).
- **Momentum** _(Rare)_ — **onCompareEnd**: if you **won**, next compare gets **+25 base** (consumed on next **onCompareStart**).
- **Precision Play** _(Uncommon)_ — **onCompareStart**: if you play **Scissors**, **+0.3 Mult**.
- **Paper Engine** _(Rare)_ — **onCompareStart**: if you play **exactly one Paper** this match, **×1.2 Mult** (multiplicative) on every compare.
- **Tactician** _(Rare)_ — **onMatchEnd**: if your **Rocks ≥ Papers ≥ Scissors**, **+5%** to **final total**.

> Reward choices prevent duplicates; if the pool is exhausted you may skip.

---

## 5) AI Behaviour

- The AI picks each hand **randomly** and independently from ✊/🖐️/✌️ (uniform distribution). There is no look‑ahead or cheating.

---

## 6) User Interface

- **Your Picks**: Click ✊/🖐️/✌️ to fill numbered **slots**. **Clear** removes selections; **Auto‑fill** picks randomly; **Lock In** starts resolution.
- **Match Panel**:
  - **Scoreboard** shows **Player Total** and **AI Total** (animated counting).
  - **FX Stage** displays the current compare with two **lanes** (Player vs AI):
    - A **calc line** per side: `Base 100 × Mult 1.0`, updated live.
    - A **bottom chip rail** listing artifact effects as they trigger (scrolls horizontally when long).
    - **Result tags** (WIN/LOSE) at the top‑right of each lane.
  - **Log** captures a text summary of each compare and the match result.
- **Rewards Modal** appears on a win: pick **one artifact**.
- **Footer Buttons**:
  - **Next Round** (on win), **Retry Round** (on draw), **New Run** (on loss).

---

## 7) Visual Effects & Pacing

- **Chips**: A small badge appears for each artifact/RPS effect (e.g., `+100 base — Granite Gauntlet`, `×1.5 mult — RPS Win`).
- **Number bumps + glows** on the affected value (Base or Mult); **trails** and **particle bursts** match effect type.
- **Screen shake** triggers on RPS wins and per‑compare winners.
- **Easing**: numeric animations use **ease‑in cubic** (slow → fast) for clarity.
- **Timings** (approx, editable via `PACE`):
  - single change **number**: 0.8–0.9s
  - between event **chips**: 0.24s
  - score reveal gap (P→A): 0.42s
  - between compares: 0.7s
  - total counters tick: 0.8s

---

## 8) Worked Example

Suppose you have **Granite Gauntlet** and **Momentum**, and you play **Rock** on Compare 2. Last compare you **won**, so Momentum is primed.

Compare 2 resolution:

1. Start: `Base 100 × Mult 1.0`.
2. **Momentum (carry)** fires: Base → **125**.
3. **Granite Gauntlet** fires (because Rock): Base → **225**.
4. AI plays **Scissors** → you **win RPS**: Mult → **1.0 × 1.5 = 1.5**.
5. Your compare score = **225 × 1.5 = 337.5**.
6. Your total increases by **337.5**; **Momentum** re‑primes for the next compare (because you won again).

---

## 9) Customisation Knobs

- **PACE** constants (animation speeds / delays).
- **Easing** function (e.g., swap to ease‑out for fast → slow, or cubic‑bezier).
- **Hand growth rule** (e.g., +2 per round; cap at N; or fixed length run) — Current build: **+1 per round, capped at 9**.
- **RPS multiplier** (default ×1.5).
- **Artifacts**: add new entries to the pool with any of the four hook points.
- **Tiebreaker**: enable sudden‑death instead of replay.
- **AI**: bias distributions or add learning/reads.
- **UX**: autoscroll chip rail, compress overflowing chips into a “+N more” rollup, add sound/voice fonts, etc.

---

## 10) Edge Cases & Notes

- **Overflowing chips** won’t cover the calc line; they scroll horizontally at the bottom of each lane.
- **Result tags** are positioned inside each lane’s top‑right to avoid clipping or header overlap.
- **Duplicate artifacts** are not offered in rewards.
- **End‑of‑match** bonuses animate after all compares; a small chip indicates the delta.
- **Draws** repeat the round with the same hand count.

---

## 11) Technical Notes (for Developers)

- **BEATS** map defines RPS logic: `Rock > Scissors`, `Paper > Rock`, `Scissors > Paper`.
- Per compare we build a `ctx` object and run:
  1. `onCompareStart` (all artifacts) → 2) RPS win ×1.5 → 3) compute scores → 4) `onCompareEnd`.
  2. After loop, `onMatchEnd` runs.
- **Instrumentation**: before/after snapshots of `mod.p` detect **base/mult deltas** per artifact to drive chip text and VFX.
- **Totals** animate via a simple number lerp using **ease‑in cubic**.
- **UI structure**: FX Stage renders one compare at a time; logs keep a persistent textual history.

---

## 12) Glossary

- **Compare**: One head‑to‑head resolution of a Player hand vs an AI hand.
- **Base**: Starting score component per compare (default 100), modified by artifacts.
- **Mult**: Score multiplier per compare (starts at 1.0), modified by artifacts and by RPS wins.
- **Carry**: Temporary store for effects that apply to later compares in the same match.
- **Hook**: A timing window when artifacts may apply effects.

---

**Have fun, and feel free to suggest new artifacts or house rules!**
