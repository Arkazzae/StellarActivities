import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Board } from "../draw/Board.tsx";
import type { BoardHandle, BoardInfo, Strip } from "../draw/Board.tsx";
import { SIZES } from "../draw/render.ts";
import type { Tool } from "../draw/render.ts";
import { modeDef } from "../game/modes.ts";
import { COUNTDOWN_MS, PALETTE, crayons, starField, tileRect } from "../game/rules.ts";
import { TEXT_LIMIT } from "../game/types.ts";
import type { TaskSpec } from "../game/types.ts";
import type { Bits } from "../net/image.ts";
import { encodePicture } from "../net/image.ts";
import { pageKey } from "../net/protocol.ts";
import type { Key } from "../lib/i18n.ts";
import { useT } from "../lib/i18n.ts";
import { play } from "../lib/sfx.ts";
import { Avatar, Bitmap, Icon, ModeArt, RoundBar, useTick } from "./common.tsx";
import { useGame, usePrefs } from "./context.ts";

const IDEAS: Record<"pl" | "en", string[]> = {
  pl: [
    "Pingwin otwiera kawiarnię na krze lodowej",
    "Kot pilotuje rakietę zrobioną z tostera",
    "Ślimak przeprowadza się w deszczu",
    "Babcia wygrywa wyścig na hulajnodze",
    "Smok smaży naleśniki na niedzielne śniadanie",
    "Duch uczy się jeździć na deskorolce",
    "Złota rybka zostaje królową akwarium",
    "Kaktus idzie na pierwszą randkę",
    "Słoń próbuje schować się za latarnią",
    "Robot zakochuje się w lodówce",
    "Chmura gubi swój parasol",
    "Ziemniak zostaje gwiazdą rocka",
  ],
  en: [
    "A penguin opens a café on an ice floe",
    "A cat flies a rocket made of a toaster",
    "A snail moves house in the rain",
    "Grandma wins a scooter race",
    "A dragon makes pancakes for Sunday breakfast",
    "A ghost learns to skateboard",
    "A goldfish becomes queen of the aquarium",
    "A cactus goes on a first date",
    "An elephant tries to hide behind a lamppost",
    "A robot falls in love with a fridge",
    "A cloud loses its umbrella",
    "A potato becomes a rock star",
  ],
};

/** Phase word for the countdown. */
function verbFor(task: TaskSpec): Key {
  if (task.output === "text") return task.kind === "describe" || task.kind === "guess" ? "countdown.describing" : "countdown.writing";
  return "countdown.drawing";
}

/**
 * The 3, 2, 1, Start! intro. Each beat walks the illustrated numeral through its four drawn
 * poses (squash, spring, rebound, settle) while the notebook and its three star stickers take
 * matching poses. Less motion shows the resting pose only.
 */
export function Countdown() {
  const game = useGame();
  const t = useT();
  const { prefs } = usePrefs();
  useTick(40);
  const round = game.state.round;
  const task = game.task;
  const match = game.state.match;
  const now = game.now();
  const elapsed = round ? Math.min(COUNTDOWN_MS - 1, Math.max(0, COUNTDOWN_MS - (round.startsAt - now))) : 0;
  const beatMs = COUNTDOWN_MS / 4;
  const beatIndex = Math.min(3, Math.floor(elapsed / beatMs));
  const phase = beatIndex === 3 ? "go" : String(3 - beatIndex);
  // Four poses per beat with a short hold on the last drawing.
  const pose = prefs.lessMotion ? 3 : Math.min(3, Math.floor((elapsed - beatIndex * beatMs) / (beatMs / 5)));
  useEffect(() => {
    play(phase === "go" ? "go" : "tick");
  }, [phase]);
  if (!round || !match) return null;
  const rule = game.roundRule;
  const plan = match.plan.rounds[round.index];
  const glyphPosition = phase === "go" ? `${(pose / 3) * 100}% 0` : `${(pose / 3) * 100}% ${(3 - Number(phase)) * 50}%`;
  return (
    <section className="screen">
      <header className="bar plain">
        <img src="./logo-mark.webp" alt="" className="logo-mark" />
        <span className="disp muted" style={{ fontWeight: 700 }}>Doodle Drift</span>
      </header>
      <div className="countdown" role="status" aria-live="assertive" aria-label={phase === "go" ? "Start!" : phase}>
        <div className={`cd-card${prefs.lessMotion ? " still" : ""}`} data-phase={phase} data-pose={pose} aria-hidden="true">
          <div className="cd-notebook">
            <img className="cd-paper" src="./illustrations/countdown-notebook.webp" alt="" />
            <span className={`cd-glyph ${phase === "go" ? "cd-start" : "cd-digit"}`} style={{ backgroundPosition: glyphPosition }} />
            <span className="cd-star sticker-lime" />
            <span className="cd-star sticker-navy" />
            <span className="cd-star sticker-coral" />
          </div>
        </div>
        <div className="disp muted" style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".04em" }}>
          {t("round.label")} {round.index + 1} {t("round.of")} {match.plan.rounds.length} · {t(`mode.${match.plan.mode}.name` as Key)}
        </div>
        <h1>{task ? t(verbFor(task)) : t("waiting.spectator")}</h1>
        <p>{t("countdown.seconds", { s: plan.seconds })}</p>
        {rule ? <span className="rule-chip"><ModeArt mode={rule} className="art" />{t("countdown.rule", { rule: t(`mode.${rule}.name` as Key) })}</span> : null}
      </div>
    </section>
  );
}

