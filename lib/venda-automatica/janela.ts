/**
 * A janela de execução da campanha (§2, D9): 09:00–17:30 no FUSO DA ORGANIZAÇÃO,
 * não em UTC e não no fuso da VPS.
 *
 * O defeito que este arquivo existe para tornar impossível: o cron roda em UTC,
 * e "só manda das 9 às 17:30" interpretado em UTC manda das 6h às 14h30 no
 * horário de quem vai ler a mensagem. O relógio de parede aqui é calculado com
 * `Intl.DateTimeFormat` no fuso da org (o mesmo motor das janelas de envio do
 * WhatsApp), e fuso inválido degrada para o padrão — nunca lança no worker.
 */
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";

/** O fuso da org, com degradação: valor ausente/quebrado vira o padrão. */
export function fusoSeguro(fuso: string | null | undefined): string {
  if (fuso && fusoValido(fuso)) return fuso;
  return FUSO_PADRAO;
}

export interface RelogioLocal {
  /** "2026-09-30" no fuso dado. */
  dia: string;
  /** "09:07" (HH:MM) no fuso dado — o relógio de parede que a janela compara. */
  hora: string;
}

/** O relógio de parede da org para um instante ISO. */
export function relogioNoFuso(iso: string, fuso: string): RelogioLocal {
  const seg = fusoSeguro(fuso);
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: seg,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  // en-CA com hour/minute devolve "2026-09-30, 09:07" (ou com "/" variante).
  const m = /^(\d{4}-\d{2}-\d{2})[,\s]+(\d{2}:\d{2})/.exec(partes);
  if (!m) return { dia: iso.slice(0, 10), hora: "00:00" };
  return { dia: m[1]!, hora: m[2]! === "24:00" ? "00:00" : m[2]! };
}

/**
 * A campanha está dentro da janela? Comparação lexicográfica de HH:MM é
 * correta (mesmo comprimento, zero à esquerda).
 *
 * Janela que atravessa a meia-noite (início > fim) é tratada como JEITO ERRADO
 * de configurar e devolve `true` em vez de engolir o dia inteiro em silêncio —
 * a validação da criação já recusa, isto aqui é a defesa do worker contra uma
 * linha gravada por caminho torto.
 */
export function dentroDaJanela(
  agoraIso: string,
  fuso: string,
  janelaInicio: string,
  janelaFim: string,
): boolean {
  const { hora } = relogioNoFuso(agoraIso, fuso);
  if (janelaInicio >= janelaFim) return true;
  return hora >= janelaInicio && hora < janelaFim;
}
