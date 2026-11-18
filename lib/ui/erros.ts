/**
 * A MENSAGEM DE ERRO QUE VAI PARA A TELA — nunca a do navegador.
 *
 * ─── O DEFEITO (medido em 18/11/2026, lendo as telas do 5.6) ──────────────
 *
 * As telas de estoque, compras e recebimento faziam:
 *
 *     setErro(e instanceof Error ? e.message : "Erro ao carregar o estoque.")
 *
 * Em erro de rede — offline, DNS, Wi-Fi sem internet —, `apiClient` repassa o
 * `TypeError` do `fetch` depois de três tentativas, e a tela mostrava
 * **"Failed to fetch"** em inglês, no lugar do texto que explica o que houve.
 * Em erro de API, mostrava o `message` cru do servidor, que pode ser técnico.
 *
 * O toast já era tratado (`showApiError`); o estado embutido da tabela, não. É
 * a mesma classe da V-22/V-43: a tela afirma uma coisa quando o problema é
 * outro ("não há nada" quando era a rede).
 *
 * ─── A REGRA ──────────────────────────────────────────────────────────────
 *
 * - erro de REDE (ou navegador offline) → uma frase em português que manda
 *   verificar a conexão e tentar de novo;
 * - `ApiError` → o texto do servidor (as rotas escrevem em pt-BR, e o código é
 *   a chave da tradução); se vier vazio, o padrão da tela;
 * - `Error` comum → a mensagem, porque é a validação do próprio produto
 *   ("Adicione ao menos um item.");
 * - qualquer outra coisa → o padrão da tela.
 */
import { ApiError } from "@/lib/api/types";

export const SEM_CONEXAO =
  "Sem conexão. Verifique a rede e tente de novo — o que já estava na tela continua aqui.";

const ASSINATURA_DE_REDE =
  /failed to fetch|load failed|networkerror|network request failed|err_internet_disconnected|err_network/i;

/** `true` quando o erro é de transporte, não de regra. */
export function ehErroDeRede(erro: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (erro instanceof ApiError) return false;
  if (erro instanceof TypeError) return true;
  return erro instanceof Error && ASSINATURA_DE_REDE.test(erro.message);
}

/**
 * Texto para o estado de erro da tela. `padrao` é o que a tela sabe dizer
 * ("Erro ao carregar o estoque.") — usado quando não há nada melhor.
 */
export function mensagemDeErro(erro: unknown, padrao: string): string {
  if (ehErroDeRede(erro)) return SEM_CONEXAO;
  if (erro instanceof ApiError) return erro.message?.trim() || padrao;
  if (erro instanceof Error) return erro.message?.trim() || padrao;
  return padrao;
}
