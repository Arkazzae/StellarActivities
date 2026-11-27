/** Binary packets: a 4-byte header length, a JSON header and the raw payload. */

export interface Packet<H> {
  header: H;
  payload: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function pack(header: object, payload: Uint8Array): Uint8Array {
  const head = encoder.encode(JSON.stringify(header));
  const out = new Uint8Array(4 + head.length + payload.length);
  new DataView(out.buffer).setUint32(0, head.length);
  out.set(head, 4);
  out.set(payload, 4 + head.length);
  return out;
}

export function unpack<H>(bytes: Uint8Array): Packet<H> | null {
  if (bytes.byteLength < 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(0);
  if (length > bytes.byteLength - 4) return null;
  try {
    const header = JSON.parse(decoder.decode(bytes.subarray(4, 4 + length))) as H;
    return { header, payload: bytes.slice(4 + length) };
  } catch {
    return null;
  }
}

/** FNV-1a over the bytes plus the length: enough to tell two pictures apart. */
export function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${bytes.length.toString(36)}`;
}

/** Room for the header inside the 64 KiB message limit. */
export const MAX_IMAGE_BYTES = 63_000;
