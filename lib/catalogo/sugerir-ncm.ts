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
import { normalizar, pontuar, tokenizar } from "@/lib/catalogo/busca";

/**
 * O vocabulário da tabela: toda palavra que aparece em alguma descrição.
 *
 * Comparado já normalizado (o mesmo `normalizar` do `tokenizar`), então
 * "Águas" da tabela casa "aguas" do produto. Uma passada só por chamada —
 * para a tabela IBPT inteira (~20 mil linhas) é rápido, e sem isto cada
 * token fora do vocabulário seria um falso negativo silencioso.
 */
function vocabularioDaTabela(linhas: LinhaIbptCandidata[]): Set<string> {
  const vocab = new Set<string>();
  for (const linha of linhas) {
    if (!linha.descricao) continue;
    for (const palavra of normalizar(linha.descricao).split(" ")) {
      if (palavra !== "") vocab.add(palavra);
    }
  }
  return vocab;
}

/**
 * Frequência por token: em quantas descrições cada palavra aparece.
 *
 * Base do filtro de palavras comuns (regra 4 do `candidatosDeNcm`).
 * Calculado da própria tabela em vez de lista hardcoded — vale para qualquer
 * tabela, e muda sozinho quando a tabela muda.
 */
function frequenciaPorToken(linhas: LinhaIbptCandidata[]): {
  mapa: Map<string, number>;
  total: number;
} {
  const mapa = new Map<string, number>();
  let total = 0;
  for (const linha of linhas) {
    if (!linha.descricao) continue;
    total++;
    const vistas = new Set(
      normalizar(linha.descricao)
        .split(" ")
        .filter((w) => w !== ""),
    );
    for (const w of vistas) mapa.set(w, (mapa.get(w) ?? 0) + 1);
  }
  return { mapa, total };
}

/** Acima desta fração de linhas, a palavra não distingue nada. */
const LIMITE_DF = 0.3;

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

  // ─── 3. FORA DO VOCABULÁRIO, FORA DA CONTA ──────────────────────────────
  //
  // Token que não aparece em NENHUMA descrição da tabela (marca própria como
  // "BILL", que está em todo produto da org e em zero descrições oficiais)
  // não pode somar nem dividir: somar zero derruba a média de um casamento
  // exato — "AGUA SANITARIA BILL" media 0.5999… e reprovava no piso 0.6.
  //
  // Medido em 11/10/2026 contra o catálogo real (631 produtos, quase todos
  // com a marca no nome). Sem isto, o lote inteiro ia para revisão.
  //
  // A pertinência é por PREFIXO (a mesma do `pontuar`: "agua" vale para
  // "aguas"). Comparação exata aqui descartaria o singular contra o plural —
  // que é exatamente o caso que o prefixo existe para salvar.
  const vocabulario = vocabularioDaTabela(linhas);
  const uteis = palavras.filter((p) => {
    if (vocabulario.has(p)) return true;
    if (p.length < 3) return false;
    for (const v of vocabulario) {
      if (v.startsWith(p) || p.startsWith(v)) return true;
    }
    return false;
  });
  if (uteis.length === 0) return [];

  // ─── 4. PALAVRA COMUM DEMAIS NÃO DECIDE SOZINHA ───────────────────────────
  //
  // "NÃO" está em centenas de descrições ("não desnaturado", "não
  // acondicionado"…). Um produto chamado "XYZQ NÃO EXISTE NADA" casava uma
  // descrição qualquer SÓ pelo "não" com nota 1.0 — e com margem, o lote
  // APLICAVA. Medido em 11/10/2026 no teste da rota.
  //
  // Token presente em mais de 30% das linhas sai da conta (IDF-lite calculado
  // da própria tabela, sem lista hardcoded — vale para qualquer tabela).
  const { mapa: frequencia, total: linhasComDescricao } = frequenciaPorToken(linhas);
  const distintivos = uteis.filter(
    (p) => (frequencia.get(p) ?? 0) / Math.max(1, linhasComDescricao) <= LIMITE_DF,
  );
  if (distintivos.length === 0) return [];
  const tokens = { palavras: distintivos, numeros: [] as string[] };

  const pontuados: CandidatoDeNcm[] = [];
  for (const linha of linhas) {
    if (!linha.descricao) continue;
    const nota = pontuar({ nome: linha.descricao, codigo: linha.codigo }, tokens);
    if (nota === null || nota < CONFIANCA_MINIMA) continue;
    // Arredonda para 3 casas: (0.9+0.9)/2 é 0.9 na matemática e 0.8999999… no
    // float — e o piso do lote compara com 0.9 exato. Sem isto, casamento
    // exato reprova por erro de representação.
    pontuados.push({
      ncm: linha.codigo,
      ex: linha.ex,
      descricao: linha.descricao,
      confianca: Math.round(nota * 1000) / 1000,
    });
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
