/**
 * PÚBLICO DA CAMPANHA — a fila que a aba Campanhas consegue enxergar.
 *
 * ═══ O DEFEITO MEDIDO ═══
 *
 * A instalação tinha 21.668 empresas em `business_prospects` (16.934 delas de
 * `maps_browser`, isto é, importação de arquivo) e a única campanha mostrava
 * **16** no funil. Não era erro de tela: a fila da campanha sai de
 * `prospect_search_results`, e `importarNegociosDeArquivo` pula
 * `vincularResultado` de propósito (arquivo não tem busca para onde se ligar).
 * Quem tinha o dado na mão via Empresas e Disparo; a aba Campanhas era cega a
 * ele — e o caminho que ela usava (132 buscas: 5 concluídas, 60 failed, 67
 * canceladas) estava quase parado.
 *
 * ═══ A REGRA ═══
 *
 * O público da base é o que a campanha **já pediu**: mesmas cidades, mesmas
 * categorias, mais os três filtros que o disparo sempre teve — telefone que é
 * WhatsApp, `do_not_contact` desligado, e ninguém já contactado.
 *
 * ⚠️ A comparação de cidade é feita aqui, não no banco, e a razão é acento: a
 * base tem "Caçador" e a campanha pode pedir "Cacador" (ou o contrário, em
 * planilha que passou por UTF-8 duas vezes). `ilike` resolve caixa; `ç` contra
 * `c` só resolve normalizando. Preferimos trazer as linhas da organização
 * (16.729 com cidade, medido) e decidir numa função testável a llaves de
 * confiar num `unaccent` que a instalação pode não ter.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { semAcento } from "@/lib/prospeccao/categoria-pt";
import {
  categoriaCombinaComCampanha,
  categoriaEfetiva,
  categoriasAceitas,
  type CategoriaEfetiva,
} from "@/lib/prospeccao/categoria-efetiva";

import {
  classificar,
  IndiceDeNomes,
  chaveDeNome,
} from "@/lib/prospeccao/ja-cadastrada";

export { categoriasAceitas };

/** Cidade/UF da campanha: o que a tela grava em `cidades` (jsonb). */
export interface CidadeDaCampanha {
  cidade: string;
  estado?: string | null;
}

export interface CriterioDaBase {
  cidades: CidadeDaCampanha[];
  categorias: string[];
  /** Estado único, quando a campanha inteira é de uma UF (atalho do filtro). */
  estado: string | null;
  /** Conjunto já traduzido das categorias aceitas (PT ↔ EN). Opcional. */
  aceitas?: Set<string>;
}

export interface ProspectoDaBase {
  nome: string;
  cidade: string | null;
  estado: string | null;
  categoria: string | null;
  categorias: string[] | null;
  website?: string | null;
  categoria_canonica?: string | null;
  categoria_revisar?: boolean | null;
}

export interface LinhaDaBase extends ProspectoDaBase {
  id: string;
  telefone: string | null;
  whatsapp_potencial: boolean;
  do_not_contact: boolean;
}

/** Teto de linhas por página — o limite do PostgREST é 1000. */
export const LIMITE_POR_PAGINA = 1000;
/**
 * Quantas páginas a varredura lê no máximo.
 *
 * ═══ POR QUE 50, E NÃO 10 ════════════════════════════════════════════════
 *
 * Medido em 18/10/2026 com a base real (21.668 empresas, `scripts/prova-publico-
 * da-campanha.ts`): com 10 páginas a varredura lia **10.000 linhas** e a
 * campanha "Videira × mecânica" alcançava **62** empresas — quando as 123 que
 * servem à campanha estavam todas na base. Metade da fila sumia, e não por
 * critério nenhum: por a janela acabar antes.
 *
 * Pior que o número: a consulta NÃO tinha `order by`, então *quais* 10.000
 * entram é a ordem física da tabela. Uma reorganização do Postgres mudaria a
 * fila sem mudar um dado — o mesmo defeito do "Salomon"/"Salomón", agora na
 * ordem de leitura. Por isso a janela tem ordem explícita e o teto é largo o
 * bastante para a base do dono caber inteira (50 páginas = 50.000 linhas).
 *
 * Teto continua existindo: `completa: false` avisa quando não deu, e a tela
 * mostra. Silêncio era o defeito.
 */
