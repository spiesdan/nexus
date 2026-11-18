/**
 * Utilidades puras do Sentinel. Sem I/O, sem relógio escondido.
 */
import { createHash } from "node:crypto";

export const MINUTO_MS = 60_000;
export const HORA_MS = 60 * MINUTO_MS;
export const DIA_MS = 24 * HORA_MS;

/** Idade em ms de um timestamp ISO. Data inválida devolve `Infinity` (velho). */
export function idadeMs(iso: string | null | undefined, agoraMs: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return Number.POSITIVE_INFINITY;
  return Math.max(0, agoraMs - ms);
}

export function maisVelhoQue(
  iso: string | null | undefined,
  agoraMs: number,
  janelaMs: number,
): boolean {
  return idadeMs(iso, agoraMs) > janelaMs;
}

/** Texto de evidência: curto, sem quebra de linha e sem segredo. */
export function corta(valor: string | null | undefined, max = 240): string | null {
  if (valor === null || valor === undefined) return null;
  const limpo = valor.replace(/\s+/g, " ").trim();
  if (limpo === "") return null;
  return limpo.length > max ? `${limpo.slice(0, max)}…` : limpo;
}

/**
 * Texto de TERCEIRO (mensagem de erro de provider, payload de webhook) antes
 * de virar evidência. A ocorrência é dado persistido: e-mail e sequência de
 * dígitos com cara de telefone/documento não entram nela.
 */
export function higienizar(valor: string | null | undefined, max = 240): string | null {
  const limpo = corta(valor, 2_000);
  if (limpo === null) return null;
  const semEmail = limpo.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]");
  const semNumero = semEmail.replace(/\+?\d[\d\s().-]{6,}\d/g, "[numero]");
  return corta(semNumero, max);
}

/** sha256 estável — usado para chaves de grupo que contêm PII. */
export function hashCurto(valor: string): string {
  return createHash("sha256").update(valor).digest("hex").slice(0, 40);
}

/**
 * Mascara e-mail para a evidência: `ana@loja.com` → `a**@loja.com`.
 * A pessoa que investiga precisa reconhecer o domínio; o endereço completo
 * não precisa ser persistido numa tabela de ocorrências.
 */
export function mascararEmail(email: string): string {
  const [local = "", dominio] = email.split("@");
  if (!dominio) return "***";
  const visivel = local.slice(0, 1);
  return `${visivel}${"*".repeat(Math.min(4, Math.max(2, local.length - 1)))}@${dominio}`;
}

/** Data UTC `YYYY-MM-DD`, para agrupar ocorrências por dia. */
export function diaUtc(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "desconhecido";
  return new Date(ms).toISOString().slice(0, 10);
}

export function rotuloNota(serie: string | null, numero: number | null): string {
  if (numero === null) return `série ${serie ?? "?"} (sem número)`;
  return `série ${serie ?? "?"} nº ${numero}`;
}

export function textoOuNulo(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

/** UF válida = duas letras maiúsculas, segundo o vocabulário do produto. */
export function ufValida(uf: unknown): boolean {
  return typeof uf === "string" && /^[A-Z]{2}$/.test(uf.trim().toUpperCase());
}
