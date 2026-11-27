import { beforeEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { createClock } from "./clock";
import {
  CHAOS_EFFECTS,
  applyImmediateChaosEffect,
  chaosEffectNeedsBoardTarget,
  chooseChaosTargetsForBot,
  createPendingChaosChoice,
  getChaosTargetCount,
  getChaosTargetSquares,
  type ChaosSnapshot,
} from "./chaos";
import { useGameStore } from "@/state/game";

describe("interactive Chaos effects", () => {
  it("pauses Blink for a piece and destination choice", () => {
    const chess = new Chess();
    const pending = createPendingChaosChoice(chess, "blink", "w");

    expect(pending).not.toBeNull();
    expect(getChaosTargetSquares(chess, pending!)).toContain("d1");

    const destinationStep = { ...pending!, selectedSquares: ["d1" as const] };
    expect(getChaosTargetSquares(chess, destinationStep)).toContain("d4");

    const resolution = applyImmediateChaosEffect(
      chess,
      createClock({ initial: 300, increment: 0 }),
      "blink",
      "w",
      "selected-blink",
      true,
      ["d1", "d4"],
    );

    expect(resolution.boardChanged).toBe(true);
    expect(chess.get("d1")).toBeUndefined();
    expect(chess.get("d4")).toMatchObject({ type: "q", color: "w" });
  });

  it("lets the player choose the pawn forged into a knight", () => {
    const chess = new Chess();
    const pending = createPendingChaosChoice(chess, "knight_forge", "w");

    expect(pending).not.toBeNull();
    expect(getChaosTargetSquares(chess, pending!)).toContain("e2");

    const resolution = applyImmediateChaosEffect(
      chess,
      createClock({ initial: 300, increment: 0 }),
      "knight_forge",
      "w",
      "selected-forge",
      true,
      ["e2"],
    );

    expect(resolution.boardChanged).toBe(true);
    expect(chess.get("e2")).toMatchObject({ type: "n", color: "w" });
  });

  it.each([
    ["bishop_forge", "b"],
    ["rook_forge", "r"],
  ] as const)("lets the player choose a pawn for %s", (effectId, expectedType) => {
    const chess = new Chess();
    const pending = createPendingChaosChoice(chess, effectId, "w");

    expect(pending).not.toBeNull();
    expect(getChaosTargetSquares(chess, pending!)).toContain("d2");

    const resolution = applyImmediateChaosEffect(
      chess,
      createClock({ initial: 0, increment: 0 }),
      effectId,
      "w",
      `selected-${effectId}`,
      false,
      ["d2"],
    );

    expect(resolution.boardChanged).toBe(true);
    expect(chess.get("d2")).toMatchObject({ type: expectedType, color: "w" });
  });

  it("lets the player choose which pawn restores the queen", () => {
    const chess = new Chess("7k/8/8/8/8/8/PP6/7K w - - 0 1");
    const pending = createPendingChaosChoice(chess, "queens_gambit", "w");

    expect(pending).not.toBeNull();
    expect(getChaosTargetSquares(chess, pending!)).toEqual(["a2", "b2"]);

    const resolution = applyImmediateChaosEffect(
      chess,
      createClock({ initial: 300, increment: 0 }),
      "queens_gambit",
      "w",
      "selected-pawn",
      true,
      ["b2"],
    );

    expect(resolution.boardChanged).toBe(true);
    expect(chess.get("a2")).toMatchObject({ type: "p", color: "w" });
    expect(chess.get("b2")).toBeUndefined();
    expect(chess.get("d1")).toMatchObject({ type: "q", color: "w" });
  });

  it("guides a friendly swap through two legal board targets", () => {
    const chess = new Chess();
    const pending = createPendingChaosChoice(chess, "tactical_reset", "w");

    expect(pending).not.toBeNull();
    expect(getChaosTargetSquares(chess, pending!)).toContain("b1");

    const secondStep = { ...pending!, selectedSquares: ["b1" as const] };
    expect(getChaosTargetSquares(chess, secondStep)).toContain("c1");

    const resolution = applyImmediateChaosEffect(
      chess,
      createClock({ initial: 300, increment: 0 }),
      "tactical_reset",
      "w",
      "selected-swap",
      true,
      ["b1", "c1"],
    );

    expect(resolution.boardChanged).toBe(true);
    expect(chess.get("b1")).toMatchObject({ type: "b", color: "w" });
    expect(chess.get("c1")).toMatchObject({ type: "n", color: "w" });
  });

  it("offers swap targets before normal play resumes, regardless of whose turn is next", () => {
    const chess = new Chess();
    for (const move of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Bc5"]) {
      chess.move(move);
    }

    expect(chess.turn()).toBe("w");
    expect(createPendingChaosChoice(chess, "tactical_reset", "w")).not.toBeNull();
    expect(createPendingChaosChoice(chess, "tactical_reset", "b")).not.toBeNull();
  });

  it("finds a complete legal target sequence for every interactive bot effect", () => {
    const fen = "rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1";
    const interactiveEffects = CHAOS_EFFECTS.filter((definition) =>
      chaosEffectNeedsBoardTarget(definition.id),
    );

    for (const definition of interactiveEffects) {
      const chess = new Chess(fen);
      const targets = chooseChaosTargetsForBot(
        chess,
        definition.id,
        "w",
        `bot-target:${definition.id}`,
      );

      expect(targets, definition.id).toHaveLength(getChaosTargetCount(definition.id));
      const resolution = applyImmediateChaosEffect(
        chess,
        createClock({ initial: 300, increment: 0 }),
        definition.id,
        "w",
        `bot-apply:${definition.id}`,
        true,
        targets,
      );
      expect(resolution.boardChanged, definition.id).toBe(true);
    }
  });
});

/** A Chaos game: the player has White, Glut has Black. */
function startChaos(timeControl: { initial: number; increment: number }) {
  useGameStore.getState().newGame({
    timeControl,
    seats: { w: null, b: { id: "glut" } },
    players: {
      w: { userId: "human", username: "Human", avatarUrl: null },
      b: { userId: "glut", username: "Glut", avatarUrl: null },
    },
    chaos: true,
  });
}

/** Put the game in a position with a draft on the table. */
function placeDraft(fen: string, draft: NonNullable<ChaosSnapshot["draft"]>) {
  const { chaos } = useGameStore.getState();
  useGameStore.setState({ chess: new Chess(fen), fen, startFen: fen, chaos: { ...chaos, round: draft.round, draft } });
}

describe("Chaos targeting flow in the game store", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    startChaos({ initial: 300, increment: 0 });
    placeDraft("7k/8/8/8/8/8/PP6/7K w - - 0 1", {
      round: 1,
      chooser: "w",
      options: ["queens_gambit", "hourglass", "pawn_surge"],
      remainingChoosers: ["b"],
    });
  });

  it("keeps the draft paused until the board target is chosen", () => {
    const state = useGameStore.getState();
    expect(state.chooseChaosEffect("queens_gambit")).toBe(true);

    let targeting = useGameStore.getState();
    expect(targeting.chaos.pendingChoice).toMatchObject({
      effectId: "queens_gambit",
      owner: "w",
      selectedSquares: [],
    });
    expect(targeting.chaos.draft?.chooser).toBe("w");
    expect(targeting.chaos.history).toHaveLength(0);
    expect(targeting.clock.running).toBeNull();

    expect(targeting.chooseChaosTarget("b2")).toBe(true);
    targeting = useGameStore.getState();
    expect(targeting.chaos.pendingChoice).toBeNull();
    expect(targeting.chaos.draft?.chooser).toBe("b");
    expect(targeting.chaos.history.at(-1)).toMatchObject({
      effectId: "queens_gambit",
      owner: "w",
      kind: "picked",
    });
    expect(targeting.chess.get("b2")).toBeUndefined();
    expect(targeting.chess.get("d1")).toMatchObject({ type: "q", color: "w" });
    expect(targeting.clock.running).toBeNull();
  });

  it("can return from board targeting to the same card draft", () => {
    const state = useGameStore.getState();
    state.chooseChaosEffect("queens_gambit");
    useGameStore.getState().cancelChaosTarget();

    const restored = useGameStore.getState();
    expect(restored.chaos.pendingChoice).toBeNull();
    expect(restored.chaos.draft?.options).toContain("queens_gambit");
    expect(restored.chess.get("b2")).toMatchObject({ type: "p", color: "w" });
  });

  it("lets the bot resolve a targeted effect without human input", () => {
    startChaos({ initial: 0, increment: 0 });
    placeDraft("rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", {
      round: 1,
      chooser: "b",
      options: ["queens_gambit", "bishop_forge", "rook_forge"],
      remainingChoosers: [],
    });

    expect(useGameStore.getState().chooseChaosEffect("queens_gambit")).toBe(true);

    const resolved = useGameStore.getState();
    const blackPieces = resolved.chess.board().flat().filter((piece) => piece?.color === "b");
    expect(resolved.chaos.pendingChoice).toBeNull();
    expect(resolved.chaos.draft).toBeNull();
    expect(blackPieces.filter((piece) => piece?.type === "q")).toHaveLength(1);
    expect(blackPieces.filter((piece) => piece?.type === "p")).toHaveLength(7);
  });
});
