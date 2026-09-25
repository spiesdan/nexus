/**
 * Minimal RFC 6238 TOTP (SHA1, 6 digits, 30s period) — test/seed use only.
 * Avoids adding an OTP dependency; secret is the base32 string Supabase
 * returns at factor enroll time.
 */
import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("invalid base32 character in TOTP secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotp(secretBase32: string, nowMs: number = agoraNoServidor()): string {
  const counter = Math.floor(nowMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    (hmac[offset + 1]! << 16) |
    (hmac[offset + 2]! << 8) |
    hmac[offset + 3]!;
  return String(code % 1_000_000).padStart(6, "0");
}

/** Milliseconds until the next 30s TOTP window starts. */
export function msUntilNextTotpWindow(nowMs: number = agoraNoServidor()): number {
  const period = 30_000;
  return period - (nowMs % period);
}

/**
 * Relógio: o GoTrue valida o TOTP contra o tempo do CONTÊINER, e o relógio da
 * máquina de quem roda o e2e pode andar em outra velocidade (medido: +47s numa
 * máquina local com `w32tm` sem sincronização). Com o relógio errado TODO
 * código é recusado (422 "Invalid TOTP code"), sintoma que lê como bug de
 * senha, de MFA ou da tela. O offset é medido pelo header `Date` do
 * `/auth/v1/health` (o tempo do contêiner) e somado ao relógio local SÓ na
 * geração/espera do TOTP.
 *
 * Quem mede: o `globalSetup` do Playwright, que publica o valor em
 * `E2E_CLOCK_OFFSET_MS` — os workers nascem depois e herdam o ambiente. Sem
 * globalSetup (seed rodado solto, CI sem o header) o offset fica ~0 e a
 * compensação é no-op. Correção definitiva da máquina local:
 * `w32tm /resync` com privilégio de administrador.
 */
let deslocamentoMs = 0;

function lerDeslocamentoDaEnv(): number {
  const bruto = process.env.E2E_CLOCK_OFFSET_MS;
  if (!bruto) return 0;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : 0;
}

deslocamentoMs = lerDeslocamentoDaEnv();

export async function medirDeslocamentoRelogio(): Promise<number> {
  if (process.env.E2E_CLOCK_OFFSET_MS !== undefined && process.env.E2E_CLOCK_OFFSET_MS !== "") {
    deslocamentoMs = lerDeslocamentoDaEnv();
    return deslocamentoMs;
  }
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
    const resp = await fetch(`${base}/auth/v1/health`, { method: "GET" });
    const servidor = Date.parse(resp.headers.get("date") ?? "");
    deslocamentoMs = Number.isFinite(servidor) ? servidor - Date.now() : 0;
  } catch {
    deslocamentoMs = 0;
  }
  process.env.E2E_CLOCK_OFFSET_MS = String(deslocamentoMs);
  return deslocamentoMs;
}

/** O instante de AGORA no relógio com que o servidor julga o código. */
export function agoraNoServidor(): number {
  return Date.now() + deslocamentoMs;
}