/**
 * BUSCAR O NCM PELO NOME DO PRODUTO — a sugestão que o formulário aplica.
 *
 * A fonte é a tabela IBPT da própria organização (`fiscal_ibpt`, migração
 * 0254): CSV oficial, com o NCM e a descrição da posição. Ninguém inventa
 * código aqui — a busca só RECONHECE o que está na tabela que o operador
 * importou. Sem tabela importada, sem sugestão (a rota responde `sugestao:
 * null`, não erro: para a tela, "sem dado" é normal).
 *
 * ## A mesma régua da busca do catálogo, com duas adaptações
 *
 * O motor é `pontuar`/`tokenizar` de `lib/catalogo/busca.ts` — medido para
 * achar produto no catálogo ("ifone 15" → iPhone 15). Aqui ele mede a
 * descrição oficial do NCM contra o nome do produto, e duas regras daquela
 * busca mudam de sentido:
 *
 *  1. **NÚMERO NÃO FILTRA AQUI.** Na busca do catálogo o número é identidade
 *     (128GB nunca pode virar 256GB). No NCM, "5.3" do "Fone Bluetooth 5.3"
 *     não está na descrição de posição nenhuma — o filtro duro eliminaria
 *     quase todo candidato real. E quando o número existe em qualquer texto
 *     ("9" de "Pilha 9V"), ele CASA em qualquer descrição que contenha "9"
 *     e vira falso positivo. Número de modelo não diz matéria: entra como
 *     palavra ou não entra. Restam só os tokens de palavra.
 *  2. **SÓ NÚMERO NÃO É SINAL.** Nome sem nenhuma palavra ("9V", "500ml"
 *     sozinho) volta sem candidato — ver item 1.
 *
 * ## Confiança é parâmetro, não regra fiscal
 *
 * `CONFIANCA_MINIMA` é o piso para preencher o campo sozinho — INFERIDO, não
 * tem regra escrita: a decisão de PREENCHER é do operador (a tela mostra a
 * descrição oficial ao lado e ele salva), esta constante só decide o que a
 * busca se atura a sugerir. Mexer nela é mexer em quanto casamento fraco
 * passa — mude com teste.
 */
import { pontuar, tokenizar } from "@/lib/catalogo/busca";

/** Uma linha candidata da tabela IBPT (org já filtrada pela rota). */
export interface LinhaIbptCandidata {
  codigo: string;
  ex: string;
  descricao: string | null;
}

export interface CandidatoDeNcm {
  ncm: string;
  ex: string;
  descricao: string | null;
  /** Nota 0–1 do `pontuar` (1 = casamento exato palavra a palavra). */
  confianca: number;
}

/**
 * Piso de nota para sugerir. INFERIDO — 0.6 pede, em média, dois terços de
 * qualidade por palavra (um exato + um por prefixo passa; um só fraco não).
 */
export const CONFIANCA_MINIMA = 0.6;

/**
 * Termos que a rota usa para pré-filtrar no banco (ILIKE), da mais
 * distintiva (mais longa) para a menos. Só letras/números, vindo de
 * `normalizar` — é o que torna o valor seguro dentro de `.or()` do PostgREST.
 */
export function termosParaFiltrar(nomeDoProduto: string, limite = 3): string[] {
  return [...tokenizar(nomeDoProduto).palavras]
    .sort((a, b) => b.length - a.length)
    .slice(0, limite);
}

/**
 * Candidatos ordenados: nota maior primeiro; empate leva o NCM SEM exceção
 * (`ex` vazio) na frente, porque a exceção TIPI muda a classificação e o
 * código "puro" é o que se espera quando não se pediu nada especial.
 *
 * Um NCM aparece UMA vez — o IBPT publica várias linhas por código (uma por
 * exceção e, no arquivo estadual, por esfera).
 */
export function candidatosDeNcm(
  linhas: LinhaIbptCandidata[],
  nomeDoProduto: string,
  limite = 3,
): CandidatoDeNcm[] {
  const { palavras } = tokenizar(nomeDoProduto);
  if (palavras.length === 0) return [];
  const tokens = { palavras, numeros: [] as string[] };

  const pontuados: CandidatoDeNcm[] = [];
  for (const linha of linhas) {
    if (!linha.descricao) continue;
    const nota = pontuar({ nome: linha.descricao, codigo: linha.codigo }, tokens);
    if (nota === null || nota < CONFIANCA_MINIMA) continue;
    pontuados.push({ ncm: linha.codigo, ex: linha.ex, descricao: linha.descricao, confianca: nota });
  }

  pontuados.sort((a, b) => b.confianca - a.confianca || (a.ex === "" ? -1 : b.ex === "" ? 1 : 0));

  const vistos = new Set<string>();
  const saida: CandidatoDeNcm[] = [];
  for (const c of pontuados) {
    if (vistos.has(c.ncm)) continue;
    vistos.add(c.ncm);
    saida.push(c);
    if (saida.length >= limite) break;
  }
  return saida;
}
