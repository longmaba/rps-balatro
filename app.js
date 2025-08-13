(() => {
  // ---------- Core constants
  const HANDS = [
    { id: "Rock", emoji: "✊", color: "#93c5fd" },
    { id: "Paper", emoji: "🖐️", color: "#a7f3d0" },
    { id: "Scissors", emoji: "✌️", color: "#fca5a5" },
  ];

  const BEATS = { Rock: "Scissors", Paper: "Rock", Scissors: "Paper" };

  // ---------- Utility
  const el = (sel) => document.querySelector(sel);
  const div = (cls, html) => {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    if (html !== undefined) d.innerHTML = html;
    return d;
  };
  const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function fmt(n) {
    return (Math.round(n * 100) / 100).toLocaleString();
  }
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function rarityClass(s) {
    const k = String(s || "").toLowerCase();
    return `rarity rarity-${k}`;
  }

  // Pace (slow it down a bit)
  const PACE = {
    chipDelay: 240,
    numberMs: 800,
    numberMsMult: 900,
    scoreRevealDelay: 420,
    betweenSides: 360,
    betweenCompares: 700,
    totalsMs: 800,
  };

  // AI difficulty scaling (configurable)
  const AI_SCALING = {
    enabled: true,
    // Per-match increases applied to AI each compare
    basePerMatch: 10, // +base per completed round
    multAddPerMatch: 0.05, // +mult (additive) per completed round
    // Map round -> scaling level (e.g., Round 1 => 0, Round 2 => 1, ...)
    levelFromRound: (round) => Math.max(0, round - 1),
  };

  // ---------- Artifact system
  /**
   * Artifacts have optional hooks:
   * - onMatchStart(ctx)
   * - onCompareStart(ctx)
   * - onCompareEnd(ctx)
   * - onMatchEnd(ctx)
   * Hook instrumentation will record deltas for juicy VFX.
   */

  const ARTIFACT_POOL = [
    {
      id: "granite-gauntlet",
      name: "Granite Gauntlet",
      tier: "Common",
      desc: "+100 base to every Rock you play.",
      onCompareStart(ctx) {
        if (ctx.pHand === "Rock") ctx.mod.p.base += 100;
      },
    },
    {
      id: "paper-crane",
      name: "Paper Crane",
      tier: "Common",
      desc: "+100 base to every Paper you play.",
      onCompareStart(ctx) {
        if (ctx.pHand === "Paper") ctx.mod.p.base += 100;
      },
    },
    {
      id: "shear-sharpeners",
      name: "Shear Sharpeners",
      tier: "Common",
      desc: "+100 base to every Scissors you play.",
      onCompareStart(ctx) {
        if (ctx.pHand === "Scissors") ctx.mod.p.base += 100;
      },
    },
    {
      id: "rock-enthusiast",
      name: "Basalt Banner",
      tier: "Uncommon",
      desc: "If you play ≥2 Rocks this match, +2.5 to your multiplier (each compare).",
      onCompareStart(ctx) {
        const rocks = ctx.playerChoices.filter((h) => h === "Rock").length;
        if (rocks >= 2) ctx.mod.p.mult += 2.5;
      },
    },
    {
      id: "opening-gambit",
      name: "Opening Gambit",
      tier: "Uncommon",
      desc: "At match start, +50 base to your first compare.",
      onMatchStart(ctx) {
        ctx.carry.slot0Base = (ctx.carry.slot0Base || 0) + 50;
      },
      onCompareStart(ctx) {
        if (ctx.compareIndex === 0) ctx.mod.p.base += ctx.carry.slot0Base || 0;
      },
    },
    {
      id: "counter-surge",
      name: "Counter Surge",
      tier: "Uncommon",
      desc: "When you lose a compare, +0.5 to multiplier on the next compare.",
      onCompareEnd(ctx) {
        if (ctx.lastResult === "ai") ctx.carry.nextMult = (ctx.carry.nextMult || 0) + 0.5;
      },
      onCompareStart(ctx) {
        if (ctx.carry.nextMult) {
          ctx.mod.p.mult += ctx.carry.nextMult;
          ctx.carry.nextMult = 0;
        }
      },
    },
    {
      id: "momentum",
      name: "Momentum",
      tier: "Rare",
      desc: "After each win, +25 base to your next compare this match.",
      onCompareEnd(ctx) {
        if (ctx.lastResult === "player") ctx.carry.nextBase = (ctx.carry.nextBase || 0) + 25;
      },
      onCompareStart(ctx) {
        if (ctx.carry.nextBase) {
          ctx.mod.p.base += ctx.carry.nextBase;
          ctx.carry.nextBase = 0;
        }
      },
    },
    {
      id: "precision-play",
      name: "Precision Play",
      tier: "Uncommon",
      desc: "Scissors gets +0.3 to multiplier on that compare.",
      onCompareStart(ctx) {
        if (ctx.pHand === "Scissors") ctx.mod.p.mult += 0.3;
      },
    },
    {
      id: "paper-engine",
      name: "Paper Engine",
      tier: "Rare",
      desc: "If you play exactly one Paper this match, +1.2× multiplier on all compares.",
      onCompareStart(ctx) {
        const papers = ctx.playerChoices.filter((h) => h === "Paper").length;
        if (papers === 1) ctx.mod.p.mult *= 1.2;
      },
    },
    {
      id: "tactician",
      name: "Tactician",
      tier: "Rare",
      desc: "End of match: if your total Rocks ≥ Papers ≥ Scissors, +5% bonus to your final total.",
      onMatchEnd(ctx) {
        const c = countBy(ctx.playerChoices);
        if (c.Rock >= c.Paper && c.Paper >= c.Scissors) {
          ctx.totals.p *= 1.05;
          ctx._matchEndDelta = ctx.totals.p;
        }
      },
    },
    {
      id: "switch-hitter",
      name: "Switch Hitter",
      tier: "Common",
      desc: "If this hand differs from your previous play, +60 base.",
      onCompareStart(ctx) {
        if (ctx.compareIndex > 0 && ctx.playerChoices[ctx.compareIndex] !== ctx.playerChoices[ctx.compareIndex - 1]) {
          ctx.mod.p.base += 60;
        }
      },
    },
    {
      id: "anchor-turn",
      name: "Anchor Turn",
      tier: "Common",
      desc: "On the last compare this match, +80 base.",
      onCompareStart(ctx) {
        if (ctx.compareIndex === ctx.handsCount - 1) ctx.mod.p.base += 80;
      },
    },
    {
      id: "tiebreak-practice",
      name: "Tiebreak Practice",
      tier: "Common",
      desc: "If the previous compare was a tie, +40 base.",
      onCompareStart(ctx) {
        if (ctx.lastResult === "tie") ctx.mod.p.base += 40;
      },
    },
    {
      id: "counter-read",
      name: "Counter Read",
      tier: "Common",
      desc: "If your hand beats the AI’s this compare, +50 base.",
      onCompareStart(ctx) {
        if (ctx.pHand && ctx.aHand && BEATS[ctx.pHand] === ctx.aHand) ctx.mod.p.base += 50;
      },
    },
    {
      id: "underdog",
      name: "Underdog",
      tier: "Uncommon",
      desc: "If you are trailing in total before this compare, +0.25 to multiplier.",
      onCompareStart(ctx) {
        if (ctx.totals.p < ctx.totals.a) ctx.mod.p.mult += 0.25;
      },
    },
    {
      id: "win-streaker",
      name: "Win Streaker",
      tier: "Uncommon",
      desc: "While on a win streak, +0.15 mult per consecutive prior win (resets on loss).",
      onCompareStart(ctx) {
        if (ctx.carry.winStreakMult) ctx.mod.p.mult += ctx.carry.winStreakMult;
      },
      onCompareEnd(ctx) {
        if (ctx.lastResult === "player") ctx.carry.winStreakMult = (ctx.carry.winStreakMult || 0) + 0.15;
        else if (ctx.lastResult === "ai") ctx.carry.winStreakMult = 0;
      },
    },
    {
      id: "scouts-report",
      name: "Scout's Report",
      tier: "Uncommon",
      desc: "If AI plays ≥2 of one type this match, your counter gets +0.3 mult on those compares.",
      onCompareStart(ctx) {
        const c = countBy(ctx.aiChoices);
        if (c.Scissors >= 2 && ctx.pHand === "Rock") ctx.mod.p.mult += 0.3;
        if (c.Rock >= 2 && ctx.pHand === "Paper") ctx.mod.p.mult += 0.3;
        if (c.Paper >= 2 && ctx.pHand === "Scissors") ctx.mod.p.mult += 0.3;
      },
    },
    {
      id: "full-suite",
      name: "Full Suite",
      tier: "Rare",
      desc: "If you play all three types at least once this match, ×1.15 multiplier on all compares.",
      onCompareStart(ctx) {
        const c = countBy(ctx.playerChoices);
        if (c.Rock && c.Paper && c.Scissors) ctx.mod.p.mult *= 1.15;
      },
    },
    {
      id: "monotype-engine",
      name: "Monotype Engine",
      tier: "Rare",
      desc: "If you play only one type this match, ×1.25 multiplier on all compares.",
      onCompareStart(ctx) {
        const types = new Set(ctx.playerChoices);
        if (types.size === 1) ctx.mod.p.mult *= 1.25;
      },
    },
    {
      id: "closers-instinct",
      name: "Closer's Instinct",
      tier: "Rare",
      desc: "On the last compare this match, ×1.3 multiplier.",
      onCompareStart(ctx) {
        if (ctx.compareIndex === ctx.handsCount - 1) ctx.mod.p.mult *= 1.3;
      },
    },
    {
      id: "rock-dividend",
      name: "Rock Dividend",
      tier: "Rare",
      desc: "End of match: +3% final total per Rock played (cap +9%).",
      onMatchEnd(ctx) {
        const c = countBy(ctx.playerChoices);
        const bonus = Math.min(0.09, 0.03 * c.Rock);
        if (bonus > 0) {
          const before = ctx.totals.p;
          ctx.totals.p *= 1 + bonus;
          ctx._matchEndDelta = ctx.totals.p - before;
        }
      },
    },
  ];
  // ---------- Recipes & Crafted Hands
  const RECIPE_POOL = [
    {
      id: "heavy-rock",
      name: "Heavy Rock",
      rarity: "Uncommon",
      outputHandId: "HeavyRock",
      requires: ["granite-gauntlet", "rock-enthusiast"],
      summary: "Rock spike; plan around a dip next compare.",
    },
    {
      id: "switchblade",
      name: "Switchblade",
      rarity: "Uncommon",
      outputHandId: "Switchblade",
      requires: ["precision-play", "switch-hitter"],
      summary: "Big gains when alternating.",
    },
    {
      id: "metronome-paper",
      name: "Metronome Paper",
      rarity: "Uncommon",
      outputHandId: "MetronomePaper",
      requires: ["paper-crane", "anchor-turn"],
      summary: "Rewards repeats.",
    },
    {
      id: "riposte",
      name: "Riposte",
      rarity: "Rare",
      outputHandId: "Riposte",
      requires: ["counter-surge", "tiebreak-practice"],
      summary: "Lose then punish.",
    },
    {
      id: "primer",
      name: "Primer",
      rarity: "Uncommon",
      outputHandId: "Primer",
      requires: ["opening-gambit", "momentum"],
      summary: "Bank Base for later.",
    },
    {
      id: "detonator",
      name: "Detonator",
      rarity: "Rare",
      outputHandId: "Detonator",
      requires: ["precision-play", "closers-instinct"],
      summary: "Turn stored Base into Mult spike.",
    },
  ];

  // ---------- Game state
  const state = { round: 1, handsCount: 1, playerArtifacts: [], inProgress: false, playerRecipes: [], craftedHands: [] };

  // ---------- UI refs
  const handButtons = el("#handButtons");
  const slotsWrap = el("#slots");
  const logEl = el("#log");
  const pTotalEl = el("#pTotal");
  const aTotalEl = el("#aTotal");
  const roundVal = el("#roundVal");
  const handsVal = el("#handsVal");
  const artifactsCount = el("#artifactsCount");
  const artifactList = el("#artifactList");
  const btnClear = el("#btnClear");
  const btnRandom = el("#btnRandom");
  const btnLock = el("#btnLock");
  const btnNext = el("#btnNext");
  const btnRetry = el("#btnRetry");
  const btnReset = el("#btnReset");
  const rewardModal = el("#rewardModal");
  const rewardChoices = el("#rewardChoices");
  const closeReward = el("#closeReward");
  const fxStage = el("#fxStage");
  // Workshop UI refs
  const btnWorkshop = el("#btnWorkshop");
  const workshopModal = el("#workshopModal");
  const workshopList = el("#workshopList");
  const workshopPreview = el("#workshopPreview");

  let currentChoices = [];

  function renderHeader() {
    roundVal.textContent = state.round;
    handsVal.textContent = state.handsCount;
    artifactsCount.textContent = state.playerArtifacts.length;
  }

  function renderSlots() {
    slotsWrap.innerHTML = "";
    for (let i = 0; i < state.handsCount; i++) {
      const s = div("slot" + (currentChoices[i] ? " filled" : ""));
      s.dataset.idx = i;
      s.innerHTML =
        `<span class="idx">${i + 1}</span>` +
        (currentChoices[i] ? `<span class="big">${handEmoji(currentChoices[i])}</span>` : '<span class="big">—</span>');
      s.addEventListener("click", () => {
        if (currentChoices[i]) {
          currentChoices[i] = null;
          refresh();
        }
      });
      slotsWrap.appendChild(s);
    }
  }

  function renderHandButtons() {
    handButtons.innerHTML = "";
    HANDS.forEach((h) => {
      const c = div("card");
      c.style.borderColor = "#223045";
      c.innerHTML = `<span class="label">${h.id}</span><span class="emoji">${h.emoji}</span>`;
      c.addEventListener("click", () => {
        const idx = currentChoices.findIndex((v) => !v);
        if (idx > -1) {
          currentChoices[idx] = h.id;
          refresh();
        }
      });
      handButtons.appendChild(c);
    });
  }

  function renderArtifacts() {
    artifactList.innerHTML = "";
    if (state.playerArtifacts.length === 0) {
      artifactList.appendChild(div("muted", "No artifacts yet. Win a match to earn one."));
      return;
    }
    state.playerArtifacts.forEach((a) => {
      const card = div("artifact");
      card.innerHTML = `<h4>${a.name} <span class="muted">(${a.tier})</span></h4><p>${a.desc}</p>`;
      artifactList.appendChild(card);
    });
  }

  function refresh() {
    renderHeader();
    renderSlots();
    renderHandButtons();
    renderArtifacts();
    btnLock.disabled = currentChoices.filter(Boolean).length !== state.handsCount || state.inProgress;
    btnClear.disabled = state.inProgress || currentChoices.filter(Boolean).length === 0;
    btnRandom.disabled = state.inProgress;
  }

  function resetRun() {
    state.round = 1;
    state.handsCount = 1;
    state.playerArtifacts = [];
    state.inProgress = false;
    currentChoices = Array(state.handsCount).fill(null);
    logEl.innerHTML = "";
    pTotalEl.textContent = "0";
    aTotalEl.textContent = "0";
    fxStage.innerHTML = "";
    hideFooterButtons();
    refresh();
  }

  function hideFooterButtons() {
    btnNext.classList.add("hidden");
    btnRetry.classList.add("hidden");
    btnReset.classList.add("hidden");
  }

  // ---------- Match flow
  function startMatch() {
    state.inProgress = false;
    currentChoices = Array(state.handsCount).fill(null);
    logEl.innerHTML = "";
    pTotalEl.textContent = "0";
    aTotalEl.textContent = "0";
    fxStage.innerHTML = "";
    hideFooterButtons();
    refresh();
  }

  function resolveMatch() {
    state.inProgress = true;
    btnLock.disabled = true;
    btnClear.disabled = true;
    btnRandom.disabled = true;

    const playerChoices = currentChoices.slice();
    const aiChoices = Array.from({ length: state.handsCount }, () => sample(HANDS).id);

    let totals = { p: 0, a: 0 };
    let carry = {}; // per-match shared scratch for artifact effects
    let lastResult = null;

    // onMatchStart hooks
    const matchCtx = { round: state.round, handsCount: state.handsCount, playerChoices, aiChoices, carry, totals };
    state.playerArtifacts.forEach((a) => a.onMatchStart && a.onMatchStart(matchCtx));

    appendLog(`<b>AI</b> has chosen its ${state.handsCount} hand${state.handsCount > 1 ? "s" : ""}.`);

    (async () => {
      for (let i = 0; i < state.handsCount; i++) {
        const pHand = playerChoices[i];
        const aHand = aiChoices[i];
        let mod = { p: { base: 100, mult: 1 }, a: { base: 100, mult: 1 } };
        const ctx = {
          round: state.round,
          compareIndex: i,
          handsCount: state.handsCount,
          playerChoices,
          aiChoices,
          pHand,
          aHand,
          mod,
          carry,
          totals,
          lastResult,
        };

        // Instrument artifacts: record deltas per artifact for juicy VFX
        let events = [];
        state.playerArtifacts.forEach((art) => {
          if (!art.onCompareStart) return;
          const before = JSON.parse(JSON.stringify(mod));
          art.onCompareStart(ctx);
          const after = JSON.parse(JSON.stringify(mod));
          // base delta
          const baseDelta = after.p.base - before.p.base;
          if (Math.abs(baseDelta) > 1e-9) {
            events.push({ who: "p", stat: "base", op: "add", amount: baseDelta, source: art.name });
          }
          // mult change (add or mul)
          if (Math.abs(after.p.mult - before.p.mult) > 1e-9) {
            const ratio = after.p.mult / before.p.mult;
            if (Math.abs(ratio - 1) > 1e-9) events.push({ who: "p", stat: "mult", op: "mul", factor: ratio, source: art.name });
            else events.push({ who: "p", stat: "mult", op: "add", amount: after.p.mult - before.p.mult, source: art.name });
          }
        });

        // Apply AI difficulty scaling before outcome
        const aiLevel = AI_SCALING.enabled ? AI_SCALING.levelFromRound(state.round) : 0;
        if (aiLevel > 0) {
          const baseAdd = aiLevel * AI_SCALING.basePerMatch;
          const multAdd = aiLevel * AI_SCALING.multAddPerMatch;
          if (Math.abs(baseAdd) > 1e-9) {
            mod.a.base += baseAdd;
            events.push({ who: "a", stat: "base", op: "add", amount: baseAdd, source: "AI Scaling" });
          }
          if (Math.abs(multAdd) > 1e-9) {
            mod.a.mult += multAdd;
            events.push({ who: "a", stat: "mult", op: "add", amount: multAdd, source: "AI Scaling" });
          }
        }

        // RPS outcome multiplier: winner gets ×1.5 applied
        const outcome = rpsOutcome(pHand, aHand);
        if (outcome === "player") {
          mod.p.mult *= 1.5;
          events.push({ who: "p", stat: "mult", op: "mul", factor: 1.5, source: "RPS Win" });
        } else if (outcome === "ai") {
          mod.a.mult *= 1.5;
          events.push({ who: "a", stat: "mult", op: "mul", factor: 1.5, source: "RPS Win" });
        }

        // Final scores for this compare (we'll animate reveal first)
        const pScore = mod.p.base * mod.p.mult;
        const aScore = mod.a.base * mod.a.mult;

        await playCompareSequence({
          index: i,
          total: state.handsCount,
          pHand,
          aHand,
          pStart: { base: 100, mult: 1 },
          aStart: { base: 100, mult: 1 },
          events,
          pEnd: { base: mod.p.base, mult: mod.p.mult, score: pScore },
          aEnd: { base: mod.a.base, mult: mod.a.mult, score: aScore },
          outcome,
        });

        totals.p += pScore;
        totals.a += aScore;
        await animateNumber(pTotalEl, parseFloat(pTotalEl.textContent.replace(/,/g, "")) || 0, totals.p, PACE.totalsMs);
        await animateNumber(aTotalEl, parseFloat(aTotalEl.textContent.replace(/,/g, "")) || 0, totals.a, PACE.totalsMs);

        appendLog(
          `[${i + 1}/${state.handsCount}] You: ${handEmoji(pHand)} <b>${pHand}</b> vs AI: ${handEmoji(aHand)} <b>${aHand}</b> → Your ${fmt(
            pScore
          )} vs AI ${fmt(aScore)} ${
            pScore > aScore
              ? '— <span style="color:var(--good)"><b>WIN</b></span>'
              : pScore < aScore
              ? '— <span style="color:var(--bad)"><b>LOSE</b></span>'
              : "— <b>DRAW</b>"
          }`
        );

        lastResult = pScore > aScore ? "player" : pScore < aScore ? "ai" : "tie";
        ctx.lastResult = lastResult;
        state.playerArtifacts.forEach((a) => a.onCompareEnd && a.onCompareEnd(ctx));

        await delay(PACE.betweenCompares);
      }

      // onMatchEnd hooks (may adjust totals)
      const before = { p: totals.p, a: totals.a };
      const endCtx = { round: state.round, handsCount: state.handsCount, playerChoices, aiChoices, totals };
      state.playerArtifacts.forEach((a) => a.onMatchEnd && a.onMatchEnd(endCtx));
      if (Math.abs(totals.p - before.p) > 1e-9) {
        const tag = div("chip");
        tag.textContent = `End Bonus +${fmt(totals.p - before.p)}`;
        fxStage.appendChild(tag);
        requestAnimationFrame(() => tag.classList.add("show"));
        await animateNumber(pTotalEl, before.p, totals.p, PACE.totalsMs + 200);
      }

      appendLog('<hr class="divider">');
      if (totals.p > totals.a) {
        appendLog(`<b>Match result:</b> <span style="color:var(--good)">YOU WIN</span>`);
        rewardPhase();
      } else if (totals.p < totals.a) {
        appendLog(`<b>Match result:</b> <span style="color:var(--bad)">YOU LOSE</span>`);
        btnReset.classList.remove("hidden");
      } else {
        appendLog(`<b>Match result:</b> DRAW — play the round again.`);
        btnRetry.classList.remove("hidden");
      }

      state.inProgress = false;
    })();
  }

  function rpsOutcome(a, b) {
    if (a === b) return "tie";
    return BEATS[a] === b ? "player" : "ai";
  }
  function countBy(arr) {
    return arr.reduce(
      (acc, h) => {
        acc[h] = (acc[h] || 0) + 1;
        return acc;
      },
      { Rock: 0, Paper: 0, Scissors: 0 }
    );
  }
  function handEmoji(id) {
    return HANDS.find((h) => h.id === id)?.emoji || "?";
  }
  function appendLog(html) {
    const p = div();
    p.innerHTML = html;
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Rewards
  function rewardPhase() {
    // Build mixed pool: artifacts not owned + recipes not learned
    const artifactPool = ARTIFACT_POOL.filter((a) => !state.playerArtifacts.some((x) => x.id === a.id));
    const recipePool = RECIPE_POOL.filter((r) => !state.playerRecipes.includes(r.id));

    // Random mix across both pools: any combination allowed (0–3 recipes)
    const union = [...artifactPool.map((a) => ({ kind: "artifact", data: a })), ...recipePool.map((r) => ({ kind: "recipe", data: r }))];
    const picks = [];
    const copy = union.slice();
    while (picks.length < 3 && copy.length) {
      const pick = sample(copy);
      picks.push(pick);
      copy.splice(copy.indexOf(pick), 1);
    }

    if (picks.length === 0) {
      btnNext.classList.remove("hidden");
      return;
    }

    rewardChoices.innerHTML = "";
    picks.forEach((p) => {
      if (p.kind === "artifact") {
        const a = p.data;
        const c = div("choice");
        c.innerHTML = `<h3>${a.name} <span class="${rarityClass(a.tier)}">(${a.tier})</span></h3><p class="tiny">${a.desc}</p>`;
        c.addEventListener("click", () => {
          state.playerArtifacts.push(a);
          appendLog(`<b>Artifact gained:</b> ${a.name}`);
          renderArtifacts();
          rewardModal.close();
          btnNext.classList.remove("hidden");
        });
        rewardChoices.appendChild(c);
      } else {
        const r = p.data;
        const c = div("choice recipe");
        c.innerHTML = `<div class="badge recipe">Recipe</div><h3>${r.name} <span class="${rarityClass(r.rarity)}">(${
          r.rarity
        })</span></h3><p class="tiny">${r.summary}</p>`;
        c.addEventListener("click", () => {
          state.playerRecipes.push(r.id);
          appendLog(`<b>Recipe learned:</b> ${r.name}`);
          rewardModal.close();
          btnNext.classList.remove("hidden");
        });
        rewardChoices.appendChild(c);
      }
    });
    rewardModal.showModal();
  }

  // ---------- FX helpers
  function stageTemplate(i, total, pHand, aHand) {
    return `<div class="compareStage">
      <div class="lane p" id="lane-p">
        <div class="head">${handEmoji(pHand)} <span><b>Player</b> • Compare ${i + 1}/${total}</span></div>
        <div class="calc">Base <span class="num base">100</span> × Mult <span class="num mult">1.0</span></div>
        <div class="chips" id="chips-p"></div>
      </div>
      <div class="vs">VS</div>
      <div class="lane a" id="lane-a">
        <div class="head">${handEmoji(aHand)} <span><b>AI</b></span></div>
        <div class="calc">Base <span class="num base">100</span> × Mult <span class="num mult">1.0</span></div>
        <div class="chips" id="chips-a"></div>
      </div>
    </div>`;
  }

  async function playCompareSequence({ index, total, pHand, aHand, pStart, aStart, events, pEnd, aEnd, outcome }) {
    fxStage.innerHTML = stageTemplate(index, total, pHand, aHand);
    const pLane = el("#lane-p"),
      aLane = el("#lane-a");
    const pBaseEl = pLane.querySelector(".base");
    const pMultEl = pLane.querySelector(".mult");
    const aBaseEl = aLane.querySelector(".base");
    const aMultEl = aLane.querySelector(".mult");
    const pChips = el("#chips-p");
    const aChips = el("#chips-a");

    // Reset start values
    pBaseEl.textContent = fmt(pStart.base);
    pMultEl.textContent = fmt(pStart.mult);
    aBaseEl.textContent = fmt(aStart.base);
    aMultEl.textContent = fmt(aStart.mult);

    // animate per-event, in order
    for (const e of events) {
      if (e.who === "p") {
        if (e.stat === "base" && e.op === "add") {
          addChip(pChips, `+${fmt(e.amount)} base — ${e.source}`);
          await animateNumber(
            pBaseEl,
            parseFloat(pBaseEl.textContent.replace(/,/g, "")),
            parseFloat(pBaseEl.textContent.replace(/,/g, "")) + e.amount,
            PACE.numberMs
          );
          bump(pBaseEl);
          glow(pLane);
          trail(pBaseEl, "+" + fmt(e.amount), "base");
          burst(pLane, "#ffcc66");
        } else if (e.stat === "mult" && e.op === "add") {
          addChip(pChips, `+${fmt(e.amount)} mult — ${e.source}`);
          await animateNumber(pMultEl, parseFloat(pMultEl.textContent), parseFloat(pMultEl.textContent) + e.amount, PACE.numberMsMult);
          bump(pMultEl);
          glow(pLane);
          trail(pMultEl, "+" + fmt(e.amount), "mult");
          burst(pLane, "#6ca3ff");
        } else if (e.stat === "mult" && e.op === "mul") {
          addChip(pChips, `×${fmt(e.factor)} mult — ${e.source}`);
          const cur = parseFloat(pMultEl.textContent);
          await animateNumber(pMultEl, cur, cur * e.factor, PACE.numberMsMult);
          bump(pMultEl);
          glow(pLane);
          trail(pMultEl, "×" + fmt(e.factor), "mult");
          burst(pLane, "#6ca3ff");
          if (e.source === "RPS Win") screenshake(fxStage, 700, 10);
        }
      } else if (e.who === "a") {
        if (e.stat === "base" && e.op === "add") {
          addChip(aChips, `+${fmt(e.amount)} base — ${e.source}`);
          await animateNumber(
            aBaseEl,
            parseFloat(aBaseEl.textContent.replace(/,/g, "")),
            parseFloat(aBaseEl.textContent.replace(/,/g, "")) + e.amount,
            PACE.numberMs
          );
          bump(aBaseEl);
          glow(aLane);
          trail(aBaseEl, "+" + fmt(e.amount), "lose");
          burst(aLane, "#ff6b6b");
        } else if (e.stat === "mult" && e.op === "add") {
          addChip(aChips, `+${fmt(e.amount)} mult — ${e.source}`);
          await animateNumber(aMultEl, parseFloat(aMultEl.textContent), parseFloat(aMultEl.textContent) + e.amount, PACE.numberMsMult);
          bump(aMultEl);
          glow(aLane);
          trail(aMultEl, "+" + fmt(e.amount), "lose");
          burst(aLane, "#ff6b6b");
        } else if (e.stat === "mult" && e.op === "mul") {
          addChip(aChips, `×${fmt(e.factor)} mult — ${e.source}`);
          const cur = parseFloat(aMultEl.textContent);
          await animateNumber(aMultEl, cur, cur * e.factor, PACE.numberMsMult);
          bump(aMultEl);
          glow(aLane);
          trail(aMultEl, "×" + fmt(e.factor), "lose");
          burst(aLane, "#ff6b6b");
          if (e.source === "RPS Win") screenshake(fxStage, 700, 10);
        }
      }
      await delay(PACE.chipDelay);
    }

    // Reveal final per-side score near the calc line (not overlapping chips)
    const pScore = pEnd.score;
    const aScore = aEnd.score;
    const pCalc = pLane.querySelector(".calc");
    const pScoreEl = div("badge total", `= ${fmt(pScore)}`);
    pCalc.appendChild(pScoreEl);
    bump(pScoreEl);
    await delay(PACE.scoreRevealDelay);
    const aCalc = aLane.querySelector(".calc");
    const aScoreEl = div("badge total", `= ${fmt(aScore)}`);
    aCalc.appendChild(aScoreEl);
    bump(aScoreEl);

    // Show result tags + shake on win side
    await delay(PACE.betweenSides);
    const pTag = div("resultTag " + (pScore > aScore ? "win" : pScore < aScore ? "lose" : ""));
    pTag.textContent = pScore > aScore ? "WIN" : pScore < aScore ? "LOSE" : "";
    pLane.appendChild(pTag);
    const aTag = div("resultTag " + (aScore > pScore ? "win" : aScore < pScore ? "lose" : ""));
    aTag.textContent = aScore > pScore ? "WIN" : aScore < pScore ? "LOSE" : "";
    aLane.appendChild(aTag);
    if (pScore !== aScore) {
      screenshake(pScore > aScore ? pLane : aLane, 600, 8);
      burst(pScore > aScore ? pLane : aLane, pScore > aScore ? "#37d399" : "#ff6b6b");
    }

    await delay(450);
  }

  function addChip(container, text) {
    const c = div("chip", text);
    container.appendChild(c);
    requestAnimationFrame(() => c.classList.add("show"));
  }
  function bump(elm) {
    elm.classList.remove("bump");
    void elm.offsetWidth;
    elm.classList.add("bump");
  }
  function glow(panel) {
    panel.classList.remove("glow");
    void panel.offsetWidth;
    panel.classList.add("glow");
  }

  // Color trails
  function trail(target, text, kind = "base") {
    const stageRect = fxStage.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const t = div("trail " + kind, text);

    t.style.left = rect.left - stageRect.left + rect.width / 2 + "px";
    t.style.top = rect.top - stageRect.top + rect.height / 2 + "px";
    fxStage.appendChild(t);
    t.addEventListener("animationend", () => t.remove());
  }

  // Particle burst
  function burst(panel, color) {
    const rect = panel.getBoundingClientRect();
    const origin = { x: rect.width / 2, y: rect.height / 2 };
    for (let i = 0; i < 12; i++) {
      const p = div("particle");
      p.style.left = origin.x + "px";
      p.style.top = origin.y + "px";
      p.style.background = color;
      p.style.opacity = 0.95;
      p.style.transform = "translate(-50%,-50%) scale(1)";
      p.style.transition = "transform 0.7s ease, opacity 0.7s ease";
      panel.appendChild(p);
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 40;
      requestAnimationFrame(() => {
        p.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.6)`;
        p.style.opacity = 0;
      });
      setTimeout(() => p.remove(), 800);
    }
  }

  // Screen shake
  function screenshake(node, ms = 650, mag = 8) {
    node.style.setProperty("--shake-ms", ms + "ms");
    node.style.setProperty("--mag", mag + "px");
    node.classList.remove("shake");
    void node.offsetWidth;
    node.classList.add("shake");
  }

  async function animateNumber(node, from, to, ms) {
    from = Number(from);
    to = Number(to);
    if (!isFinite(from)) from = 0;
    if (!isFinite(to)) to = 0;
    const start = performance.now();
    return new Promise((res) => {
      function step(t) {
        const k = clamp((t - start) / ms, 0, 1);
        const cur = from + (to - from) * easeInCubic(k);
        node.textContent = node.classList.contains("num") ? cur.toFixed(2) : fmt(cur);
        if (k < 1) requestAnimationFrame(step);
        else {
          node.textContent = node.classList.contains("num") ? to.toFixed(2) : fmt(to);
          res();
        }
      }
      requestAnimationFrame(step);
    });
  }
  const easeInCubic = (x) => x * x * x;

  // ---------- Events
  btnClear.addEventListener("click", () => {
    currentChoices = Array(state.handsCount).fill(null);
    refresh();
  });
  btnRandom.addEventListener("click", () => {
    for (let i = 0; i < state.handsCount; i++) currentChoices[i] = sample(HANDS).id;
    refresh();
  });
  // ---------- Workshop logic (top-level)
  function renderWorkshopList() {
    workshopList.innerHTML = "";
    const recs = state.playerRecipes.map((id) => RECIPE_POOL.find((r) => r.id === id)).filter(Boolean);
    if (recs.length === 0) {
      workshopList.appendChild(div("muted tiny", "No recipes learned yet. Learn recipes from rewards."));
      workshopPreview.innerHTML = '<div class="muted tiny">Select a recipe to see details.</div>';
      return;
    }
    recs.forEach((r) => {
      const item = div("recipe-item", `<b>${r.name}</b> <span class=\"muted tiny\">(${r.rarity})</span><div class=\"tiny\">${r.summary}</div>`);
      item.addEventListener("click", () => renderWorkshopPreview(r));
      workshopList.appendChild(item);
    });
  }
  function renderWorkshopPreview(r) {
    const norm = (s) =>
      String(s || "")
        .trim()
        .toLowerCase();
    const ownedSet = new Set(state.playerArtifacts.map((a) => norm(a.id)));
    const reqHtml = r.requires
      .map((rid) => {
        const ok = ownedSet.has(norm(rid));
        const a = ARTIFACT_POOL.find((x) => norm(x.id) === norm(rid));
        return `<span class=\"req ${ok ? "ok" : "miss"}\">${ok ? "✓" : "✗"} ${a ? a.name : rid}</span>`;
      })
      .join(" ");
    workshopPreview.innerHTML = `
      <h3>${r.name} <span class=\"muted\">(${r.rarity})</span></h3>
      <p class=\"tiny\">${r.summary}</p>
      <div class=\"divider\"></div>
      <div><b>Requires:</b> <div class=\"requirements\">${reqHtml}</div></div>
      <div class=\"stack\" style=\"margin-top:10px\">
        <button id=\"btnDoCraft\" class=\"btn primary\">Craft</button>
      </div>
    `;
    const canCraft = r.requires.every((rid) => ownedSet.has(norm(rid)));
    const btn = el("#btnDoCraft");
    btn.disabled = !canCraft;
    btn.addEventListener("click", () => {
      if (!canCraft) return;
      const names = r.requires.map((id) => ARTIFACT_POOL.find((x) => x.id === id)?.name || id).join(", ");
      const ok = confirm(`Craft "${r.name}"?\nThis will consume: ${names}`);
      if (!ok) return;
      doCraft(r);
    });
  }
  function doCraft(r) {
    // consume artifacts
    r.requires.forEach((id) => {
      const idx = state.playerArtifacts.findIndex((a) => a.id === id);
      if (idx !== -1) state.playerArtifacts.splice(idx, 1);
    });
    // add crafted hand
    state.craftedHands.push(r.outputHandId);
    appendLog(`<b>Crafted:</b> ${r.name}`);
    renderArtifacts();
    renderWorkshopList();
    renderWorkshopPreview(r);
  }
  // Open/close workshop
  btnWorkshop.addEventListener("click", () => {
    if (state.inProgress) return; // only between matches
    renderWorkshopList();
    workshopModal.showModal();
  });
  el("#closeWorkshop").addEventListener("click", () => workshopModal.close());
  btnLock.addEventListener("click", () => resolveMatch());
  btnNext.addEventListener("click", () => {
    btnNext.classList.add("hidden");
    state.round += 1;
    state.handsCount += 1;
    startMatch();
  });
  btnRetry.addEventListener("click", () => {
    btnRetry.classList.add("hidden");
    startMatch();
  });
  btnReset.addEventListener("click", () => {
    resetRun();
  });
  closeReward.addEventListener("click", () => {
    rewardModal.close();
    btnNext.classList.remove("hidden");
  });

  // ---------- Init
  resetRun();
})();
