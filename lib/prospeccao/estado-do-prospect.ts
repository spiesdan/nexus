/**
 * O ESTADO COMERCIAL DO PROSPECT PRECISA SER ALIMENTADO POR FATOS.
 *
 * ─── O defeito que fez este arquivo existir ────────────────────────────────
 *
 * Medido em 10/11/2026 na campanha `b4129d6b` (Lebon Régis/Fraiburgo/Videira):
 *
 *   prospects na campanha ................ 241
 *   já contatados (ledger com envio) ..... 71
 *   mensagens de ENTRADA recebidas ....... 11, de 10 contatos diferentes
 *   `status_comercial` de todos os 71 .... "novo"
 *   `contact_id` de todos os 71 .......... null
 *   card da campanha ..................... "0 respostas"
 *
 * Ninguém mentiu: o funil do §28 é `status_comercial`-driven (D15) e o status
 * nunca saía de `novo`. A campanha mandava, o cliente respondia, o CRM abria
 * lead — e o funil continuava em zero, porque o único caminho que escrevia
 * `status_comercial` era o import manual para o CRM.
 *
 * ─── Por que aqui, e não na tela ───────────────────────────────────────────
 *
 * Contar "respostas" na leitura (cruzar campanha → mensagens → inbound) daria
 * o número certo uma vez e criaria uma SEGUNDA régua para o mesmo fato: o dia
 * em que a tela e o banco discordassem, ninguém saberia qual acreditar. O que
 * conserta de verdade é o que já devia acontecer: o envio deixa o vínculo com
 * o contato, o envio marca `contatado`, a entrada do cliente marca
 * `respondeu`. Aí o funil lê o status e o status conta a história real.
 *
 * ─── O que este módulo NUNCA faz ───────────────────────────────────────────
 *
 * Só anda para a FRENTE. `sem_interesse`, `descartado` e `cliente` são
 * decisões — de quem opera, do outro lado, ou do faturamento — e um envio de
 * campanha não as desfaz. Um update que "corrigisse" `sem_interesse` para
 * `contatado` faria o funil inflar justamente com quem já disse não.
 *
 * Toda função é fail-soft: o envio já saiu e a mensagem já está gravada quando
 * elas rodam. Falhar aqui não pode desfazer nada, e derrubar a ingestão do
 * webhook por causa de um contador faria o provider reentregar tudo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

type Db = SupabaseClient;

/** De onde um envio pode avançar para `contatado`. */
const AINDA_SEM_CONTATO = ["novo", "nao_analisado", "contato_pendente"] as const;

/** De onde uma resposta pode avançar para `respondeu`. */
const AINDA_SEM_RESPOSTA = ["novo", "nao_analisado", "contato_pendente", "contatado"] as const;

export interface VinculoDoEnvio {
  organizationId: string;
  /** `business_prospects.id` — não confundir com o id do CONTATO. */
  prospectId: string;
  /** O contato que o `fn_upsert_wa_contact` resolveu para o telefone. */
  contactId: string;
}

/**
 * O prospect da base passa a apontar para o contato que recebeu a mensagem.
 *
 * Sem este vínculo a resposta do cliente chega no inbox, abre lead e não tem
 * como voltar até a empresa de origem — foi por isso que 10 respostas reais
 * viraram zero na tela.
 *
 * Só preenche quando está NULL. Um prospect já vinculado a outro contato é
 * decisão de quem importou para o CRM (o import liga no contato do telefone
 * canônico); sobrescrever aqui juntaria duas empresas numa linha só.
 */
export async function vincularContatoAoProspect(db: Db, v: VinculoDoEnvio): Promise<void> {
  try {
    const { error } = await db
      .from("business_prospects")
      .update({ contact_id: v.contactId })
      .eq("organization_id", v.organizationId)
      .eq("id", v.prospectId)
      .is("contact_id", null);
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("estado-do-prospect: vínculo com o contato NÃO gravado", {
      organization_id: v.organizationId,
      prospect_id: v.prospectId,
      contact_id: v.contactId,
      detalhe: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
}

/**
 * O envio saiu: a empresa deixa de ser "intocada".
 *
 * `sent`/`sending` são a prova disponível no instante do envio (o ack do
 * WhatsApp chega depois, pelo webhook). Esperar o ack faria o funil depender
 * de um evento que o canal pode não mandar — e a mensagem saiu de qualquer
 * forma.
 */
export async function marcarComoContatado(
  db: Db,
  v: { organizationId: string; prospectId: string },
): Promise<void> {
  try {
    const { error } = await db
      .from("business_prospects")
      .update({ status_comercial: "contatado" })
      .eq("organization_id", v.organizationId)
      .eq("id", v.prospectId)
      .in("status_comercial", [...AINDA_SEM_CONTATO]);
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("estado-do-prospect: status contatado NÃO gravado", {
      organization_id: v.organizationId,
      prospect_id: v.prospectId,
      detalhe: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
}

/**
 * Chegou mensagem do contato: todo prospect que aponta para ele respondeu.
 *
 * Chamada na entrada de TODA mensagem (o cliente que nunca foi prospect
 * também escreve). O update é barato e idempotente: sem prospect no status
 * anterior, zero linhas mudam — e é por isso que o "nada mudou" não vira log,
 * senão o `event_log` de um atendimento normal ficaria enchendo de ruído.
 *
 * `sem_interesse`/`descartado` ficam de fora de propósito: quem já disse não
 * respondeu "de novo" — e voltar esse status faria o funil contar de novo uma
 * empresa que a operação descartou.
 */
export async function marcarProspectComoRespondeu(
  db: Db,
  v: { organizationId: string; contactId: string },
): Promise<void> {
  try {
    const { data, error } = await db
      .from("business_prospects")
      .update({ status_comercial: "respondeu" })
      .eq("organization_id", v.organizationId)
      .eq("contact_id", v.contactId)
      .in("status_comercial", [...AINDA_SEM_RESPOSTA])
      .select("id");
    if (error) throw new Error(error.message);
    const marcados = (data ?? []) as { id: string }[];
    if (marcados.length > 0) {
      logger.info("pos-entrada: prospect marcado como respondeu", {
        organization_id: v.organizationId,
        contact_id: v.contactId,
        prospect_ids: marcados.map((m) => m.id),
      });
    }
  } catch (err) {
    logger.warn("estado-do-prospect: status respondeu NÃO gravado", {
      organization_id: v.organizationId,
      contact_id: v.contactId,
      detalhe: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
}