export const MAX_PAGINAS = 50;
export const LIMITE_PADRAO = 500;
export const LIMITE_MAXIMO = 5000;

/** Chave de comparação de cidade: sem acento, sem caixa, sem espaço sobrando. */
export function chaveDeCidade(nome: string): string {
  return semAcento(nome).replace(/\s+/g, " ");
}

/**
 * A empresa serve à campanha?
 *
 * Cidade: por chave (accento e caixa fora). Estado: só quando a campanha
 * declarou — campanha sem estado alcança qualquer estado, que é o que o
 * operador quis dizer ao não escolher.
 *
 * Categoria: usa a MESMA `categoriaEfetiva` da tela e do disparo. Não é o
 * rótulo cru do Google: uma cafeteria dentro do posto não serve à campanha de
 * postos, e uma empresa marcada para revisão não entra em campanha nenhuma.
 */
export function empresaServe(
  empresa: ProspectoDaBase,
  criterio: CriterioDaBase,
  efetiva?: CategoriaEfetiva,
): boolean {
  if (empresa.cidade === null || empresa.cidade.trim() === "") return false;
  if (!criterio.cidades.some((c) => chaveDeCidade(c.cidade) === chaveDeCidade(empresa.cidade!))) {
    return false;
  }
  const ufDoCriterio =
    criterio.estado === null || criterio.estado === ""
      ? null
      : semAcento(criterio.estado);
  if (ufDoCriterio !== null) {
    const ufDaEmpresa = empresa.estado === null ? "" : semAcento(empresa.estado);
    if (ufDaEmpresa !== ufDoCriterio) return false;
  }
  // Campanha sem categoria é "toda a cidade" — comportamento histórico, e o
  // teste `campanha sem categoria aceita a empresa da cidade` o fixa.
  if (criterio.categorias.length === 0) return true;
  return categoriaCombinaComCampanha(
    efetiva ?? categoriaEfetiva(empresa),
    criterio.categorias,
    criterio.aceitas,
  );
}

/** Critério a partir da campanha, já com o estado abreviado quando é um só. */
export function criterioDaCampanha(input: {
  cidades: CidadeDaCampanha[];
  categorias: string[];
}): CriterioDaBase {
  const estados = [...new Set(input.cidades.map((c) => (c.estado ?? "").trim()).filter(Boolean))];
  return {
    cidades: input.cidades,
    categorias: input.categorias,
    estado: estados.length === 1 ? estados[0]! : null,
    // Traduzido UMA vez por campanha, não por linha: a base tem 21.668 linhas
    // e o mapa tem 536 rótulos — refazer isso por linha seria 11 milhões de
    // comparações por clique.
    aceitas: categoriasAceitas(input.categorias),
  };
}

/**
 * Uma consulta só, com o que o Postgres filtra bem: org, opt-out, WhatsApp —
 * e a UF, quando a campanha inteira é de uma.
 *
 * ⚠️ O `order("id")` NÃO é enfeite: sem ele a paginação por `range` caminha
 * pela ordem física da tabela, e a janela de leitura deixa de ser um conjunto
 * estável entre uma execução e outra. Medido em 18/10/2026: sem ordem, a
 * campanha de Videira alcançava 62 de 123 empresas — e quais 62 dependia de
 * quando o Postgres reorganizou a tabela.
 *
 * O filtro por UF vale quando `criterio.estado` existe, e só então: é
 * exatamente a mesma condição que `empresaServe` exige (cidade bate E, se a
 * campanha declarou uma UF, a UF bate). Campanha com duas ou mais UFs fica sem
 * filtro de estado aqui — para não excluir uma empresa que a regra de negócio
 * aceitaria, e porque o nome da cidade sozinho já é seletivo.
 */
