/**
 * TRANSMISSÃO DE EVENTOS FISCAIS JÁ REGISTRADOS — o lado que tem banco.
 *
 * O evento nasce local e só vira "transmitida" quando a SEFAZ devolve
 * protocolo. Sem sidecar/certificado ele continua onde está e a função
 * devolve `motivo` (o operador vê por que nada foi ao fisco — nada finge
 * transmissão). Usada pela rota de criação E pela de retransmissão: mesmo
 * caminho, mesma resposta, para a sequência da SEFAZ não mudar entre as duas.
 */

import { createAdminClient } from "@/lib/supabase/admin";

import {
  carregarContextoSped,
  motivoDeNaoTransmitir,
  montarMensagemCarta,
  transmitirCartaCorrecao,
  transmitirInutilizacao,
} from "./eventos";

const COLUNAS_EVENTO = "id, tipo, status, mensagem, protocolo, created_at";
const COLUNAS_INUTILIZACAO =
  "id, serie, numero_inicial, numero_final, motivo, ambiente, status, sefaz_protocolo, sefaz_xmotivo, created_at";

export interface EventoCarta {
  id: string;
  tipo: string;
  status: string;
  mensagem: string;
  protocolo: string | null;
  created_at: string;
}

export interface InutilizacaoLinha {
  id: string;
  serie: string;
  numero_inicial: number;
  numero_final: number;
  motivo: string;
  ambiente: string;
  status: string;
  sefaz_protocolo: string | null;
  sefaz_xmotivo: string | null;
  created_at: string;
}

function motivoDaRecusa(cstat: string | null, xmotivo: string | null): string {
  if (cstat) return `SEFAZ [${cstat}]: ${xmotivo ?? "sem motivo"}`;
  return xmotivo ?? "Falha sem motivo.";
}

/** Transmite a carta já registrada; grava status/protocolo/motivo no evento. */
export async function transmitirCartaRegistrada(
  orgId: string,
  eventoId: string,
  dados: { chave: string; correcao: string; sequencia: number },
): Promise<{ evento: EventoCarta | null; motivo?: string }> {
  const contexto = await carregarContextoSped(orgId);
  const bloqueio = contexto ? motivoDeNaoTransmitir(contexto) : "Sem configuração fiscal para a organização.";

  let status = "registrada_local";
  let protocolo: string | null = null;
  let motivo: string | null = bloqueio;
  if (contexto && !bloqueio) {
    const r = await transmitirCartaCorrecao(contexto, dados);
    status = r.ok ? "transmitida" : "erro";
    protocolo = r.protocolo;
    motivo = r.ok ? null : motivoDaRecusa(r.cstat, r.xmotivo);
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fiscal_events")
    .update({
      status,
      protocolo,
      mensagem: montarMensagemCarta(dados.sequencia, dados.correcao, motivo),
    })
    .eq("id", eventoId)
    .eq("organization_id", orgId)
    .select(COLUNAS_EVENTO)
    .single();
  if (error || !data) {
    return { evento: null, motivo: motivo ?? "Erro ao gravar o retorno da SEFAZ." };
  }
  return { evento: data as unknown as EventoCarta, motivo: motivo ?? undefined };
}

export interface FaixaInutilizar {
  serie: string;
  numero_inicial: number;
  numero_final: number;
  justificativa: string;
  ano?: string | null;
  modelo?: string | null;
}

/**
 * O desfecho de uma transmissão de inutilização.
 *
 * O sucesso é cStat **102** ("Inutilização de número homologado"). E **563**
 * ("Já existe pedido de Inutilização com a mesma faixa") também encerra: é a
 * resposta da SEFAZ ao reenvio de uma faixa que JÁ foi homologada — tratá-la
 * como erro deixaria a tela oferecendo "Retransmitir" para sempre e esconderia
 * o fato de o número estar inutilizado.
 *
 * Medido em 05/11/2026 nesta instalação: as três faixas saíram com 102 e o
 * sidecar só conhecia 1002 (código que não existe nesse serviço); o reenvio
 * devolveu 563 — a prova de que a homologação tinha acontecido.
 */
export function desfechoDaInutilizacao(
  retorno: { ok: boolean; cstat: string | null; protocolo: string | null },
  motivoDaFalha: string | null,
): { status: "transmitida" | "erro"; protocolo: string | null; sucesso: boolean; xmotivo: string | null } {
  if (retorno.ok) {
    return { status: "transmitida", protocolo: retorno.protocolo, sucesso: true, xmotivo: null };
  }
  if (retorno.cstat === "563") {
    return {
      status: "transmitida",
      protocolo: retorno.protocolo,
      sucesso: true,
      xmotivo: `SEFAZ [563]: ${motivoDaFalha ?? "já existe pedido de inutilização"} — faixa já homologada`,
    };
  }
  return { status: "erro", protocolo: retorno.protocolo, sucesso: false, xmotivo: motivoDaFalha };
}

/**
 * Transmite a faixa já registrada; grava status/protocolo/xmotivo.
 * Quando não dá para transmitir, o status continua "registrada" e só o
 * `sefaz_xmotivo` explica o motivo — a linha continua honesta.
 */
export async function transmitirInutilizacaoRegistrada(
  orgId: string,
  id: string,
  faixa: FaixaInutilizar,
): Promise<{ linha: InutilizacaoLinha | null; motivo?: string }> {
  const contexto = await carregarContextoSped(orgId);
  const bloqueio = contexto ? motivoDeNaoTransmitir(contexto) : "Sem configuração fiscal para a organização.";

  let status = "registrada";
  let protocolo: string | null = null;
  let xmotivo: string | null = bloqueio;
  let sucesso = false;
  if (contexto && !bloqueio) {
    const r = await transmitirInutilizacao(contexto, faixa);
    const desfecho = desfechoDaInutilizacao(r, motivoDaRecusa(r.cstat, r.xmotivo));
    status = desfecho.status;
    protocolo = desfecho.protocolo;
    sucesso = desfecho.sucesso;
    // No sucesso com protocolo, a SEFAZ devolve o xMotivo de homologação; no
    // 563, o texto que explica por que não há protocolo novo.
    xmotivo = desfecho.status === "transmitida" ? (desfecho.xmotivo ?? r.xmotivo ?? null) : desfecho.xmotivo;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fiscal_inutilizacoes")
    .update({ status, sefaz_protocolo: protocolo, sefaz_xmotivo: xmotivo })
    .eq("id", id)
    .eq("organization_id", orgId)
    .select(COLUNAS_INUTILIZACAO)
    .single();
  if (error || !data) {
    return { linha: null, motivo: xmotivo ?? "Erro ao gravar o retorno da SEFAZ." };
  }
  return { linha: data as unknown as InutilizacaoLinha, motivo: sucesso ? undefined : xmotivo ?? undefined };
}
