/**
 * O NÚMERO DA CAMPANHA — a escolha do operador, não um detalhe de transporte.
 *
 * A campanha por região nasce com o número escolhido na tela (0303). Este módulo
 * responde às duas perguntas da borda e do motor:
 *
 *   - "quais números a tela pode oferecer para uma campanha de TEXTO?"
 *   - "o número que o operador escolheu serve, e é desta organização?"
 *
 * A regra de qual canal aceita texto livre fora da janela de 24h NÃO mora aqui:
 * é `providerAceitaTipo` (`lib/prospeccao/canal-da-campanha.ts`), que lê a
 * matriz de capabilities. Número oficial não entra porque a matriz diz que ele
 * exige template — e não porque este arquivo saiba o nome do provider.
 *
 * Nenhum nome de provider atravessa a resposta da API: a tela mostra o rótulo e
 * o telefone do número, não o encanamento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { providerAceitaTipo } from "./canal-da-campanha";
import type { TipoDaMensagem } from "./mensagem-da-campanha";

export interface NumeroDaCampanha {
  id: string;
  /** O nome que o operador deu ao número; cai no telefone quando não há. */
  rotulo: string;
  telefone: string | null;
}

interface SessaoBruta {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  provider: string | null;
  status?: string | null;
  archived_at?: string | null;
}

function comoNumero(sessao: SessaoBruta): NumeroDaCampanha {
  const telefone = (sessao.phone_number ?? "").trim() || null;
  return {
    id: sessao.id,
    rotulo: (sessao.display_name ?? "").trim() || telefone || "Número sem nome",
    telefone,
  };
}

/**
 * Os números WORKING que aceitam o tipo da campanha, na ordem de criação.
 *
 * Sessão arquivada ou parada não aparece: oferecer um número desconectado é
 * prometer um envio que o tick vai pausar no primeiro minuto.
 */
export async function listarNumerosDaCampanha(
  supabase: SupabaseClient,
  organizationId: string,
  tipo: TipoDaMensagem,
): Promise<NumeroDaCampanha[]> {
  const { data, error } = await supabase
    .from("channel_sessions")
    .select("id, display_name, phone_number, provider")
    .eq("organization_id", organizationId)
    .eq("status", "WORKING")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`numeros_indisponiveis: ${error.message}`);

  return ((data ?? []) as unknown as SessaoBruta[])
    .filter((s) => providerAceitaTipo(s.provider, tipo))
    .map(comoNumero);
}

export type MotivoDeNumeroInvalido =
  | "nao_encontrada"
  | "desconectado"
  | "capability";

export type VereditoDoNumero =
  | { ok: true; numero: NumeroDaCampanha }
  | { ok: false; motivo: MotivoDeNumeroInvalido };

/**
 * O número escolhido é desta organização, está WORKING e aceita o tipo?
 *
 * Fail-closed: não existir, estar parado ou não aceitar o tipo são três recusas
 * diferentes — cada uma com o seu próximo passo na tela.
 */
export async function validarNumeroDaCampanha(
  supabase: SupabaseClient,
  organizationId: string,
  sessionId: string,
  tipo: TipoDaMensagem,
): Promise<VereditoDoNumero> {
  const { data, error } = await supabase
    .from("channel_sessions")
    .select("id, display_name, phone_number, provider, status, archived_at")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`numeros_indisponiveis: ${error.message}`);
  if (!data) return { ok: false, motivo: "nao_encontrada" };

  const sessao = data as unknown as SessaoBruta;
  if (sessao.status !== "WORKING" || sessao.archived_at) {
    return { ok: false, motivo: "desconectado" };
  }
  if (!providerAceitaTipo(sessao.provider, tipo)) {
    return { ok: false, motivo: "capability" };
  }
  return { ok: true, numero: comoNumero(sessao) };
}

/** A mensagem da recusa — uma por motivo, porque cada uma tem um conserto. */
export function mensagemDoNumeroInvalido(motivo: MotivoDeNumeroInvalido): string {
  switch (motivo) {
    case "nao_encontrada":
      return "O número escolhido não está nesta organização.";
    case "desconectado":
      return "O número escolhido não está conectado. Conecte-o em Conexões ou escolha outro número.";
    case "capability":
      return "O número escolhido é oficial e não pode enviar texto livre fora da janela de 24h. Escolha um número por QR (não oficial).";
  }
}
