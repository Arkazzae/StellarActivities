import { getOpponent, type OpponentId } from "@/ai/bots";

/** Portrait of a character or the engine, shared across every opponent surface. */
export function BotPortrait({ id, thinking = false, className = "" }: {
  id?: OpponentId;
  thinking?: boolean;
  className?: string;
}) {
  return (
    <span className={`portrait${thinking ? " is-thinking" : ""}${className ? ` ${className}` : ""}`}>
      <img src={getOpponent(id).avatarUrl} width={512} height={512} alt="" decoding="async" draggable={false} />
    </span>
  );
}

/** A person in the room: their Stellarr avatar, or their initial on a colour of their own. */
export function PersonAvatar({ name, url, className = "" }: { name: string; url?: string | null; className?: string }) {
  const hue = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  return (
    <span className={`portrait portrait--person${className ? ` ${className}` : ""}`} style={url ? undefined : { background: `hsl(${hue} 38% 42%)` }}>
      {url ? <img src={url} alt="" decoding="async" draggable={false} /> : <span aria-hidden="true">{name.trim().charAt(0).toUpperCase() || "?"}</span>}
    </span>
  );
}
