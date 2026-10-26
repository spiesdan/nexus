/**
 * DISPARO EM LOTE para prospects — o PLANEJADOR. Função pura: nada aqui fala
 * com banco, com o canal ou com o relógio do sistema (o instante chega por
 * parâmetro). O chamador monta o contexto, esta função decide.
 *
 * ═══ POR QUE ISTO NÃO É "POSTAR A MENSAGEM EM 500 PONTOS" ═══════════════
 *
 * A mensagem é a mesma para todos — e é o que funciona comercialmente (a
 * pessoa responde "oi" e a conversa começa). Mas é exatamente o padrão que
 * derruba um número de WhatsApp: dezenas de mensagens **idênticas** em
 * sequência, para números que nunca falaram com a gente, em poucos minutos.
 * O próprio repositório já sabe disso — o gate `spinning` da cadeia
 * `before-send` existe para pegar "mensagem idêntica em massa no número"
 * (`lib/agent-engine/guardrails/before-send.ts`).
 *
 * Por isso o planejador devolve o **plano com ritmo**: cota por dia,
 * espaçamento entre envios, e — desde o anti-ban — a **rotação de variações**
 * de texto (1→2→3→1), que é o que impede a mesma string de sair 50 vezes
 * seguidas. Um disparo sem isso não é mais rápido: é mais curto. Ban em dias,
 * e o número não volta.
 *
 * As três coisas andam juntas de propósito. Rotação sem espaçamento continua
 * rajada (o WhatsApp vê 3 padrões repetindo rápido); espaçamento sem rotação
 * continua string idêntica. O par está em `mensagemDaVez` e no `mensagem_indice`
 * do plano.
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

import { KNOB_BOUNDS } from "@/lib/agent-engine/pacing/defaults";

/** Teto de mensagens novas por dia. Acima disso o número queima. */
export const TETO_DIARIO = 500;

/** O que a tela oferece por padrão: bem abaixo do teto, e de propósito. */
export const LIMITE_PADRAO_DIA = 50;

/** Menor intervalo entre dois envios, em ms. 1,2s é o que a automação usa. */
export const ESPACO_PADRAO_MS = 1200;

/**
 * O ritmo ANTI-BAN: uma mensagem por minuto.
 *
 * 1,2s é o espaçamento entre duas mensagens de uma CONVERSA (a automação). Um
 * disparo frio em massa é outra coisa: dezenas de mensagens idênticas para
 * quem nunca falou com a gente, em poucos minutos, é o padrão que derruba um
 * número. Com 60s, 50 mensagens levam 50 minutos — e é isso que se quer
 * quando o número é o ativo da empresa. Este é o padrão da TELA; a API
 * aceita qualquer valor até `ESPACO_MAXIMO_MS`.
 */
export const ESPACO_ANTIBAN_MS = 60_000;

/**
 * O TETO do intervalo entre duas mensagens: 10 minutos.
 *
 * O motivo de existir é o inverso do motivo do piso. O piso protege o número
 * de uma rajada; o teto protege a CAMPANHA de virar uma goteira que nunca
 * termina — e protege a operação de digitar "2" querendo dizer "2 minutos" e
 * receber 2 segundos. Entre 60s e 10min o operador escolhe o ritmo que o
 * aquecimento do número aguenta; acima disso não é mais um disparo, é um
 * envio manual.
 *
 * A fonte do número é o MESMO teto que o Console de knobs aceita
 * (`KNOB_BOUNDS.intervalMaxMs`) — duas constantes para a mesma pergunta
 * divergem, e a tela prometeria um valor que a outra ponta recusa.
 */
export const ESPACO_MAXIMO_MS = KNOB_BOUNDS.intervalMaxMs;

/** Acima disto o WhatsApp costuma truncar, e o texto já não é uma conversa. */
export const TAMANHO_MAXIMO_MENSAGEM = 1000;

/**
 * Quantas VARIAÇÕES de texto um disparo aceita. Acima disso não é variação de
 * uma mensagem — é campanha, e campanha tem outra tela.
 */
