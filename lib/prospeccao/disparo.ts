/**
 * DISPARO EM LOTE para prospects — o PLANEJADOR. Função pura: nada aqui fala
 * com banco, com WAHA ou com o relógio do sistema (o instante chega por
 * parâmetro). O chamador monta o contexto, esta função decide.
 *
 * ═══ POR QUE ISTO NÃO É "POSTAR A MENSAGEM EM 500 PONTOS" ═══════════════
 *
 * A mensagem aqui é **fixa** — a mesma para todos. Isso é o que a tela pede e
 * é o que funciona comercialmente (a pessoa responde "oi" e a conversa começa).
 * Mas é exatamente o padrão que derruba um número de WhatsApp: dezenas de mensagens
 * idênticas em sequência, para números que nunca falaram com a gente, em
 * poucos minutos. O próprio repositório já sabe disso — o gate `spinning` da
 * cadeia `before-send` existe para pegar "mensagem idêntica em massa no
 * número" (`lib/agent-engine/guardrails/before-send.ts`).
 *
 * Por isso o planejador não devolve só uma lista de aprovados: devolve o
 * **plano com ritmo**. Cotar por dia, espaçar entre envios e só enviar dentro
 * da janela. Um disparo sem isso não é mais rápido — é mais curto: ban em
 * dias, e o número não volta.
 *
 * ═══ A REGRA MAIS DURA: SEM SESSÃO, NÃO SE ENVIA NADA ════════════════════
 *
 * Medido em 13/10/2026 na instalação do usuário: as 6 `channel_sessions` estão
 * em `STOPPED`, e a única real (`org_4bc721ce`) está com `archived_at`
 * preenchido. Nenhuma `WORKING`. Uma mensagem com sessão não utilizável não
 * volta como erro — o `sendMessageHandler` a deixa em `queued` com
 * `queued_reason='channel_session_not_working'`, e no caminho humano não há
 * reagendamento de `queued`. Ou seja: sem `WORKING`, "enviar 500" significa
 * "jogar 500 linhas na fila e nunca sair nenhuma".
 *
 * Por isso a simulação (o `dry_run`) responde isso ANTES de qualquer envio, e
 * o bloqueio é do PLANEJADOR, não de uma validação na borda: assim a tela e a
 * API contam a mesma história.
 */

/** Teto de mensagens novas por dia. Acima disso o número queima. */
export const TETO_DIARIO = 500;

/** O que a tela oferece por padrão: bem abaixo do teto, e de propósito. */
export const LIMITE_PADRAO_DIA = 50;

/** Menor intervalo entre dois envios, em ms. 1,2s é o que a automação usa. */
export const ESPACO_PADRAO_MS = 1200;

/** Acima disto o WhatsApp costuma truncar, e o texto já não é uma conversa. */
export const TAMANHO_MAXIMO_MENSAGEM = 1000;

export type MotivoDeRecusa =
  /** `business_prospects.do_not_contact` — pedido para não ser contatado. */
  | "do_not_contact"
  /** Prospect marcado como bloqueado pelo operador. */
  | "bloqueado"
  | "sem_telefone"
  | "telefone_invalido"
  /** Telefone que não é celular BR — não tem WhatsApp. */
  | "sem_whatsapp"
  /** `contacts.is_blocked` — a pessoa pediu para parar (opt-out já aconteceu). */
  | "contato_bloqueado"
  /** `contacts.consent.marketing.declined_at` — recusa registrada. */
  | "consent_recusado"
  | "ja_cliente"
  /** Já existe conversa aberta: mandar de novo é segunda mensagem fria. */
  | "conversa_ativa"
  /** Mandamos há pouco para este número. */
  | "mensagem_recente"
  /** A cota do dia acabou. Não é recusa da PESSOA — é do dia. */
  | "cota_esgotada";

/** Um prospect, com o contexto que o chamador buscou no banco. */
export interface CandidatoAoDisparo {
  id: string;
  nome: string;
  telefone_normalizado: string | null;
  do_not_contact: boolean;
  bloqueado: boolean;
  whatsapp_potencial: boolean;
  status_comercial: string;
  contact_id: string | null;
  /** `contacts.is_blocked`, quando já há contato vinculado. */
  contatoBloqueado: boolean;
  /** `contacts.consent.marketing.declined_at`, quando já há contato vinculado. */
  consentRecusado: boolean;
  /** Existe conversa aberta para este contato. */
  conversaAberta: boolean;
  /** Houve outbound para este contato dentro do cooldown. */
  mensagemRecente: boolean;
}

export interface ParametrosDoDisparo {
  /** Cota do dia escolhida pelo operador. */
  limite: number;
  /** Quantas mensagens novas já saíram hoje nesta sessão. */
  jaEnviadosHoje: number;
  /** Intervalo mínimo entre dois envios, em ms. */
  espacoMs: number;
  /** `true` quando há `channel_sessions.status = 'WORKING'` não arquivada. */
  sessaoWorking: boolean;
}

/** Um corte, com o motivo — é o que a tela mostra para o operador entender. */
export interface Recusa {
  id: string;
  nome: string;
  motivo: MotivoDeRecusa;
}

export interface Aprovado {
  id: string;
  nome: string;
  telefone_normalizado: string;
  contact_id: string | null;
  /** Milissegundos a partir do início do disparo em que este envio parte. */
  instanteMs: number;
}

