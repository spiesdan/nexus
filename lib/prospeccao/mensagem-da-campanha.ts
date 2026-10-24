/**
 * A MENSAGEM DA CAMPANHA — o que ela É, e como os valores do modelo viram texto.
 *
 * Duas responsabilidades pequenas e puras, de propósito:
 *
 *   1. dizer o TIPO da mensagem (`texto` | `template`) sem deixar o motor
 *      adivinhar pelo conteúdo. Campanha de texto livre num canal oficial é
 *      aceita pela API e recusada na ENTREGA (131047); a declaração explícita é
 *      o que permite escolher a sessão pela capability do canal.
 *
 *   2. interpolar os valores dos slots por prospect. O operador escreve, em
 *      cada slot, texto fixo ou um token — `{{nome}}`, `{{primeiro_nome}}`,
 *      `{{cidade}}`, `{{categoria}}`. Token desconhecido fica literal (mesma
 *      regra de `lib/inbox/template-vars.ts`); token CONHECIDO sem dado vira
 *      string vazia, e o `missingSlots` do envio recusa antes de a Meta cobrar
 *      por uma mensagem quebrada.
 *
 * Nunca inventa valor de fallback. "sua região" para cidade ausente seria uma
 * promessa que ninguém escreveu — e o cliente leria como se fosse dele.
 */

export type TipoDaMensagem = "texto" | "template";

export interface DadosParaTemplate {
  nome?: string | null;
  cidade?: string | null;
  categoria?: string | null;
}

export const TOKENS_DO_PROSPECT = ["nome", "primeiro_nome", "cidade", "categoria"] as const;
export type TokenDoProspect = (typeof TOKENS_DO_PROSPECT)[number];

const TOKEN = /\{\{\s*(nome|primeiro_nome|cidade|categoria)\s*\}\}/gi;

function valorDoToken(token: string, dados: DadosParaTemplate): string | null {
  const nome = (dados.nome ?? "").trim();
  switch (token.toLowerCase()) {
    case "nome":
      return nome;
    case "primeiro_nome":
      return nome.split(/\s+/)[0] ?? "";
    case "cidade":
      return (dados.cidade ?? "").trim();
    case "categoria":
      return (dados.categoria ?? "").trim();
    default:
      return null;
  }
}

/**
 * Substitui os tokens conhecidos em CADA valor de slot. A chave do mapa é o
 * `slotKey` composto — nunca a `key` crua, que se repete entre cards.
 */
export function interpolarValoresDoTemplate(
  valores: Record<string, string>,
  dados: DadosParaTemplate,
): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(valores)) {
    saida[chave] = String(valor ?? "").replace(TOKEN, (literal, token: string) => {
      const v = valorDoToken(token, dados);
      return v === null ? literal : v;
    });
  }
  return saida;
}