/** Pill naming the round's rule or the mode's twist, shown on task screens. */
function RulePill() {
  const game = useGame();
  const t = useT();
  const match = game.state.match;
  if (!match) return null;
  const rule = game.roundRule;
  const mode = modeDef(match.plan.mode);
  const id = rule ?? (mode.id === "classic" || mode.group === "round" ? null : mode.id);
  if (!id) return null;
  return (
    <div className="mode-pill">
      <ModeArt mode={id} />
      <strong>{t(`mode.${id}.name` as Key)}</strong>
      <span className="muted">{t(`mode.${id}.rule` as Key)}</span>
    </div>
  );
}

function PromptStrip({ label, text, empty, picture }: { label: string; text: string; empty?: boolean; picture?: Bits | null }) {
  return (
    <div className="prompt-row">
      <div className={`paper prompt${empty ? " empty" : ""}${picture !== undefined ? " with-pic" : ""}`}>
        <span className="tape" style={{ left: 22, width: 56, height: 20 }} />
        {picture !== undefined ? (picture ? <Bitmap bits={picture} alt={label} className="prompt-pic" /> : <span className="prompt-pic"><span className="spinner" /></span>) : null}
        <span className="label red">{label}</span>
        <h1>{text}</h1>
      </div>
    </div>
  );
}

function Picture({ pictureKey, label }: { pictureKey: string; label: string }) {
  const game = useGame();
  const t = useT();
  const picture = game.picture(pictureKey);
  useEffect(() => { if (!picture) game.want([pictureKey]); }, [game, picture, pictureKey]);
  const empty = game.state.empty.includes(pictureKey);
  return (
    <div className="pic">
      {picture ? <Bitmap bits={picture} alt={label} className="fill" /> : <div className="missing">{empty ? t("task.emptyPicture") : <span className="spinner" />}</div>}
    </div>
  );
}

// ── Text tasks ──────────────────────────────────────────────────────────────

function writeCopy(task: TaskSpec, flow: string): { title: Key; hint: Key } {
  if (task.kind === "continue") return { title: "task.continue", hint: "task.continueHint" };
  switch (flow) {
    case "story": return { title: "task.writeStory", hint: "task.writeStoryHint" };
    case "flipbook":
    case "relay":
    case "background": return { title: "task.writeTheme", hint: "task.writeThemeHint" };
    case "same": return { title: "task.writeQuestion", hint: "task.writeQuestionHint" };
    case "masterpiece": return { title: "task.writeTitle", hint: "task.writeTitleHint" };
    case "mosaic": return { title: "task.writePicture", hint: "task.writePictureHint" };
    default: return { title: "task.write", hint: "task.writeHint" };
  }
}

function useAutoSubmit(submit: () => void, active: boolean) {
  const game = useGame();
  const round = game.state.round;
  const latest = useRef(submit);
  latest.current = submit;
  useEffect(() => {
    if (!round || !active) return;
    const wait = round.endsAt - game.now() - 350;
    const id = setTimeout(() => latest.current(), Math.max(0, wait));
    return () => clearTimeout(id);
  }, [round, active, game]);
}