export const MENSAGENS_POR_DISPARO_MAX = 5;

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
  /** A empresa já foi reservada por outra campanha (0277). */
  | "em_outra_campanha"
  /** A categoria da empresa está marcada para revisão humana (0277). */
  | "categoria_revisar"
  /** A categoria efetiva não é a da campanha (0277). */
  | "categoria_incompativel"
  /** O ledger global já tem envio desta campanha para a empresa (0277). */
  | "ja_enviado"
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
  /** Já está em `prospect_ids`/`contato_ids` de outra campanha (0277). */
  emOutraCampanha?: boolean;
  /** `categoria_revisar` da empresa — não mandar sem revisão humana. */
  categoriaRevisar?: boolean;
  /** A categoria efetiva não combina com a campanha. */
  categoriaIncompativel?: boolean;
  /** O ledger global já tem envio desta campanha para esta empresa. */
  jaEnviado?: boolean;
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
  /**
   * Quantas variações de texto o disparo tem. Ausente = 1 (a mensagem única
   * de sempre). É o que faz a rotação 1→2→3→1 existir no plano.
   */
  quantidadeDeMensagens?: number;
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
  /**
   * Qual variação de texto este envio leva (base 0). Sem variações, é sempre
   * 0. Vem do PLANO, não do envio, para a tela poder mostrar a rotação antes
   * de qualquer mensagem sair.
   */
  mensagem_indice: number;
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
  /** Quantas variações de texto estão em rotação (1 quando é texto único). */
  variacoes: number;
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
  em_outra_campanha: "Já está em outra campanha",
  categoria_revisar: "Categoria a revisar",
  categoria_incompativel: "Fora da categoria da campanha",
  ja_enviado: "Já recebeu esta campanha",
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
 * A mensagem da vez: a 1ª no primeiro envio, a 2ª no segundo, a 3ª no
 * terceiro — e volta à 1ª quando as variações acabam (1→2→3→1→2→3…).
 *
 * Por que a rotação, e não a mesma mensagem para todos: mensagem idêntica em
 * massa é exatamente o padrão que o WhatsApp reconhece como spam
 * (`lib/agent-engine/guardrails/before-send.ts`, gate `spinning`). Alternar
 * três textos não esconde o disparo — só deixa de mandar 50 vezes a MESMA
 * string, que é o que o filtro procura.
 *
 * Função pura de propósito: é a regra inteira da rotação, e a única coisa que
 * o teste precisa exercitar. `indice` negativo ou maior que a lista não
 * quebra — o resto da divisão dá a volta.
 */
export function mensagemDaVez(mensagens: readonly string[], indice: number): string {
  if (mensagens.length === 0) return "";
  const n = mensagens.length;
  const i = ((Math.trunc(indice) % n) + n) % n;
  return mensagens[i] ?? mensagens[0] ?? "";
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
  // O piso é 1 (mensagem única) e o teto é o que a tela oferece. Um número
  // inválido que viesse do chamador não pode zerar o divisor da rotação.
  const variacoes = Math.max(
    1,
    Math.min(Math.trunc(parametros.quantidadeDeMensagens ?? 1) || 1, MENSAGENS_POR_DISPARO_MAX),
  );

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
      // A rotação anda com o ENVIO, não com o candidato: quem é recusado não
      // consome uma volta, senão um opt-out no meio trocaria a mensagem de
      // quem vem depois sem nada ter saído.
      mensagem_indice: (usadasNaCota - 1) % variacoes,
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
    variacoes,
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
  // 0277 — a exclusividade da campanha e a categoria vêm antes do canal: não
  // adianta o telefone ser bom se a empresa não pode entrar nesta campanha.
  if (c.emOutraCampanha) return "em_outra_campanha";
  if (c.categoriaRevisar) return "categoria_revisar";
  if (c.categoriaIncompativel) return "categoria_incompativel";
  if (c.jaEnviado) return "ja_enviado";

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
