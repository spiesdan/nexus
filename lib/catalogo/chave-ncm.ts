/**
 * DE ONDE VEM A CHAVE DO PASSE DE NCM POR IA.
 *
 * ## O defeito que este arquivo existe para acabar
 *
 * A rota `POST /api/v1/products/ncm-completar` lia `env.GEMINI_API_KEY` e mais
 * nada. Ou seja: **cadastrar a chave do Google pela tela de Credenciais não
 * habilitava o passe de IA.** A chave ia ficar validada, com o nome bonito na
 * tela, e o recurso continuaria desligado — o mesmo defeito que
 * `lib/ai/embeddings/chave.ts` já resolveu para a OpenAI (lá, o sintoma era
 * `skipped: openai_key_missing` silencioso).
 *
 * Isto é grave porque o produto PROMETE o contrário: a tela de Credenciais
 * oferece "google" como provedor, e o botão "Completar NCM" fala em IA. Tela
 * que oferece e motor que ignora é o anti-pattern que este repo mais persegue.
 *
 * ## A escada, do mais específico ao mais genérico
 *
 *  1. **Credencial Google da organização** (`ai_provider_credentials`, ativa e
 *     validada). É o degrau que faz "cadastrei a chave na tela e funcionou"
 *     virar verdade sem ninguém precisar editar o `.env` da VPS.
 *  2. **Chave da instalação** (`GEMINI_API_KEY`). O que o operador pode ter
 *     deixado no servidor.
 *  3. Nada — e "nada" é uma resposta legítima: o lote usa só a regra e o resto
 *     vai para revisão. Nunca "aplica qualquer coisa".
 *
 * A ordem põe a BYOK **acima** do env pelo mesmo motivo de
 * `lib/ai/embeddings/chave.ts`: quem cadastrou a chave pela tela é a escolha
 * mais específica e mais recente da，安装 é o padrão genérico.
 *
 * ## A origem volta junto com a chave
 *
 * Não é enfeite: é o que permite a tela responder *"usando a chave **produc**
 * porque…"* em vez de deixar o dono do negócio adivinhar por que o passe de IA
 * não liga.
 */
import { byteaToBuffer, decryptKey } from "@/lib/crypto/aes_gcm";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export type OrigemDaChaveDeNcm = "credencial_da_organizacao" | "chave_da_instalacao";

export const EXPLICACAO_DA_ORIGEM: Record<OrigemDaChaveDeNcm, string> = {
  credencial_da_organizacao: "Usando a chave Google cadastrada em Credenciais.",
  chave_da_instalacao: "Usando a chave que veio na instalação.",
};

export interface ChaveDeNcm {
  /** Plaintext. Vive só no escopo de quem chamou — nunca logada nem persistida. */
  apiKey: string;
  modelo: string;
  origem: OrigemDaChaveDeNcm;
  /** Rótulo da credencial, quando houver — a tela mostra qual chave está valendo. */
  rotulo: string | null;
  /** Mais de uma credencial Google ativa: o desempate é determinístico e alguém precisa saber. */
  avisos: string[];
}

/**
 * Resolve a chave do passe de IA do NCM, ou `null` quando não há nenhuma.
 *
 * `organizationId` é obrigatório: um resolvedor que aceitasse organização
 * opcional acabaria chamado sem ela justamente no caminho que mais importa,
 * aplicando a configuração de ninguém.
 */
export async function resolverChaveDeNcm(organizationId: string): Promise<ChaveDeNcm | null> {
  const avisos: string[] = [];

  // 1 · A credencial Google da organização.
  const credencial = await credencialGoogleDaOrganizacao(organizationId);
  if (credencial) {
    if (credencial.quantas > 1) {
      avisos.push(
        `Há ${credencial.quantas} chaves Google ativas nesta organização; o passe de NCM está usando ` +
          `a mais antiga ("${credencial.rotulo}").`,
      );
    }
    return {
      apiKey: credencial.apiKey,
      modelo: env.GEMINI_MODEL || "gemini-2.0-flash",
      origem: "credencial_da_organizacao",
      rotulo: credencial.rotulo,
      avisos,
    };
  }

  // 2 · A chave da instalação.
  if (env.GEMINI_API_KEY) {
    return {
      apiKey: env.GEMINI_API_KEY,
      modelo: env.GEMINI_MODEL || "gemini-2.0-flash",
      origem: "chave_da_instalacao",
      rotulo: null,
      avisos,
    };
  }

  return null;
}

/**
 * A credencial Google ativa e validada da organização.
 *
 * Desempate DETERMINÍSTICO pela mais antiga: com duas chaves e nenhuma escolha,
 * "a mais recente" faria o comportamento mudar sozinho no dia em que alguém
 * cadastrasse outra — e o dono não teria mudado nada para ver o resultado
 * diferente.
 */
async function credencialGoogleDaOrganizacao(
  organizationId: string,
): Promise<{ apiKey: string; rotulo: string; quantas: number } | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ai_provider_credentials")
      .select("id, label, api_key_encrypted, api_key_iv, api_key_tag")
      .eq("organization_id", organizationId)
      .eq("provider", "google")
      .eq("is_active", true)
      .not("validated_at", "is", null)
      .order("created_at", { ascending: true });

    const linhas = (data ?? []) as Array<{
      id: string;
      label: string;
      api_key_encrypted: unknown;
      api_key_iv: unknown;
      api_key_tag: unknown;
    }>;
    const primeira = linhas[0];
    if (!primeira) return null;

    return {
      apiKey: decryptKey({
        ciphertext: byteaToBuffer(primeira.api_key_encrypted),
        iv: byteaToBuffer(primeira.api_key_iv),
        tag: byteaToBuffer(primeira.api_key_tag),
      }),
      rotulo: primeira.label,
      quantas: linhas.length,
    };
  } catch {
    // Sem detalhe no log: qualquer eco aqui corre o risco de carregar material
    // da credencial.
    return null;
  }
}