function TextField({ value, onChange, onEnter, label, blind, placeholder }: { value: string; onChange: (v: string) => void; onEnter: () => void; label: string; blind: boolean; placeholder: string }) {
  return (
    <div className="text-wrap">
      <label className="label" htmlFor="answer" style={{ display: "block", marginBottom: 10 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <textarea
          id="answer"
          className={blind ? "blind-text" : undefined}
          value={value}
          maxLength={TEXT_LIMIT}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); } }}
        />
        {blind && value ? <div className="blind-dots" aria-hidden="true">{value.replace(/\S/g, "•")}</div> : null}
      </div>
    </div>
  );
}

function WriteTask({ task }: { task: TaskSpec }) {
  const game = useGame();
  const t = useT();
  const { prefs } = usePrefs();
  const [text, setText] = useState("");
  const match = game.state.match!;
  const flow = modeDef(match.plan.mode).flow;
  const copy = writeCopy(task, flow);
  const blind = game.roundRule === "blind";
  const sent = useRef(false);
  const submit = useCallback(() => {
    if (sent.current) return;
    sent.current = true;
    play("done");
    void game.submitText(text);
  }, [game, text]);
  useAutoSubmit(submit, true);
  const prompt = task.prompt ? game.prompt ?? "" : null;
  return (
    <div className="write">
      <div className="write-head">
        <h1>{t(copy.title)}</h1>
        <p>{t(copy.hint)}</p>
      </div>
      {prompt !== null ? (
        <div className="paper mine-card" style={{ width: "min(640px, 100%)", transform: "rotate(-1deg)" }}>
          <span className="label">{t("reveal.sentence")}</span>
          <p>{prompt || t("task.emptyPrompt")}</p>
        </div>
      ) : null}
      <div className="paper write-card">
        <span className="tape" />
        <span className="tape coral" />
        <TextField value={text} onChange={setText} onEnter={() => text.trim() && submit()} label={t("task.yourText")} blind={blind} placeholder={t("task.placeholder")} />
        <div className="write-foot">
          {task.kind === "write" && flow !== "same" ? (
            <button type="button" className="pbtn" onClick={() => { const list = IDEAS[prefs.lang]; setText(list[Math.floor(Math.random() * list.length)]); }}>
              <Icon name="dice" size={18} />{t("task.dice")}
            </button>
          ) : null}
          <span className="count">{text.length} / {TEXT_LIMIT}</span>
        </div>
      </div>
      <div className="submit-row">
        <button type="button" className="btn" disabled={!text.trim()} onClick={submit}>{t("task.done")}<Icon name="check" /></button>
        <span className="muted" style={{ fontSize: 14 }}>{t("task.orEnter")}</span>
      </div>
    </div>
  );
}

function WordSlots({ words, setWords, onEnter }: { words: string[]; setWords: (w: string[]) => void; onEnter: () => void }) {
  const t = useT();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <>
      <div className="word-slots" role="group" aria-label={t("task.yourCaption")}>
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            aria-label={`${i + 1}`}
            value={words[i] ?? ""}
            placeholder="…"
            autoFocus={i === 0}
            style={{ transform: `rotate(${[-1, 0.8, 0.6, -0.6][i]}deg)` }}
            onChange={(e) => {
              const value = e.target.value;
              const next = [...words];
              if (value.endsWith(" ") && value.trim()) {
                next[i] = value.trim();
                setWords(next);
                refs.current[i + 1]?.focus();
                return;
              }
              next[i] = value.replace(/\s/g, "");
              setWords(next);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onEnter(); }
              if (e.key === "Backspace" && !(words[i] ?? "") && i > 0) refs.current[i - 1]?.focus();
            }}
          />
        ))}
      </div>
      <div className="word-meter" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <i key={i} className={words[i] ? "on" : undefined} />)}
        <span>{t("task.words", { n: words.filter(Boolean).length })}</span>
      </div>
    </>
  );
}