function consultaDaBase(
  supabase: SupabaseClient,
  org: string,
  comWhatsapp: boolean,
  uf: string | null,
) {
  let q = supabase
    .from("business_prospects")
    .select(
      "id, nome, telefone, cidade, estado, categoria, categorias, website, categoria_canonica, categoria_revisar, whatsapp_potencial, do_not_contact",
    )
    .eq("organization_id", org)
    .eq("do_not_contact", false)
    // Empresa bloqueada (fora da região, fraude, pedido do dono) não é
    // "público em aberto": some da fila, não só do envio. O disparo já a
    // recusava; deixá-la na contagem fazia a tela prometer um número que o
    // motor nunca entregava.
    .eq("bloqueado", false)
    .order("id", { ascending: true });
  if (comWhatsapp) q = q.eq("whatsapp_potencial", true);
  if (uf !== null && uf !== "") {
    // `in`, e não `ilike`: a UF da campanha é do operador e pode vir com `%`
    // colado de uma planilha — `ilike` trataria isso como curinga e a varredura
    // leria o país inteiro. Três valores porque a base grava caixa inconsistente.
    const variantes = [...new Set([uf, uf.toLowerCase(), uf.toUpperCase()])];
    q = q.in("estado", variantes);
  }
  return q;
}

export interface ResultadoDaBase {
  /** Quantas empresas da base servem a esta campanha (após o filtro). */
  total: number;
  /** As linhas, prontas para o disparo (o `disparar` consome o `id`). */
  linhas: Array<{
    id: string;
    nome: string;
    telefone: string | null;
    cidade: string | null;
    /** Rótulo EFETIVO (a cafeteria aparece como café, não como posto). */
    categoria: string | null;
    /** O rótulo cru do Google, para quem precisar auditar. */
    categoria_original: string | null;
  }>;
  /** Quantas linhas da base foram lidas para chegar aí — a tela mostra, não esconde. */
  varridas: number;
  /** A varredura chegou ao fim da base, ou parou no teto de páginas? */
  completa: boolean;
  /** Já reservadas por outra campanha — fora da fila (regra de exclusividade). */
  em_campanha: number;
  /** Categoria duvidosa (`revisar`) — fora da fila até alguém olhar. */
  categoria_a_revisar: number;
  /**
   * O que SAIU da fila, com o motivo. Sem isso a tela diria "1.200 empresas" e
   * o operador não saberia que 103 delas são clientes que a loja já atende —
   * que é exatamente o estrago que a contagem esconde.
   */
  ja_clientes: Array<{ nome: string; id: string; igual_a: string; similaridade: number }>;
  /** Duplicatas internas (mesmo nome normalizado, mesma cidade). */
  duplicadas: number;
  /** Parecidos que ficaram na fila marcados para revisão humana. */
  para_revisar: Array<{ nome: string; id: string; igual_a: string; similaridade: number }>;
}

/**
 * O público da campanha dentro da base já coletada.
 *
 * Varre a base da organização em páginas, decide cada linha com `empresaServe`
 * e devolve até `limite`. `somenteWhatsapp` (padrão) exige telefone que é
 * WhatsApp — campanha de prospecção é WhatsApp, e telefone fixo aqui é
 * mensagem que não sai.
 */
/**
 * A ocorrência de uma chave (nome normalizado + cidade) que já foi vista.
 *
 * `linha` é o índice dentro de `linhas` — e é ele que permite a troca quando a
 * duplicata posterior tem telefone melhor. `null` significa que aquela
 * ocorrência saiu da fila por ser cliente: aí não há linha para substituir.
 */
interface VistaDaDuplicata {
  nome: string;
  telefone: string | null;
  whatsapp: boolean;
  linha: number | null;
}

/**
 * A linha nova vale mais que a que ficou na fila?
 *
 * Só em dois casos, e nenhum deles piora o resultado:
 * 1. a que ficou está sem telefone e a nova tem;
 * 2. as duas têm telefone, mas a nova tem WhatsApp potencial e a que ficou
 *    não — porque WhatsApp potencial é o que o Disparo de fato envia.
 */
function valeMais(
  telNovo: string | null,
  waNovo: boolean,
  telVisto: string | null,
  waVisto: boolean,
): boolean {
  if (telNovo === null) return false;
  if (telVisto === null) return true;
  return !waVisto && waNovo;
}

