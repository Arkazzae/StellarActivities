import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { createClock } from "./clock";
import {
  CHAOS_EFFECTS,
  CHAOS_EFFECT_BY_ID,
  applyImmediateChaosEffect,
  chooseChaosEffectForBot,
  createActiveChaosEffect,
  drawChaosOptions,
  getAvailableChaosEffects,
  normalizeChaosSan,
  resolveChaosMove,
} from "./chaos";
import type { Move } from "./types";
import type { PieceColor, Square } from "./types";

const CLOCK_ONLY = new Set([
  "pawn_surge", "kings_grace", "time_thief", "hourglass", "sanctuary",
  "blood_price", "bounty_hunter", "momentum", "frozen_file", "safe_passage",
  "underdog", "royal_decree", "gamblers_coin", "void_tax",
]);

describe("Chaos Chess catalog", () => {
  it("contains 50 unique, fully described effects", () => {
    expect(CHAOS_EFFECTS).toHaveLength(50);
    expect(new Set(CHAOS_EFFECTS.map((item) => item.id)).size).toBe(50);
    for (const item of CHAOS_EFFECTS) {
      expect(item.name.en.length).toBeGreaterThan(2);
      expect(item.name.pl.length).toBeGreaterThan(2);
      expect(item.description.en.length).toBeGreaterThan(10);
      expect(item.description.pl.length).toBeGreaterThan(10);
      expect(item.art).toMatch(/^chaos\/[a-z_]+\.webp$/);
    }
  });

  it("draws three deterministic choices without repeating picked effects", () => {
    const first = drawChaosOptions([], "same-seed");
    const repeated = drawChaosOptions([], "same-seed");
    const next = drawChaosOptions(first, "next-seed");

    expect(first).toEqual(repeated);
    expect(new Set(first).size).toBe(3);
    expect(next).toHaveLength(3);
    expect(next.some((id) => first.includes(id))).toBe(false);
  });

  it("makes legendary cards genuinely rarer than common and rare cards", () => {
    const counts = { common: 0, rare: 0, legendary: 0 };
    for (let round = 0; round < 500; round += 1) {
      for (const id of drawChaosOptions([], `rarity-${round}`)) {
        counts[CHAOS_EFFECT_BY_ID[id].rarity] += 1;
      }
    }

    expect(counts.common).toBeGreaterThan(counts.rare);
    expect(counts.rare).toBeGreaterThan(counts.legendary * 3);
    expect(counts.legendary).toBeLessThan(150);
  });

  it("does not offer clock-only effects in unlimited games", () => {
    for (let round = 0; round < 30; round += 1) {
      const options = drawChaosOptions([], `unlimited-${round}`, false);
      expect(options.every((id) => !CLOCK_ONLY.has(id))).toBe(true);
    }
  });

  it("keeps a broad board-effect pool available without a clock", () => {
    const available = getAvailableChaosEffects(new Chess(), "w", false);

    expect(available.length).toBeGreaterThanOrEqual(32);
    expect(available).toEqual(expect.arrayContaining([
      "pawn_bloom",
      "bishop_forge",
      "rook_forge",
      "royal_ascension",
      "soul_harvest",
      "queens_echo",
      "battle_hardened",
      "wild_growth",
      "pawn_legacy",
      "prismatic_army",
    ]));
  });

  it("also removes unlimited-game instant cards that would do nothing", () => {
    const chess = new Chess();
    const available = getAvailableChaosEffects(chess, "w", false);

    expect(available).not.toContain("second_wind");
    expect(available).not.toContain("queens_gambit");
    expect(available).not.toContain("arcane_reserve");
    expect(available).toContain("crown_of_chance");

    for (let round = 0; round < 20; round += 1) {
      const options = drawChaosOptions([], `available-${round}`, false, available);
      expect(options.every((id) => available.includes(id))).toBe(true);
    }
  });

  it("does not offer structurally impossible cards or duplicate permanent effects", () => {
    const kingsOnly = new Chess("7k/8/8/8/8/8/8/K7 w - - 0 1");
    const available = getAvailableChaosEffects(
      kingsOnly,
      "w",
      true,
      ["royal_guard"],
    );

    expect(available).not.toContain("royal_guard");
    expect(available).not.toContain("blink");
    expect(available).not.toContain("gravity_well");
    expect(available).not.toContain("knight_forge");
    expect(available).not.toContain("blood_price");
    expect(available).not.toContain("tactical_reset");
    expect(available).not.toContain("chaos_swap");
    expect(available).not.toContain("piece_storm");
    expect(available).toContain("second_wind");
  });

  it("keeps both kings on the board after every instant effect", () => {
    for (const definition of CHAOS_EFFECTS.filter((item) => item.duration === "instant")) {
      const chess = new Chess();
      const beforeFen = chess.fen();
      const beforeClock = createClock({ initial: 300, increment: 0 });
      const resolution = applyImmediateChaosEffect(
        chess,
        beforeClock,
        definition.id,
        "w",
        definition.id,
      );
      expect(chess.get("e1")).toMatchObject({ type: "k", color: "w" });
      expect(chess.get("e8")).toMatchObject({ type: "k", color: "b" });
      expect(resolution.boardChanged || resolution.clock.w !== beforeClock.w).toBe(true);
      if (resolution.boardChanged) expect(chess.fen()).not.toBe(beforeFen);
    }
  });

  it("rolls back an instant card that would newly expose its owner's king", () => {
    const chess = new Chess("4r2k/8/8/8/8/8/4Q3/4K3 w - - 0 1");
    const before = chess.fen();
    const resolution = applyImmediateChaosEffect(
      chess,
      createClock({ initial: 300, increment: 0 }),
      "blink",
      "w",
      "pinned-queen",
    );

    expect(chess.fen()).toBe(before);
    expect(resolution.boardChanged).toBe(false);
    expect(resolution.clock.w).toBe(312_000);
  });

  it("applies and expires a timed pawn effect on the owner's turns", () => {
    const chess = new Chess();
    const rawMove = chess.move("e4") as unknown as Move;
    const active = createActiveChaosEffect(CHAOS_EFFECT_BY_ID.pawn_surge, "w", 0, "pawn");
    const resolution = resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [active], b: [] },
      [],
      rawMove,
      1,
    );

    expect(resolution.clock.w).toBe(304_000);
    expect(resolution.activeEffects.w[0].remainingTurns).toBe(3);
    expect(resolution.history.some((entry) => entry.kind === "triggered")).toBe(true);
  });

  it("counts reactive durations on enemy turns, giving all four opportunities", () => {
    const chess = new Chess();
    const active = {
      ...createActiveChaosEffect(CHAOS_EFFECT_BY_ID.frozen_file, "w", 0, "frozen"),
      markedFile: "e",
    };
    const whiteMove = chess.move("e4") as unknown as Move;
    const afterWhite = resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [active], b: [] },
      [],
      whiteMove,
      1,
    );
    expect(afterWhite.activeEffects.w[0].remainingTurns).toBe(4);

    const blackMove = chess.move("e5") as unknown as Move;
    const afterBlack = resolveChaosMove(
      chess,
      afterWhite.clock,
      afterWhite.activeEffects,
      afterWhite.history,
      blackMove,
      2,
    );
    expect(afterBlack.activeEffects.w[0].remainingTurns).toBe(3);
    expect(afterBlack.clock.b).toBe(292_000);
  });

  it("does not curse the owner's own visitor", () => {
    const chess = new Chess("7k/8/8/8/8/2N5/8/7K w - - 0 1");
    const active = {
      ...createActiveChaosEffect(CHAOS_EFFECT_BY_ID.cursed_square, "w", 0, "curse"),
      markedSquare: "e4" as Square,
    };
    const move = chess.move({ from: "c3", to: "e4" }) as unknown as Move;
    const resolution = resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [active], b: [] },
      [],
      move,
      1,
    );

    expect(chess.get("e4")).toMatchObject({ type: "n", color: "w" });
    expect(resolution.activeEffects.w[0].remainingTurns).toBe(4);
    expect(resolution.history).toHaveLength(0);
  });

  it("consumes Echo Move after the first quiet move", () => {
    const chess = new Chess();
    const move = chess.move("e4") as unknown as Move;
    const active = createActiveChaosEffect(CHAOS_EFFECT_BY_ID.echo_move, "w", 0, "echo");
    const resolution = resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [active], b: [] },
      [],
      move,
      1,
    );

    expect(chess.get("e2")).toMatchObject({ type: "p", color: "w" });
    expect(resolution.activeEffects.w).toHaveLength(0);
    expect(resolution.history.map((entry) => entry.kind)).toEqual(["triggered", "expired"]);
  });

  it("lets Echo Move trigger on a quiet king move too", () => {
    const chess = new Chess("7k/8/8/8/8/4K3/8/8 w - - 0 1");
    const move = chess.move({ from: "e3", to: "e4" }) as unknown as Move;
    const active = createActiveChaosEffect(CHAOS_EFFECT_BY_ID.echo_move, "w", 0, "king-echo");
    const resolution = resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [active], b: [] },
      [],
      move,
      1,
    );

    expect(chess.get("e3")).toMatchObject({ type: "p", color: "w" });
    expect(resolution.activeEffects.w).toHaveLength(0);
  });

  it("evaluates Underdog against material before the move", () => {
    const chess = new Chess("7k/8/8/8/8/8/q7/2N4K w - - 0 1");
    const move = chess.move({ from: "c1", to: "a2" }) as unknown as Move;
    const active = createActiveChaosEffect(CHAOS_EFFECT_BY_ID.underdog, "w", 0, "underdog");
    const resolution = resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [active], b: [] },
      [],
      move,
      1,
    );

    expect(resolution.clock.w).toBe(312_000);
  });

  it("banks Scavenger progress until a minor piece can be restored", () => {
    const chess = new Chess("7k/8/8/8/8/8/r6B/7K b - - 0 1");
    const move = chess.move({ from: "a2", to: "h2" }) as unknown as Move;
    const active = {
      ...createActiveChaosEffect(CHAOS_EFFECT_BY_ID.scavenger, "w", 0, "scavenger"),
      progress: 2,
    };
    const resolution = resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [active], b: [] },
      [],
      move,
      1,
    );

    expect(chess.get("b1")).toMatchObject({ type: "n", color: "w" });
    expect(resolution.activeEffects.w[0].progress).toBe(0);
  });

  it("never duplicates one captured piece through overlapping restore effects", () => {
    const chess = new Chess("7k/8/8/8/8/8/r6N/7K b - - 0 1");
    const move = chess.move({ from: "a2", to: "h2" }) as unknown as Move;
    const phoenix = createActiveChaosEffect(CHAOS_EFFECT_BY_ID.phoenix_piece, "w", 0, "phoenix");
    const mirror = createActiveChaosEffect(CHAOS_EFFECT_BY_ID.mirror_shield, "w", 0, "mirror");
    const resolution = resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [phoenix, mirror], b: [] },
      [],
      move,
      1,
    );

    const whiteKnights = chess.board().flat().filter(
      (piece) => piece?.color === "w" && piece.type === "n",
    );
    expect(whiteKnights).toHaveLength(1);
    expect(resolution.activeEffects.w.map((effect) => effect.effectId)).toEqual(["mirror_shield"]);
  });

  it("allows time effects to flag a player instead of protecting the last second", () => {
    const chess = new Chess();
    chess.move("e4");
    const move = chess.move("Nf6") as unknown as Move;
    const active = createActiveChaosEffect(CHAOS_EFFECT_BY_ID.void_tax, "w", 0, "tax");
    const clock = { ...createClock({ initial: 300, increment: 0 }), b: 4_000 };
    const resolution = resolveChaosMove(
      chess,
      clock,
      { w: [active], b: [] },
      [],
      move,
      2,
    );

    expect(resolution.clock.b).toBe(0);
  });

  it("Forked Fate falls back to a safe pawn square from a back-rank origin", () => {
    const chess = new Chess("7k/8/8/8/8/1p6/8/N6K w - - 0 1");
    const move = chess.move({ from: "a1", to: "b3" }) as unknown as Move;
    const active = createActiveChaosEffect(CHAOS_EFFECT_BY_ID.forked_fate, "w", 0, "fork");
    resolveChaosMove(
      chess,
      createClock({ initial: 300, increment: 0 }),
      { w: [active], b: [] },
      [],
      move,
      1,
    );

    expect(chess.get("a2")).toMatchObject({ type: "p", color: "w" });
  });

  it("Tactical Reset always produces a visible type swap", () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const chess = new Chess();
      const before = chess.fen();
      const result = applyImmediateChaosEffect(
        chess,
        createClock({ initial: 300, increment: 0 }),
        "tactical_reset",
        "w",
        `swap-${seed}`,
      );
      expect(result.boardChanged).toBe(true);
      expect(chess.fen()).not.toBe(before);
    }
  });

  it("Crown of Chance always changes the board without a clock", () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const chess = new Chess();
      const before = chess.fen();
      const clock = createClock({ initial: 0, increment: 0 });
      const result = applyImmediateChaosEffect(
        chess,
        clock,
        "crown_of_chance",
        "w",
        `crown-${seed}`,
        false,
      );
      expect(result.boardChanged).toBe(true);
      expect(chess.fen()).not.toBe(before);
      expect(result.clock).toEqual(clock);
    }
  });

  it("summons two pawns with Pawn Bloom in an unlimited game", () => {
    const chess = new Chess();
    const clock = createClock({ initial: 0, increment: 0 });
    const result = applyImmediateChaosEffect(
      chess,
      clock,
      "pawn_bloom",
      "w",
      "bloom",
      false,
    );

    expect(result.boardChanged).toBe(true);
    expect(result.clock).toEqual(clock);
    expect(chess.get("a3")).toMatchObject({ type: "p", color: "w" });
    expect(chess.get("b3")).toMatchObject({ type: "p", color: "w" });
  });

  it("restores missing material after Soul Harvest reaches two captures", () => {
    const chess = new Chess("7k/8/8/8/8/8/1p6/1R5K w - - 0 1");
    const move = chess.move({ from: "b1", to: "b2" }) as unknown as Move;
    const active = {
      ...createActiveChaosEffect(CHAOS_EFFECT_BY_ID.soul_harvest, "w", 0, "harvest"),
      progress: 1,
    };
    const resolution = resolveChaosMove(
      chess,
      createClock({ initial: 0, increment: 0 }),
      { w: [active], b: [] },
      [],
      move,
      1,
    );

    expect(chess.get("d1")).toMatchObject({ type: "q", color: "w" });
    expect(resolution.activeEffects.w[0].progress).toBe(0);
    expect(resolution.history.at(-1)).toMatchObject({
      effectId: "soul_harvest",
      kind: "triggered",
    });
  });

  it("lets the bot choose one of the offered effects", () => {
    const options = drawChaosOptions([], "bot-draft");
    const selected = chooseChaosEffectForBot(
      options,
      new Chess(),
      "b",
      createClock({ initial: 60, increment: 0 }),
    );
    expect(options).toContain(selected);
  });

  it("lets the bot value the actual outcome of an immediate effect", () => {
    const chess = new Chess("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1");
    const selected = chooseChaosEffectForBot(
      ["bishop_forge", "pawn_bloom", "queens_gambit"],
      chess,
      "w",
      createClock({ initial: 0, increment: 0 }),
      false,
    );

    expect(selected).toBe("queens_gambit");
  });

  it("normalizes SAN check markers against the board after Chaos resolves", () => {
    expect(normalizeChaosSan(new Chess(), "Qh5+")).toBe("Qh5");

    const checkedKing = new Chess("7k/8/8/8/8/8/8/K6R b - - 0 1");
    expect(normalizeChaosSan(checkedKing, "Rh1")).toBe("Rh1+");
  });

  it("keeps every effect playable through long legal continuations", () => {
    for (const definition of CHAOS_EFFECTS) {
      for (const owner of ["w", "b"] as const) {
        const chess = openedGame();
        let clock = createClock({ initial: 300, increment: 0 });
        let activeEffects = { w: [], b: [] } as {
          w: ReturnType<typeof createActiveChaosEffect>[];
          b: ReturnType<typeof createActiveChaosEffect>[];
        };
        if (definition.duration === "instant") {
          const resolution = applyImmediateChaosEffect(chess, clock, definition.id, owner, definition.id);
          clock = resolution.clock;
        } else {
          activeEffects[owner].push(createActiveChaosEffect(definition, owner, 8, definition.id));
        }

        for (let ply = 0; ply < 20 && !chess.isGameOver(); ply += 1) {
          const legal = chess.moves({ verbose: true });
          expect(legal.length).toBeGreaterThan(0);
          const selected = legal[(ply * 17 + definition.id.length) % legal.length];
          const move = chess.move({ from: selected.from, to: selected.to, promotion: selected.promotion }) as unknown as Move;
          const resolution = resolveChaosMove(chess, clock, activeEffects, [], move, ply + 9);
          clock = resolution.clock;
          activeEffects = resolution.activeEffects;
          expectPositionIsPlayable(chess);
        }
      }
    }
  }, 10_000);

  it("survives stacked effects across repeated draft rounds", () => {
    for (let scenario = 0; scenario < 8; scenario += 1) {
      const chess = openedGame();
      let clock = createClock({ initial: 300, increment: 0 });
      let activeEffects = { w: [], b: [] } as {
        w: ReturnType<typeof createActiveChaosEffect>[];
        b: ReturnType<typeof createActiveChaosEffect>[];
      };
      let history: ReturnType<typeof resolveChaosMove>["history"] = [];

      for (let ply = 0; ply < 80; ply += 1) {
        const legal = chess.moves({ verbose: true });
        if (!legal.length) break;
        const selected = legal[(scenario * 13 + ply * 19) % legal.length];
        const move = chess.move({
          from: selected.from,
          to: selected.to,
          promotion: selected.promotion,
        }) as unknown as Move;
        const resolution = resolveChaosMove(
          chess,
          clock,
          activeEffects,
          history,
          move,
          ply + 9,
        );
        clock = resolution.clock;
        activeEffects = resolution.activeEffects;
        history = resolution.history;
        expectPositionIsPlayable(chess);

        if ((ply + 1) % 8 !== 0) continue;
        const round = Math.floor((ply + 1) / 8);
        for (const [sideIndex, owner] of (["w", "b"] as const).entries()) {
          const definition = CHAOS_EFFECTS[
            (scenario * 7 + round * 11 + sideIndex * 17) % CHAOS_EFFECTS.length
          ];
          if (definition.duration === "instant") {
            clock = applyImmediateChaosEffect(
              chess,
              clock,
              definition.id,
              owner,
              `stack:${scenario}:${round}:${owner}`,
            ).clock;
          } else {
            activeEffects[owner].push(createActiveChaosEffect(
              definition,
              owner,
              ply + 9,
              `stack:${scenario}:${round}:${owner}`,
            ));
          }
          expectPositionIsPlayable(chess);
        }
      }
    }
  });
});

function openedGame(): Chess {
  const chess = new Chess();
  for (const move of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Bc5"]) {
    chess.move(move);
  }
  return chess;
}

function expectPositionIsPlayable(chess: Chess): void {
  const fen = chess.fen();
  const reloaded = new Chess(fen);
  expect(() => reloaded.moves()).not.toThrow();

  const kings = { w: [] as Square[], b: [] as Square[] };
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece?.type === "k") kings[piece.color].push(piece.square as Square);
      if (piece?.type === "p") expect(piece.square[1]).not.toMatch(/[18]/);
    }
  }
  expect(kings.w).toHaveLength(1);
  expect(kings.b).toHaveLength(1);

  const turn = chess.turn() as PieceColor;
  const previousMover: PieceColor = turn === "w" ? "b" : "w";
  expect(chess.isAttacked(kings[previousMover][0], turn)).toBe(false);
}
