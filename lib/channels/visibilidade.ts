/**
 * Visibilidade de NÚMERO por membro (migration 0296).
 *
 * O inbox já era escopado por papel e `visibility_mode` (0035). O que faltava
 * era o eixo do NÚMERO: a conta administrativa precisa ver só os avisos de
 * carga, e a comercial só os números de venda. A allowlist mora em
 * `user_organizations.canais_permitidos`:
 *
 *   NULL   → todos (padrão histórico — ninguém muda de comportamento)
 *   {}     → nenhum
 *   [ids]  → exatamente esses
 *
 * A restrição que VALE é a RLS (`fn_can_view_channel` no SELECT de
 * `conversations`; `messages` herda pelo `exists`). Este módulo é a camada de
 * LEITURA para a tela: o seletor do inbox não pode oferecer um número que
 * devolveria zero conversas, e a Equipe precisa mostrar a allowlist atual.
 *
 * ─── Por que a coluna ausente não é erro ────────────────────────────────────
 * Código e migration chegam por caminhos diferentes (o mesmo motivo de
 * `./archived`): num clone que subiu o app antes de aplicar a 0296, o SELECT da
 * coluna devolve 42703. Como NULL significa "todos", rodar a leitura SEM a
 * coluna produz exatamente o estado anterior — todos veem tudo. É degradar para
 * a verdade, não para uma lista vazia que faria o inbox parecer quebrado.
 */
import type { DbErrorLike } from "./archived";

/** Coluna da allowlist. Nomeada aqui porque a detecção de "ausente" a cita. */
export const CANAIS_PERMITIDOS = "canais_permitidos";

/**
 * Os mesmos dois códigos de `isArchivedColumnMissing`, pela mesma razão:
 * `42703` é o Postgres recusando a coluna no SELECT; `PGRST204` é o PostgREST
 * recusando no corpo de uma escrita. O que mantém a detecção estreita é a
 * mensagem NOMEAR a coluna — não o código sozinho.
 */
const COLUNA_AUSENTE = new Set(["42703", "PGRST204"]);

export function isCanaisColumnMissing(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  return (
    COLUNA_AUSENTE.has(error.code ?? "") &&
    (error.message ?? "").includes(CANAIS_PERMITIDOS)
  );
}

export interface LeituraDeCanais {
  data: { canais_permitidos?: string[] | null } | null;
  error: DbErrorLike | null;
}

export type CanaisPermitidos =
  | { ok: true; canais: string[] | null; schemaOutdated: boolean }
  | { ok: false; message: string };

/**
 * Traduz a resposta do PostgREST em "quais números este membro enxerga".
 *
 * `canais: null` = todos. Um erro que NÃO é coluna ausente sobe como `ok:
 * false` — quem chama responde 500. Falhar aberto num erro de rede devolveria
 * o seletor cheio para quem deveria ver um número só; a RLS ainda protegeria as
 * conversas, mas a tela mentiria sobre a configuração.
 */
export function interpretarLeituraDeCanais(leitura: LeituraDeCanais): CanaisPermitidos {
  if (isCanaisColumnMissing(leitura.error)) {
    return { ok: true, canais: null, schemaOutdated: true };
  }
  if (leitura.error) {
    return {
      ok: false,
      message: leitura.error.message ?? "Não consegui ler os números do membro.",
    };
  }
  return {
    ok: true,
    canais: leitura.data?.canais_permitidos ?? null,
    schemaOutdated: false,
  };
}

/** `null` = todos os números; senão, só os ids da allowlist. */
export function canalVisivelPara(canais: string[] | null, channelId: string): boolean {
  return canais === null || canais.includes(channelId);
}

/**
 * O seletor de número do inbox mostra o que a API marcou como visível. O
 * `!== false` (e não `=== true`) cobre a janela em que o cache do react-query
 * ainda tem a resposta anterior ao deploy, sem o campo: esses canais aparecem —
 * é o comportamento antigo, e a RLS continua filtrando as conversas.
 */
export function canaisDoInbox<T extends { visivel_no_inbox?: boolean }>(canais: T[]): T[] {
  return canais.filter((c) => c.visivel_no_inbox !== false);
}