export async function publicoDaBase(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    cidades: CidadeDaCampanha[];
    categorias: string[];
    somenteWhatsapp?: boolean;
    limite?: number;
    /** Índice dos contatos que são empresa; sem ele, ninguém sai por cliente. */
    clientes?: IndiceDeNomes | null;
    /**
     * IDs já reservados por OUTRA campanha (lista fechada ou envio). O público
     * da base não os oferece de novo — é a regra "empresa em campanha não
     * aparece em aberto".
     */
    reservados?: ReadonlySet<string>;
  },
): Promise<ResultadoDaBase> {
  const limite = Math.min(Math.max(input.limite ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO);
  const criterio = criterioDaCampanha({
    cidades: input.cidades,
    categorias: input.categorias,
  });

  let varridas = 0;
  let completa = true;
  const linhas: ResultadoDaBase["linhas"] = [];
  const jaClientes: ResultadoDaBase["ja_clientes"] = [];
  const paraRevisar: ResultadoDaBase["para_revisar"] = [];
  let emCampanha = 0;
  let categoriaARevisar = 0;
  // Duplicata interna: chave + cidade já vistas NESTA varredura. A segunda
  // ocorrência SAI — mandar duas vezes para a mesma empresa é o erro que o
  // operador vê ("recebi duas mensagens") e que nenhuma tela contava.
  //
  // `linha` é o índice em `linhas` (ou null quando a ocorrência saiu por ser
  // cliente) para que a duplicata com telefone melhor POSSA substituir a que
  // ficou. Ver o comentário do `valeMais` lá embaixo: sem isso a fila dependia
  // da ordem de leitura, que muda a cada execução porque o id é uuid.
  const vistas = new Map<string, VistaDaDuplicata>();
  let duplicadas = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS && linhas.length < limite; pagina++) {
    const de = pagina * LIMITE_POR_PAGINA;
    const { data, error } = await consultaDaBase(
      supabase,
      input.organizationId,
      input.somenteWhatsapp ?? true,
      criterio.estado,
    ).range(de, de + LIMITE_POR_PAGINA - 1);
    if (error) throw new Error(`base_indisponivel: ${error.message}`);
    const lote = (data ?? []) as unknown as LinhaDaBase[];
    if (lote.length === 0) break;
    varridas += lote.length;
    for (const e of lote) {
      const efetiva = categoriaEfetiva(e);
      // Categoria duvidosa só entra na conta se a empresa serviria à campanha
      // por cidade/UF — senão o número assusta sem motivo. E fica fora de
      // QUALQUER campanha, inclusive da histórica sem recorte: "sem categoria
      // na campanha" significa "toda a cidade", não "pode apostar na dúvida".
      if (efetiva.revisar && empresaServe(e, { ...criterio, categorias: [] }, efetiva)) {
        categoriaARevisar += 1;
        continue;
      }
      if (!empresaServe(e, criterio, efetiva)) continue;
      if (input.reservados?.has(e.id)) {
        emCampanha += 1;
        continue;
      }

      const chave = `${chaveDeNome(e.nome)}|${chaveDeNome(e.cidade ?? "")}`;
      const vista = vistas.get(chave);
      if (vista !== undefined) {
        duplicadas += 1;
        // ═══ DUPLICATA: VENCE A QUE TEM TELEFONE, NÃO A QUE CHEGOU PRIMEIRO ══
        //
        // A varredura é paginada por `id`, e o id é uuid — ou seja, a ordem de
        // leitura MUDA a cada execução. Venceu a primeira, a fila mudava sem
        // mudar um dado: medido em 18/10/2026, duas execuções da mesma campanha
        // deram 16 e 17 empresas sem telefone na fila. Uma fila que muda sozinha
        // não é uma fila: é uma loteria, e o operador não sabe o que vai mandar.
        //
        // A troca é só quando a nova linha é melhor (tem telefone, ou tem
        // WhatsApp potencial), então nunca piora a anterior. E não re-roda a
        // checagem de cliente: as duas linhas têm o MESMO nome normalizado e a
        // MESMA cidade — o veredito é o mesmo por construção.
        if (
          vista.linha !== null &&
          valeMais(e.telefone, e.whatsapp_potencial, vista.telefone, vista.whatsapp)
        ) {
          linhas[vista.linha] = {
            id: e.id,
            nome: e.nome,
            telefone: e.telefone,
            cidade: e.cidade,
            categoria: efetiva.rotulo,
            categoria_original: e.categoria,
          };
          vistas.set(chave, {
            nome: e.nome,
            telefone: e.telefone,
            whatsapp: e.whatsapp_potencial,
            linha: vista.linha,
          });
        }
        continue;
      }
      // Registrada ANTES da checagem de cliente: a chave precisa existir mesmo para
      // a ocorrência que sair por ser cliente — senão a próxima duplicata dela
      // seria tratada como empresa nova e entraria na fila. O `linha` é corrigido
      // nos dois desfechos abaixo (cliente → null, entrou na fila → o índice).
      vistas.set(chave, {
        nome: e.nome,
        telefone: e.telefone,
        whatsapp: e.whatsapp_potencial,
        linha: null,
      });

      if (input.clientes) {
        const candidatos = input.clientes.candidatos(e.nome, e.cidade, e.estado);
        const veredito = classificar({ nome: e.nome }, candidatos);
        if (veredito.estado === "cliente") {
          jaClientes.push({
            nome: e.nome,
            id: e.id,
            igual_a: veredito.comQuem ?? "",
            similaridade: veredito.similaridade,
          });
          vistas.set(chave, { nome: e.nome, telefone: e.telefone, whatsapp: e.whatsapp_potencial, linha: null });
          continue;
        }
        if (veredito.estado === "revisar") {
          paraRevisar.push({
            nome: e.nome,
            id: e.id,
            igual_a: veredito.comQuem ?? "",
            similaridade: veredito.similaridade,
          });
        }
      }

      linhas.push({
        id: e.id,
        nome: e.nome,
        telefone: e.telefone,
        cidade: e.cidade,
        categoria: efetiva.rotulo,
        categoria_original: e.categoria,
      });
      vistas.set(chave, {
        nome: e.nome,
        telefone: e.telefone,
        whatsapp: e.whatsapp_potencial,
        linha: linhas.length - 1,
      });
      if (linhas.length >= limite) break;
    }
    if (lote.length < LIMITE_POR_PAGINA) {
      break;
    }
    if (pagina === MAX_PAGINAS - 1) completa = false;
  }

  return {
    total: linhas.length,
    linhas,
    varridas,
    completa,
    em_campanha: emCampanha,
    categoria_a_revisar: categoriaARevisar,
    ja_clientes: jaClientes,
    duplicadas,
    para_revisar: paraRevisar,
  };
}

