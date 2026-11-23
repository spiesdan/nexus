/**
 * AGRUPAMENTO DO CATÁLOGO — regra pura, sem banco e sem PDF.
 *
 * `catalog_products.categoria` é TEXTO LIVRE. Agrupar por igualdade literal
 * faria "Bebidas", "bebidas" e "BEBIDAS" virarem três seções e o sumário
 * mentir sobre o catálogo (o mesmo defeito medido na prospecção, onde a
 * comparação case-sensitive deixou 89 empresas de fora). Aqui a chave é
 * normalizada; o dado gravado NÃO é alterado — só o rótulo da seção é escolhido.
 *
 * O que não casa com `product_categories` é SEM CATEGORIA, mesmo tendo texto:
 * a tabela hierárquica é a lista de categorias válidas. Nenhuma sugestão de IA,
 * nenhuma atribuição automática.
 */
import { semAcento } from "@/lib/prospeccao/categoria-pt";

export interface CategoriaDoCatalogo {
  id: string;
  nome: string;
  parent_id: string | null;
  posicao: number;
  ativo: boolean;
}

export interface ProdutoDoCatalogo {
  id: string;
  codigo: string | null;
  nome: string | null;
  categoria: string | null;
  /** Caminho da foto de capa (menor posição em product_images), quando houver. */
  fotoCapa: string | null;
}

export interface SecaoDoCatalogo {
  chave: string;
  rotulo: string;
  categoriaId: string | null;
  produtos: ProdutoDoCatalogo[];
}

/** minúsculas + sem acento + trim + espaços colapsados. */
export function chaveDaCategoria(valor: string | null | undefined): string {
  return semAcento(valor ?? "").replace(/\s+/g, " ");
}

/**
 * Rótulo da seção: o mais frequente entre as variantes; empate decide pelo
 * "melhor escrito" (inicial maiúscula e nem tudo em caixa alta). Determinístico.
 */
export function rotuloDaSecao(rotulos: readonly string[]): string {
  const contagem = new Map<string, number>();
  for (const rotulo of rotulos) {
    const limpo = rotulo.trim();
    if (limpo) contagem.set(limpo, (contagem.get(limpo) ?? 0) + 1);
  }
  const pontuacao = (rotulo: string): number =>
    (rotulo[0] === rotulo[0]?.toUpperCase() && rotulo[0] !== rotulo[0]?.toLowerCase() ? 3 : 0) +
    (rotulo !== rotulo.toUpperCase() ? 2 : 0) +
    (rotulo.length > 0 ? 1 : 0);
  return [...contagem.entries()].sort(
    ([rotuloA, freqA], [rotuloB, freqB]) =>
      freqB - freqA || pontuacao(rotuloB) - pontuacao(rotuloA) || rotuloA.localeCompare(rotuloB, "pt-BR"),
  )[0]?.[0] ?? "";
}

/** Mapa chave normalizada → categoria válida (somente ativas). */
export function categoriasValidas(categorias: readonly CategoriaDoCatalogo[]): Map<string, CategoriaDoCatalogo> {
  const mapa = new Map<string, CategoriaDoCatalogo>();
  for (const categoria of categorias) {
    if (!categoria.ativo) continue;
    const chave = chaveDaCategoria(categoria.nome);
    if (chave && !mapa.has(chave)) mapa.set(chave, categoria);
  }
  return mapa;
}

/** Caminho de posições da raiz até a categoria — ordena a hierarquia sem inventar campo. */
function chaveDeOrdem(categoria: CategoriaDoCatalogo, porId: Map<string, CategoriaDoCatalogo>): number[] {
  const partes: number[] = [];
  let atual: CategoriaDoCatalogo | undefined = categoria;
  const vistos = new Set<string>();
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    partes.unshift(atual.posicao);
    atual = atual.parent_id ? porId.get(atual.parent_id) : undefined;
  }
  return partes;
}

/**
 * Ordem final das seções: a revisada pelo operador (quando presente) vale;
 * depois vem a ordem das `product_categories.posicao` (hierárquica); o que não
 * casar com a tabela cai no alfabético. Nenhuma categoria nova é criada aqui.
 */