export interface PlanoDeDisparo {
  /** `false` quando não há sessão utilizável — não se envia NADA. */
  podeEnviar: boolean;
  /** Por que não dá para enviar, quando `podeEnviar` é `false`. */
  bloqueio: "sem_sessao_working" | null;
  aprovados: Aprovado[];
  recusados: Recusa[];
  /** Quantos foram recusados só porque a cota do dia acabou. */
  estouraramACota: number;
  /** Soma dos `instanteMs` do último aprovado, em ms. */
  duracaoPrevistaMs: number;
  espacoMs: number;
}

/** Motivo → rótulo. A tela mostra o rótulo, nunca o código. */
export const ROTULO_DA_RECUSA: Record<MotivoDeRecusa, string> = {
  do_not_contact: "Pediu para não ser contatado",
  bloqueado: "Bloqueado pelo operador",
  sem_telefone: "Sem telefone",
  telefone_invalido: "Telefone inválido",
  sem_whatsapp: "Não é celular com WhatsApp",
  contato_bloqueado: "Já pediu para parar (opt-out)",
  consent_recusado: "Recusa registrada",
  ja_cliente: "Já é cliente",
  conversa_ativa: "Já tem conversa aberta",
  mensagem_recente: "Recebeu mensagem recentemente",
  cota_esgotada: "Cota do dia esgotada",
};

/**
 * Valida o texto que o operador escreveu.
 *
 * Separado do planejador porque é a entrada que ERRA com mais frequência e a
 * que mais precisa de mensagem boa: "enviei 500 mensagens em branco" é o modo
 * mais rápido de queimar um número e a lista toda.
 */
export function validarMensagem(texto: string): { ok: true } | { ok: false; erro: string } {
  if (texto.trim() === "") return { ok: false, erro: "A mensagem está vazia." };
  const tamanho = [...texto.trim()].length;
  if (tamanho > TAMANHO_MAXIMO_MENSAGEM) {
    return {
      ok: false,
      erro: `A mensagem tem ${tamanho} caracteres; o limite é ${TAMANHO_MAXIMO_MENSAGEM}.`,
    };
  }
  return { ok: true };
}

/**
 * Decide quem recebe, em que ordem e em que ritmo.
 *
 * A ordem de recusa é a de "o mais duro primeiro": quem pediu para não ser
 * contatado é recusado antes de qualquer pergunta de canal, porque essa
 * recusa não é um detalhe de dado — é um não.
 */
export function planejarDisparo(
  candidatos: CandidatoAoDisparo[],
  parametros: ParametrosDoDisparo,
): PlanoDeDisparo {
  const espacoMs = Math.max(0, parametros.espacoMs);
  const limite = Math.max(0, Math.min(parametros.limite, TETO_DIARIO));
  const cotaRestante = Math.max(0, limite - parametros.jaEnviadosHoje);

  const aprovados: Aprovado[] = [];
  const recusados: Recusa[] = [];
  let estouraramACota = 0;
  let usadasNaCota = 0;

  for (const c of candidatos) {
    const recusa = motivoDaRecusa(c);
    if (recusa) {
      recusados.push({ id: c.id, nome: c.nome, motivo: recusa });
      continue;
    }
    // A cota conta só envios que ACONTECEM. Chegou no limite, a pessoa não
    // foi recusada — ela ficou para o próximo dia, e a tela precisa dizer isso
    // em vez de fingir que ela não serve.
    if (usadasNaCota >= cotaRestante) {
      estouraramACota++;
      recusados.push({ id: c.id, nome: c.nome, motivo: "cota_esgotada" });
      continue;
    }
    usadasNaCota++;
    // O telefone já foi validado por `motivoDaRecusa`; o `!` é o registro
    // disso para o type checker, não uma segunda checagem.
    aprovados.push({
      id: c.id,
      nome: c.nome,
      telefone_normalizado: c.telefone_normalizado!,
      contact_id: c.contact_id,
      instanteMs: usadasNaCota * espacoMs,
    });
  }

  return {
    podeEnviar: parametros.sessaoWorking,
    bloqueio: parametros.sessaoWorking ? null : "sem_sessao_working",
    aprovados,
    recusados,
    estouraramACota,
    duracaoPrevistaMs: usadasNaCota * espacoMs,
    espacoMs,
  };
}

/** `null` quando o candidato passa. O primeiro motivo que falha vence. */
function motivoDaRecusa(c: CandidatoAoDisparo): MotivoDeRecusa | null {
  if (c.do_not_contact) return "do_not_contact";
  if (c.bloqueado) return "bloqueado";
  // "Já é cliente" antes da canalização: mandar oferta para quem já compra é o
  // erro que mais destrói uma conta — e o número está legível na tela.
  if (c.status_comercial === "cliente") return "ja_cliente";
  if (c.contatoBloqueado) return "contato_bloqueado";
  if (c.consentRecusado) return "consent_recusado";

  if (!c.telefone_normalizado) return "sem_telefone";
  if (!/^\+\d{8,15}$/.test(c.telefone_normalizado)) return "telefone_invalido";
  // `whatsapp_potencial` é a coluna pré-computada na descoberta; a regex aqui
  // é a MESMA de `lib/prospeccao/normalizacao.ts`. Confiar só na coluna
  // deixaria passar o que alguém editou à mão no banco.
  if (!c.whatsapp_potencial || !/^55\d{2}9\d{8}$/.test(c.telefone_normalizado.replace(/\D/g, ""))) {
    return "sem_whatsapp";
  }

  if (c.conversaAberta) return "conversa_ativa";
  if (c.mensagemRecente) return "mensagem_recente";
  return null;
}