function DescribeTask({ task }: { task: TaskSpec }) {
  const game = useGame();
  const t = useT();
  const [text, setText] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const telegram = game.roundRule === "telegram";
  const blind = game.roundRule === "blind";
  const value = telegram ? words.filter(Boolean).join(" ") : text;
  const sent = useRef(false);
  const submit = useCallback(() => {
    if (sent.current) return;
    sent.current = true;
    play("done");
    void game.submitText(value);
  }, [game, value]);
  useAutoSubmit(submit, true);
  const guess = task.kind === "guess";
  return (
    <div className="duo">
      <div className="board-wrap">
        <Picture pictureKey={pageKey(task.source!)} label={t("reveal.drawing")} />
      </div>
      <section className="duo-side">
        <div>
          <h1>{guess ? t("task.guess") : t("task.describe")}</h1>
          <p style={{ marginTop: 8 }}>{guess ? t("task.guessHint") : telegram ? t("mode.telegram.long") : t("task.describeHint")}</p>
        </div>
        {telegram ? (
          <WordSlots words={words} setWords={setWords} onEnter={() => value && submit()} />
        ) : (
          <div className="paper write-card">
            <span className="tape coral" style={{ right: 34 }} />
            <TextField value={text} onChange={setText} onEnter={() => text.trim() && submit()} label={guess ? t("task.yourGuess") : t("task.yourCaption")} blind={blind} placeholder={t("task.placeholder")} />
            <div className="write-foot"><span className="count">{text.length} / {TEXT_LIMIT}</span></div>
          </div>
        )}
        <button type="button" className="btn" style={{ alignSelf: "flex-start" }} disabled={!value.trim()} onClick={submit}>{t("task.done")}<Icon name="check" /></button>
        <p style={{ fontSize: 14 }}>{t("task.autoSend")}</p>
      </section>
    </div>
  );
}

// ── Drawing tasks ───────────────────────────────────────────────────────────

const ALL_TOOLS: Tool[] = ["pen", "brush", "marker", "eraser", "fill", "line", "rect", "ellipse"];

function drawLabel(task: TaskSpec, t: ReturnType<typeof useT>): { label: string; line: string | null } {
  switch (task.kind) {
    case "scribble": return { label: t("task.scribble"), line: t("task.scribbleHint") };
    case "add": return { label: t("task.add"), line: t("task.addHint") };
    case "hole": return { label: t("task.hole"), line: t("task.holeHint") };
    case "part": return { label: t("task.part", { part: t(`task.part.${task.part?.index ?? 0}` as Key) }), line: t("task.partHint") };
    case "copy": return { label: t("task.copyDraw"), line: null };
    case "frame": return { label: t("task.frame", { i: (task.frame?.index ?? 0) + 1, n: task.frame?.count ?? 1 }), line: null };
    case "background": return { label: t("task.background"), line: null };
    case "tile": return { label: t("task.tile"), line: null };
    case "masterpiece": return { label: t("task.masterpiece"), line: null };
    default: return { label: t("task.draw"), line: null };
  }
}