export function ordenarChaves(
  chaves: readonly string[],
  categorias: readonly CategoriaDoCatalogo[],
  ordemRevisada: readonly string[] | null | undefined,
): string[] {
  const validas = categoriasValidas(categorias);
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const chaveDeOrdemPorChave = new Map<string, number[]>();
  for (const [chave, categoria] of validas) {
    chaveDeOrdemPorChave.set(chave, chaveDeOrdem(categoria, porId));
  }
  const comparar = (a: string, b: string): number => {
    const pa = chaveDeOrdemPorChave.get(a);
    const pb = chaveDeOrdemPorChave.get(b);
    if (pa && pb) {
      const n = Math.min(pa.length, pb.length);
      for (let i = 0; i < n; i += 1) {
        if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
      }
      if (pa.length !== pb.length) return pa.length - pb.length;
    } else if (pa) return -1;
    else if (pb) return 1;
    return a.localeCompare(b, "pt-BR");
  };
  const revisada = (ordemRevisada ?? []).map(chaveDaCategoria).filter(Boolean);
  const vistas = new Set<string>();
  const resultado: string[] = [];
  for (const chave of revisada) {
    if (chaves.includes(chave) && !vistas.has(chave)) {
      resultado.push(chave);
      vistas.add(chave);
    }
  }
  for (const chave of [...chaves].sort(comparar)) {
    if (!vistas.has(chave)) {
      resultado.push(chave);
      vistas.add(chave);
    }
  }
  return resultado;
}

/** Agrupa por chave normalizada, preservando o texto original em `rotulo`. */
export function agruparProdutos(
  produtos: readonly ProdutoDoCatalogo[],
  categorias: readonly CategoriaDoCatalogo[],
  ordemRevisada?: readonly string[] | null,
): SecaoDoCatalogo[] {
  const validas = categoriasValidas(categorias);
  const porChave = new Map<string, { rotulos: string[]; produtos: ProdutoDoCatalogo[] }>();
  for (const produto of produtos) {
    const chave = chaveDaCategoria(produto.categoria);
    if (!chave) continue;
    const grupo = porChave.get(chave) ?? { rotulos: [], produtos: [] };
    grupo.rotulos.push(produto.categoria?.trim() ?? "");
    grupo.produtos.push(produto);
    porChave.set(chave, grupo);
  }
  return ordenarChaves([...porChave.keys()], categorias, ordemRevisada).map((chave) => {
    const grupo = porChave.get(chave)!;
    return {
      chave,
      rotulo: rotuloDaSecao(grupo.rotulos),
      categoriaId: validas.get(chave)?.id ?? null,
      produtos: grupo.produtos,
    };
  });
}

export interface PendenciaDoCatalogo {
  semCategoria: Array<{ produtoId: string; nome: string; categoria: string }>;
  semDados: Array<{ produtoId: string; motivos: string[] }>;
}

/** Bloqueia a geração com a lista do que falta — nunca esconde, nunca corrige sozinho. */
export function pendenciasDaSelecao(
  produtos: readonly ProdutoDoCatalogo[],
  categorias: readonly CategoriaDoCatalogo[],
): PendenciaDoCatalogo {
  const validas = categoriasValidas(categorias);
  const semCategoria: PendenciaDoCatalogo["semCategoria"] = [];
  const semDados: PendenciaDoCatalogo["semDados"] = [];
  for (const produto of produtos) {
    const chave = chaveDaCategoria(produto.categoria);
    if (!chave || !validas.has(chave)) {
      semCategoria.push({
        produtoId: produto.id,
        nome: produto.nome ?? "(sem nome)",
        categoria: produto.categoria?.trim() || "(vazia)",
      });
    }
    const motivos: string[] = [];
    if (!produto.nome?.trim()) motivos.push("sem nome");
    if (!produto.codigo?.trim()) motivos.push("sem código");
    if (!produto.fotoCapa?.trim()) motivos.push("sem foto");
    if (motivos.length > 0) semDados.push({ produtoId: produto.id, motivos });
  }
  return { semCategoria, semDados };
}

export function podeGerar(pendencias: PendenciaDoCatalogo): boolean {
  return pendencias.semCategoria.length === 0 && pendencias.semDados.length === 0;
}
