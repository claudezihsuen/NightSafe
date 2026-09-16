const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Uint8Array {
  const normalized = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

async function totpAt(secret: string, counter: number): Promise<string> {
  const secretBytes = base32Decode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const counterBuffer = new ArrayBuffer(8);
  new DataView(counterBuffer).setBigUint64(0, BigInt(counter));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuffer));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export async function verifyTotp(secret: string, code: string, now = Date.now()): Promise<boolean> {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const currentCounter = Math.floor(now / 30_000);
  for (const offset of [-1, 0, 1]) {
    if ((await totpAt(secret, currentCounter + offset)) === normalized) return true;
  }
  return false;
}

export function totpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`NightSafe:${email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=NightSafe&algorithm=SHA1&digits=6&period=30`;
}