function DrawTask({ task, onFirstTouch }: { task: TaskSpec; onFirstTouch?: () => void }) {
  const game = useGame();
  const t = useT();
  const board = useRef<BoardHandle>(null);
  const match = game.state.match!;
  const round = game.state.round!;
  const rule = game.roundRule;
  const stars = useMemo(() => (rule === "stars" ? starField(match.id) : null), [rule, match.id]);
  const palette = useMemo(() => {
    if (rule === "crayons") {
      const keys = crayons(`${match.id}:${round.index}:${game.me}`);
      return PALETTE.filter((c) => keys.includes(c.key));
    }
    if (rule === "stars") return PALETTE.filter((c) => ["lime", "coral", "sky", "white"].includes(c.key));
    return [...PALETTE];
  }, [rule, match.id, round.index, game.me]);
  const oneLine = rule === "oneline";
  const blind = rule === "blind";
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(palette[0].hex);
  const [size, setSize] = useState(SIZES[1]);
  const [mirrors, setMirrors] = useState(6);
  const [showOnion, setShowOnion] = useState(true);
  const [info, setInfo] = useState<BoardInfo>({ count: 0, canUndo: false, canRedo: false, drawing: false });
  const [restarts, setRestarts] = useState(1);
  /** Jedna kreska: the drawing sends itself three seconds after the pen lifts, unless restarted. */
  const [hold, setHold] = useState<number | null>(null);
  useTick(hold ? 250 : 60_000);
  const holdLeft = hold ? Math.max(0, Math.ceil((hold - Date.now()) / 1000)) : 0;
  const [sending, setSending] = useState(false);
  const sent = useRef(false);

  useEffect(() => { if (!palette.some((c) => c.hex === color)) setColor(palette[0].hex); }, [palette, color]);

  const refs = useMemo(() => [task.source, task.onion, ...(task.base ?? [])].filter(Boolean).map((ref) => pageKey(ref!)), [task]);
  useEffect(() => { game.want(refs); }, [game, refs]);
  const base = (task.base ?? []).map((ref) => game.picture(pageKey(ref))).filter((p): p is NonNullable<typeof p> => !!p);
  const onion = task.onion ? game.picture(pageKey(task.onion)) ?? null : null;

  const submit = useCallback(async () => {
    if (sent.current || !board.current) return;
    sent.current = true;
    setSending(true);
    try {
      const canvas = board.current.exportCanvas(task.output === "layer" ? "layer" : "flat");
      const { bytes, mime } = await encodePicture(canvas, task.output === "layer");
      play("done");
      await game.submitPicture(bytes, mime);
    } catch (error) {
      console.error(error);
      sent.current = false;
      setSending(false);
    }
  }, [game, task.output]);
  useAutoSubmit(() => void submit(), true);
  useEffect(() => {
    if (!hold) return;
    const id = setTimeout(() => { setHold(null); void submit(); }, Math.max(0, hold - Date.now()));
    return () => clearTimeout(id);
  }, [hold, submit]);

  // Mosaic: share a small snapshot of my tile with the neighbours.
  const lastShare = useRef(0);
  useEffect(() => {
    if (!task.tile || !task.clip || info.drawing) return;
    const now = Date.now();
    const wait = Math.max(0, 1200 - (now - lastShare.current));
    const id = setTimeout(async () => {
      if (!board.current || !task.clip) return;
      lastShare.current = Date.now();
      const full = board.current.exportCanvas("layer");
      const crop = document.createElement("canvas");
      crop.width = Math.round(task.clip.w / 2);
      crop.height = Math.round(task.clip.h / 2);
      crop.getContext("2d")!.drawImage(full, task.clip.x, task.clip.y, task.clip.w, task.clip.h, 0, 0, crop.width, crop.height);
      try {
        const { bytes, mime } = await encodePicture(crop, true);
        game.shareTile(bytes, mime);
      } catch { /* a missed snapshot is fine */ }
    }, wait);
    return () => clearTimeout(id);
  }, [info.count, info.drawing, task.tile, task.clip, game]);

  const strips: Strip[] = useMemo(() => {
    if (!task.tile) return [];
    const out: Strip[] = [];
    for (const [key, picture] of game.tiles) {
      const [r, tile] = key.split(":").map(Number);
      if (r !== round.index || tile === task.tile.index) continue;
      out.push({ bits: picture, rect: tileRect(tile, task.tile.cols, task.tile.rows) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.tiles.size, game.getVersion(), task.tile, round.index]);

  let { label, line } = drawLabel(task, t);
  if (task.kind === "draw" && task.source) ({ label, line } = { label: t("task.next"), line: t("task.nextHint") });
  else if (task.kind === "draw" && !task.prompt) {
    const order = match.plan.mode === "custom" ? game.state.settings.custom?.order : undefined;
    ({ label, line } = { label: t("task.freeDraw"), line: order === "drawings" ? t("task.freeDrawStory") : t("task.freeDrawHint") });
  }
  const sourcePicture = task.kind === "draw" && task.source ? game.picture(pageKey(task.source)) ?? null : undefined;
  const prompt = task.prompt ? game.prompt : null;
  const doneCount = game.state.done.length;
  const total = match.players.length;
  const finishedPeople = match.players.filter((p) => game.state.done.includes(p.id));
  const tools = stars ? [] : oneLine ? (["pen", "brush", "marker"] as Tool[]) : ALL_TOOLS;
  const lockedStyle = oneLine && info.count > 0;

  const boardEl = (
    <div className="board-wrap">
      <div style={{ position: "relative" }} className="board-host">
        <Board
          ref={board}
          tool={stars ? "line" : tool}
          color={color}
          size={size}
          label={prompt ?? label}
          base={base}
          hole={task.kind === "hole" ? task.hole : null}
          peek={task.peek ?? null}
          cover={!!task.part || !!task.tile}
          onion={onion}
          showOnion={showOnion}
          clip={task.clip ?? null}
          mirrors={rule === "kaleido" ? mirrors : 1}
          oneLine={oneLine}
          blind={blind}
          veil={blind ? t("draw.blindCanvas") : undefined}
          stars={stars}
          strips={strips}
          disabled={sending}
          onChange={setInfo}
          onFirstTouch={onFirstTouch}
          onStrokeEnd={() => { if (oneLine) setHold(Date.now() + 3000); }}
        />
      </div>
    </div>
  );

  const swatches = (
    <div className="swatches">
      {palette.map((c) => (
        <button key={c.key} type="button" className="swatch" style={{ background: c.hex }} aria-pressed={color === c.hex} aria-label={t(`color.${c.key}` as Key)} title={t(`color.${c.key}` as Key)} disabled={lockedStyle} onClick={() => setColor(c.hex)} />
      ))}
    </div>
  );

  const sizes = (
    <div className="sizes" role="group" aria-label={t("draw.size")}>
      {(stars ? [SIZES[0], SIZES[2]] : SIZES).map((s) => (
        <button key={s} type="button" className="size" aria-pressed={size === s} aria-label={`${t("draw.size")} ${s}`} disabled={lockedStyle} onClick={() => setSize(s)}>
          <span style={{ width: Math.max(5, s * 0.85), height: Math.max(5, s * 0.85) }} />
        </button>
      ))}
    </div>
  );

  return (
    <>
      {prompt !== null ? <PromptStrip label={label} text={prompt || t("task.emptyPrompt")} empty={!prompt} /> : <PromptStrip label={label} text={line ?? ""} picture={sourcePicture} />}
      <div className="work">
        <nav className="rail" aria-label={t("draw.tools")}>
          <div className="rail-tools">
          {stars ? (
            <>
              <button type="button" className="tool" aria-pressed="true" aria-label={t("mode.stars.name")} title={t("mode.stars.name")}><Icon name="stars" /></button>
              <button type="button" className="tool" aria-label={t("draw.newLine")} title={t("draw.newLine")} onClick={() => board.current?.breakLine()}><Icon name="newLine" /></button>
            </>
          ) : tools.map((name, i) => (
            <span key={name} style={{ display: "contents" }}>
              {i === 5 ? <span className="sep" /> : null}
              <button type="button" className="tool" aria-pressed={tool === name} aria-label={t(`draw.${name}` as Key)} title={t(`draw.${name}` as Key)} disabled={lockedStyle} onClick={() => setTool(name)}><Icon name={name} /></button>
            </span>
          ))}
          </div>
          {!oneLine ? (
            <>
              <button type="button" className="tool" aria-label={t("draw.undo")} title={t("draw.undo")} disabled={!info.canUndo} onClick={() => board.current?.undo()}><Icon name="undo" /></button>
              <button type="button" className="tool" aria-label={t("draw.redo")} title={t("draw.redo")} disabled={!info.canRedo} onClick={() => board.current?.redo()}><Icon name="redo" /></button>
            </>
          ) : null}
        </nav>

        {boardEl}

        <aside className="aside">
          <div className="aside-scroll">
          {rule === "kaleido" ? (
            <section className="rail">
              <span className="lab">{t("draw.mirrors")}</span>
              <div className="seg" role="group" aria-label={t("draw.mirrors")}>
                {[2, 4, 6].map((m) => <button key={m} type="button" aria-pressed={mirrors === m} onClick={() => setMirrors(m)}>{m}</button>)}
              </div>
              <span className="aside-note" style={{ padding: 0 }}>{t("draw.mirrorsHint")}</span>
            </section>
          ) : null}
          {task.onion ? (
            <section className="rail">
              <span className="lab">{t("draw.onion")}
                <button type="button" className="toggle" role="switch" aria-checked={showOnion} aria-label={t("draw.onion")} onClick={() => setShowOnion(!showOnion)}><span /></button>
              </span>
              <span className="aside-note" style={{ padding: 0 }}>{t("draw.onionHint")}</span>
            </section>
          ) : null}
          {rule === "crayons" ? (
            <section className="rail">
              <span className="lab">{t("draw.crayons")}</span>
              {palette.map((c) => (
                <button key={c.key} type="button" className="crayon" aria-pressed={color === c.hex} onClick={() => setColor(c.hex)}>
                  <svg viewBox="0 0 70 24" aria-hidden="true"><path d="M0 2h50l16 10-16 10H0z" fill={c.hex} stroke="#07152c" strokeWidth="2" /><path d="M50 2l16 10-16 10z" fill="#f7e8c9" stroke="#07152c" strokeWidth="2" /></svg>
                  {t(`color.${c.key}` as Key)}
                </button>
              ))}
              <span className="aside-note" style={{ padding: 0 }}>{t("draw.crayonsHint")}</span>
            </section>
          ) : (
            <section className="rail">
              <span className="lab">{t("draw.color")}{oneLine ? <Icon name="lock" size={15} /> : null}</span>
              {swatches}
            </section>
          )}
          <section className="rail">
            <span className="lab">{t("draw.size")}</span>
            {sizes}
            {!oneLine && !stars ? (
              <button type="button" className="ghost" onClick={() => board.current?.clear()} disabled={!info.count}><Icon name="trash" size={18} />{t("draw.clear")}</button>
            ) : null}
          </section>
          {blind ? <section className="rail"><span className="lab">{t("draw.blindCanvas")}</span><span className="disp" style={{ fontSize: 26, fontWeight: 750 }}>{t("draw.strokes", { n: info.count })}</span><span className="aside-note" style={{ padding: 0 }}>{t("draw.blindHint")}</span></section> : null}
          {oneLine ? (
            <>
              <button type="button" className="ghost" disabled={!restarts || !info.count || sending} onClick={() => { setHold(null); setRestarts(restarts - 1); board.current?.clear(); }}><Icon name="restart" size={18} />{t("draw.restart")} · {restarts}×</button>
              <p className="aside-note" role="status">{hold ? t("draw.sendingIn", { s: holdLeft }) : info.count ? t("draw.onelineHint") : t("draw.onelineStart")}</p>
            </>
          ) : null}
          {stars ? <p className="aside-note">{t("draw.starsHint")}</p> : null}
          {task.base && task.kind !== "part" ? <p className="aside-note">{t("draw.lockedHint")}</p> : null}
          {task.part ? <p className="aside-note">{t("task.partHint")}</p> : null}
          {task.tile ? <p className="aside-note">{t("task.tileHint")}</p> : null}
          </div>
          <div className="aside-end">
            <div className="done-row">
              <div className="stack" aria-hidden="true">{finishedPeople.slice(0, 4).map((p) => <Avatar key={p.id} person={p} size={26} />)}</div>
              <span>{t("draw.finished", { n: doneCount, m: total })}</span>
            </div>
            <button type="button" className="btn wide" disabled={sending || (!info.count && !stars)} onClick={() => void submit()}>{t("task.done")}<Icon name="check" /></button>
          </div>
        </aside>

        <div className="compact-tools">
          {tools.length ? (
            <div className="tools">
              {tools.slice(0, 6).map((name) => (
                <button key={name} type="button" className="tool" aria-pressed={tool === name} aria-label={t(`draw.${name}` as Key)} disabled={lockedStyle} onClick={() => setTool(name)}><Icon name={name} /></button>
              ))}
            </div>
          ) : null}
          <div className="swatch-row">
            {palette.map((c) => (
              <button key={c.key} type="button" className="swatch" style={{ background: c.hex }} aria-pressed={color === c.hex} aria-label={t(`color.${c.key}` as Key)} disabled={lockedStyle} onClick={() => setColor(c.hex)} />
            ))}
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>{sizes}</div>
            {!oneLine ? (
              <>
                <button type="button" className="icon-btn" aria-label={t("draw.undo")} disabled={!info.canUndo} onClick={() => board.current?.undo()}><Icon name="undo" /></button>
                <button type="button" className="icon-btn" aria-label={t("draw.redo")} disabled={!info.canRedo} onClick={() => board.current?.redo()}><Icon name="redo" /></button>
              </>
            ) : null}
            {stars ? <button type="button" className="icon-btn" aria-label={t("draw.newLine")} onClick={() => board.current?.breakLine()}><Icon name="newLine" /></button> : null}
          </div>
          <button type="button" className="btn wide" disabled={sending || (!info.count && !stars)} onClick={() => void submit()}>{t("task.done")}<Icon name="check" /></button>
        </div>
      </div>
    </>
  );
}

/** Memory rounds: look at the drawing until the first touch or the looking time runs out. */
function CopyTask({ task }: { task: TaskSpec }) {
  const game = useGame();
  const t = useT();
  const round = game.state.round!;
  const peekEnds = round.startsAt + (task.peekSeconds ?? 8) * 1000;
  const [drawing, setDrawing] = useState(false);
  useTick(250);
  const left = Math.max(0, Math.ceil((peekEnds - game.now()) / 1000));
  useEffect(() => { if (!drawing && left <= 0) setDrawing(true); }, [left, drawing]);
  if (drawing) return <DrawTask task={task} />;
  const total = task.peekSeconds ?? 8;
  return (
    <div className="duo">
      <div className="board-wrap">
        <div style={{ position: "relative" }}>
          <Picture pictureKey={pageKey(task.source!)} label={t("reveal.drawing")} />
          <span className="board-badge"><Icon name="eye" size={16} />{t("task.copy")}</span>
        </div>
      </div>
      <section className="duo-side">
        <div>
          <h1>{t("task.copy")}</h1>
          <p style={{ marginTop: 8 }}>{t("task.copyHint")}</p>
        </div>
        <div className="peek-ring" role="timer">
          <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,245,223,.16)" strokeWidth="3.5" /><circle cx="18" cy="18" r="15" fill="none" stroke="#f2b84b" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(left / total) * 94.2} 95`} /></svg>
          <div><b>0:{String(left).padStart(2, "0")}</b><div className="muted">{t("task.peekLeft")}</div></div>
        </div>
        <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={() => setDrawing(true)}><Icon name="pen" />{t("task.copyStart")}</button>
      </section>
    </div>
  );
}

export function TaskScreen() {
  const game = useGame();
  const { openMenu } = usePrefs();
  const task = game.task;
  const round = game.state.round;
  if (!task || !round) return null;
  const key = `${game.state.match?.id}:${round.index}`;
  let body;
  if (task.kind === "write" || task.kind === "continue") body = <WriteTask key={key} task={task} />;
  else if (task.kind === "describe" || task.kind === "guess") body = <DescribeTask key={key} task={task} />;
  else if (task.kind === "copy") body = <CopyTask key={key} task={task} />;
  else body = <DrawTask key={key} task={task} />;
  return (
    <section className="screen">
      <RoundBar onMenu={openMenu}><RulePill /></RoundBar>
      {body}
    </section>
  );
}

export function WaitingScreen({ spectator = false }: { spectator?: boolean }) {
  const game = useGame();
  const t = useT();
  const { openMenu } = usePrefs();
  const match = game.state.match!;
  const task = game.task;
  const key = task ? pageKey(task) : null;
  const mineText = key && task?.output === "text" ? game.texts.get(key) : null;
  const minePicture = key && task?.output !== "text" ? game.picture(key) : undefined;
  const mine = mineText ?? minePicture;
  const next = match.plan.rounds[(game.state.round?.index ?? 0) + 1];
  return (
    <section className="screen">
      <RoundBar onMenu={openMenu} />
      <div className="waiting">
        {spectator ? (
          <section className="waiting-me">
            <div className="sent"><span className="badge"><Icon name="eye" size={30} /></span><div><h1 style={{ fontSize: 30 }}>{t("waiting.spectator")}</h1></div></div>
          </section>
        ) : (
          <section className="waiting-me">
            <div className="sent">
              <span className="badge"><Icon name="check" size={32} style={{ strokeWidth: 3 }} /></span>
              <div><h1>{t("waiting.sent")}</h1><p>{t("waiting.next")}</p></div>
            </div>
            {mine ? (
              <figure className="paper mine-card" style={{ margin: 0 }}>
                <span className="tape" style={{ left: 36 }} />
                {mineText !== null && mineText !== undefined ? <p>{game.roundRule === "blind" ? "•••••" : mineText}</p> : <Bitmap bits={minePicture} alt="" className="mine-pic" />}
              </figure>
            ) : null}
            {next ? <p className="muted">{t(`countdown.${next.tasks[0].output === "text" ? (next.kind === "describe" || next.kind === "guess" ? "describing" : "writing") : "drawing"}` as Key)} · {next.seconds} s</p> : null}
          </section>
        )}
        <section className="panel seats-panel" aria-labelledby="who">
          <div className="side-head">
            <h2 id="who" className="disp" style={{ fontSize: 20 }}>{t("waiting.who")}</h2>
            <span className="disp" style={{ fontSize: 18, fontWeight: 750, color: "var(--lime-text)" }}>{game.state.done.length} / {match.players.length}</span>
          </div>
          <ul className="seats">
            {match.players.map((p) => {
              const done = game.state.done.includes(p.id);
              const away = !game.isConnected(p.id);
              return (
                <li key={p.id} className={`seat${done ? "" : " pending"}`}>
                  <span className="wrap">
                    <Avatar person={p} size={62} />
                    <span className="badge" style={{ background: done ? "var(--lime)" : "var(--paper-bright)", color: "var(--night)" }}><Icon name={done ? "check" : "pen"} size={13} /></span>
                  </span>
                  <strong style={{ fontSize: 14 }}>{p.name}</strong>
                  <small style={{ color: done ? "var(--lime-text)" : "var(--muted)" }}>{done ? t("waiting.done") : away ? t("waiting.away") : t("waiting.working")}</small>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </section>
  );
}
