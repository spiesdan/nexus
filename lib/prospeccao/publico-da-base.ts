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

import { categoriasQueCasam } from "@/lib/prospeccao/categoria-pt";

import {
  classificar,
  IndiceDeNomes,
  chaveDeNome,
} from "@/lib/prospeccao/ja-cadastrada";

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
}

export interface LinhaDaBase extends ProspectoDaBase {
  id: string;
  telefone: string | null;
  whatsapp_potencial: boolean;
  do_not_contact: boolean;
}

/** Teto de linhas por página — o limite do PostgREST é 1000. */
export const LIMITE_POR_PAGINA = 1000;
export const MAX_PAGINAS = 10;
export const LIMITE_PADRAO = 500;
export const LIMITE_MAXIMO = 5000;

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

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
 * Categoria: a campanha é uma lista. A empresa serve se ALGUMA das categorias
 * da campanha estiver entre as dela (`categorias`) ou for igual à `categoria`
 * singular. Empresa sem categoria não entra — e é essa recusa explícita que
 * impede a tela de prometer 5.000 e entregar 40.
 */
export function empresaServe(empresa: ProspectoDaBase, criterio: CriterioDaBase): boolean {
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
  if (criterio.categorias.length === 0) return true;
  const daEmpresa = [
    ...(empresa.categorias ?? []),
    ...(empresa.categoria ? [empresa.categoria] : []),
  ].map((c) => semAcento(c).trim());
  const aceitas = criterio.aceitas ?? categoriasAceitas(criterio.categorias);
  return daEmpresa.some((c) => aceitas.has(c));
}

/**
 * As categorias que a campanha aceita, nas DUAS línguas em que a base grava.
 *
 * ═══ O MESMO DEFEITO QUE O USUÁRIO APONTOU, COM O NOME ═══
 *
 * A base grava o rótulo cru da API do Google — **inglês**: "Auto repair shop",
 * "Gas station", "Tire repair shop". A campanha é montada em **português**:
 * "Oficina mecânica", "Posto de combustível", "Borracharia". Comparar as duas
 * strings direto é o mesmo erro de comparar "Salomon" com "Salomón": medido em
 * Videira, a campanha "Oficinas - SC" alcançava **1** das 1.268 empresas da
 * cidade — porque "Oficina mecânica" ≠ "Auto repair shop".
 *
 * O mapa PT↔EN já existe (`lib/prospeccao/categoria-pt.ts`) e é o que o filtro
 * da aba Empresas usa. Aqui é o mesmo mapa: o termo da campanha vira os rótulos
 * que ele descreve, e cada rótulo entra no conjunto já sem acento.
 *
 * ⚠️ NÃO há um segundo passo "tradução exata" varrendo o mapa ao contrário, e
 * isso foi medido, não assumido: a mutação que o desligou passou a suíte
 * inteira. `categoriasQueCasam` já compara por `includes` no rótulo em
 * português, e igualdade ⊂ `includes` — o passo inverso só repetiria o que o
 * primeiro devolve. É a mesma lição que o passo "tradução exata" da
 * `categoria-pt.ts` já deu uma vez: código que a mutação não derruba é código
 * que ninguém sabe se trabalha.
 */
export function categoriasAceitas(categorias: string[]): Set<string> {
  const aceitas = new Set<string>();
  for (const c of categorias) {
    aceitas.add(semAcento(c).trim());
    for (const bruta of categoriasQueCasam(c)) aceitas.add(semAcento(bruta).trim());
  }
  return aceitas;
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

/** Uma consulta só, com o que o Postgres filtra bem: org, opt-out e WhatsApp. */
function consultaDaBase(supabase: SupabaseClient, org: string, comWhatsapp: boolean) {
  let q = supabase
    .from("business_prospects")
    .select(
      "id, nome, telefone, cidade, estado, categoria, categorias, whatsapp_potencial, do_not_contact",
    )
    .eq("organization_id", org)
    .eq("do_not_contact", false);
  if (comWhatsapp) q = q.eq("whatsapp_potencial", true);
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
    categoria: string | null;
  }>;
  /** Quantas linhas da base foram lidas para chegar aí — a tela mostra, não esconde. */
  varridas: number;
  /** A varredura chegou ao fim da base, ou parou no teto de páginas? */
  completa: boolean;
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
  // Duplicata interna: chave + cidade já vistas NESTA varredura. A segunda
  // ocorrência sai — mandar duas vezes para a mesma empresa é o erro que o
  // operador vê ("recebi duas mensagens") e que nenhuma tela contava.
  const vistas = new Map<string, string>();
  let duplicadas = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS && linhas.length < limite; pagina++) {
    const de = pagina * LIMITE_POR_PAGINA;
    const { data, error } = await consultaDaBase(
      supabase,
      input.organizationId,
      input.somenteWhatsapp ?? true,
    ).range(de, de + LIMITE_POR_PAGINA - 1);
    if (error) throw new Error(`base_indisponivel: ${error.message}`);
    const lote = (data ?? []) as unknown as LinhaDaBase[];
    if (lote.length === 0) break;
    varridas += lote.length;
    for (const e of lote) {
      if (!empresaServe(e, criterio)) continue;

      const chave = `${chaveDeNome(e.nome)}|${chaveDeNome(e.cidade ?? "")}`;
      const primeira = vistas.get(chave);
      if (primeira !== undefined) {
        duplicadas += 1;
        continue;
      }
      vistas.set(chave, e.nome);

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
        categoria: e.categoria,
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