/**
 * O resumo que a tela mostra, em uma frase por linha. Mantém a contagem e o
 * motivo juntos de propósito: "1.200 empresas" sozinho é o número que esconde o
 * estrago.
 */
export function resumoDaBase(r: ResultadoDaBase): string {
  const partes = [`${r.total} empresas da base`];
  if (r.ja_clientes.length > 0) {
    partes.push(
      `${r.ja_clientes.length} já são clientes cadastrados (fora da fila)`,
    );
  }
  if (r.duplicadas > 0) partes.push(`${r.duplicadas} duplicadas (fora da fila)`);
  if (r.em_campanha > 0) {
    partes.push(`${r.em_campanha} já estão em outra campanha (fora da fila)`);
  }
  if (r.categoria_a_revisar > 0) {
    partes.push(`${r.categoria_a_revisar} com categoria a revisar (fora da fila)`);
  }
  if (r.para_revisar.length > 0) {
    partes.push(`${r.para_revisar.length} para revisar o nome`);
  }
  if (!r.completa) partes.push("base lida até o teto de páginas");
  return partes.join(" · ");
}

/** A campanha usa a base? (as três fontes, lidas pelo nome) */
export function usaBase(fonte: string | null | undefined): boolean {
  return fonte === "base" || fonte === "ambas";
}

/** A campanha cria buscas? `null` é o padrão herdado: busca, como sempre foi. */
export function usaBusca(fonte: string | null | undefined): boolean {
  return !usaBase(fonte);
}
