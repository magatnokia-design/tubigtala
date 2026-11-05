// Pairing a TubigTala Station (one ESP32 board) to an account (docs/data-model.md, "Pairing").
// The station's QR sticker holds its ID and a secret pairing code; the rules let a signed-in user
// claim a station only while it has no owner and only with that code. Also used by devtools to
// make codes, so the format is defined once.

/** Product name of the board, shown in the app. Users cannot rename it. */
export const STATION_NAME = 'TubigTala Station';

/** No 0/O or 1/I/L, so a code typed from the sticker cannot be misread. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** 12 characters from 31 = about 59 bits: not guessable, short enough to type. */
export const CODE_LENGTH = 12;

const ID_PATTERN = /^[A-Za-z0-9-]{1,40}$/; // same characters the rules allow in alertState keys
const PAYLOAD_PREFIX = 'tubigtala:station?';

export interface PairingInfo {
  deviceId: string;
  /** normalized: uppercase, no spaces or dashes */
  code: string;
}

/** "abcd-efgh jkmn" -> "ABCDEFGHJKMN" */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
}

/** "ABCDEFGHJKMN" -> "ABCD-EFGH-JKMN", as printed on the sticker. */
export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** What the QR code contains: tubigtala:station?id=tank-01&code=ABCD-EFGH-JKMN */
export function pairingPayload({ deviceId, code }: PairingInfo): string {
  return `${PAYLOAD_PREFIX}id=${encodeURIComponent(deviceId)}&code=${formatCode(code)}`;
}

/** Reads a scanned QR; null if it is not a TubigTala Station code. */
export function parsePairingPayload(text: string): PairingInfo | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PAYLOAD_PREFIX)) return null;
  const params: Record<string, string> = {};
  for (const part of trimmed.slice(PAYLOAD_PREFIX.length).split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    try {
      params[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
    } catch {
      return null;
    }
  }
  const deviceId = (params.id ?? '').trim();
  const code = normalizeCode(params.code ?? '');
  return ID_PATTERN.test(deviceId) && isValidCode(code) ? { deviceId, code } : null;
}

/** Field errors for typing the ID and code by hand; undefined when valid. */
export function stationIdError(id: string): string | undefined {
  if (!id.trim()) return 'Enter the station ID printed under the QR code.';
  if (!ID_PATTERN.test(id.trim())) return 'Use only letters, numbers and dashes, as printed (e.g. tank-01).';
  return undefined;
}

export function pairingCodeError(input: string): string | undefined {
  const code = normalizeCode(input);
  if (!code) return 'Enter the pairing code printed under the QR code.';
  if (code.length !== CODE_LENGTH) return `The code has ${CODE_LENGTH} letters and numbers (e.g. ABCD-EFGH-JKMN).`;
  if (!isValidCode(code)) return 'That code has a character that is not used in pairing codes. Check the sticker.';
  return undefined;
}
