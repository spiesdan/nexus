/**
 * FOTOS DOS PRODUTOS QUE ESTÃO NA TELA — para o SERVIDOR montar o HTML.
 *
 * Existe porque a coluna de fotos chegava vazia e só aparecia depois: o
 * `ProdutosClient` buscava as fotos num efeito, DEPOIS da página já estar
 * desenhada. O usuário via a lista inteira sem foto e, segundos depois, as
 * imagens apareciam — um piscar que ele descreveu exatamente assim.
 *
 * Trazer as fotos para o servidor resolve na raiz: o HTML inicial já vem com
 * elas, e a primeira pintura mostra a coluna preenchida. Nenhuma requisição a
 * menos, nenhuma espera a menos — é o mesmo lote de sempre, feito antes de a
 * página existir.
 *
 * Regras que NÃO são negociáveis aqui:
 *  - o filtro é o MESMO `organization_id` de quem pede. A rota individual já
 *    filtra por ele; este caminho não pode ser um atalho que abre o que ela
 *    esconde;
 *  - as ids vão em FATIAS de 100. Com 500 ids a URL do PostgREST passa de 19 KB
 *    e ele responde `414 URI too long` (medido na VPS) — foi um 500 na tela
 *    exatamente por causa disso;
 *  - falha aqui NÃO derruba a página. A lista de produtos é o essencial; as
 *    fotos são enfeite. Uma foto que não carrega é melhor do que um catálogo
 *    em branco.
 */
import { createClient } from "@/lib/supabase/server";
import { urlDeExibicaoDaFoto } from "@/lib/storage/foto";

/** Acima disto a URL do PostgREST estoura — ver o comentário acima. */
const FATIA = 100;

/**
 * O MESMO formato de `Foto`, em `_fotos.tsx` — importado, não duplicado. Dois
 * nomes para a mesma forma é o começo de uma divergência em que o servidor
 * manda um campo e o client lê outro.
 */
import type { Foto as FotoDoProduto } from "@/app/app/products/_fotos";

export type { FotoDoProduto };

/**
 * Mapa `product_id -> fotos`, pronto para virar `fotosIniciais` de cada linha.
 * Devolve `{}` quando qualquer coisa falha: quem chama só repassa ao client, e
 * ele sabe buscar a si mesmo se não tiver recebido nada.
 */
export async function fotosDosProdutos(
  orgId: string,
  produtoIds: string[],
): Promise<Record<string, FotoDoProduto[]>> {
  if (produtoIds.length === 0) return {};

  try {
    const supabase = await createClient();
    const mapa: Record<string, FotoDoProduto[]> = {};
    for (const id of produtoIds) mapa[id] = [];

    const fatias: string[][] = [];
    for (let i = 0; i < produtoIds.length; i += FATIA) {
      fatias.push(produtoIds.slice(i, i + FATIA));
    }

    const respostas = await Promise.all(
      fatias.map((fatia) =>
        supabase
          .from("product_images")
          .select("id, product_id, storage_path, posicao")
          .eq("organization_id", orgId)
          .in("product_id", fatia)
          .order("posicao"),
      ),
    );

    // Uma fatia que falha não cancela as outras: o produto dela fica sem foto,
    // que é o desfecho justo — o resto da lista continua inteira.
    for (const resposta of respostas) {
      const erro = resposta.error;
      if (erro) continue;
      for (const f of (resposta.data ?? []) as unknown as {
        id: string;
        product_id: string;
        storage_path: string;
        posicao: number;
      }[]) {
        mapa[f.product_id]?.push({
          id: f.id,
          url: urlDeExibicaoDaFoto(f.storage_path),
          posicao: f.posicao,
        });
      }
    }
    return mapa;
  } catch {
    return {};
  }
}
