/**
 * JÁ ESTÁ CADASTRADO? — a checagem que a base inteira estava sem.
 *
 * ═══ O DEFEITO MEDIDO (2026-10-17, instalação do usuário) ═══
 *
 * Cruzamento difuso entre as 21.668 empresas de `business_prospects` e os 893
 * contatos que são pessoa jurídica (têm IE no `source_metadata` do Mercado
 * Livre):
 *
 *     limiar >= 0.95 .......  92 empresas
 *     limiar >= 0.90 .......  103 empresas   ← o que este módulo chama de cliente
 *     limiar >= 0.85 .......  114
 *     limiar >= 0.80 .......  141
 *
 * Exemplos que confirmam o acerto: "AUTO POSTO CAMP LTDA [prudentópolis]" ≈
 * "Auto Posto Camp"; "CAMARGO DIESEL AUTO PEÇAS E MECÂNICA LTDA [são mateus do
 * sul]" ≈ "Cargo Diesel Auto Peças e Mecânica Ltda". Não é teoria: são 103
 * empresas que a loja JÁ ATENDE e que uma campanha de prospecção ia tratar
 * como prospect frio — e o dano de mandar proposta comercial para o próprio
 * cliente não aparece como erro: aparece como cliente insatisfeito.
 *
 * ⚠️ O limiar é 0.90 E NÃO MENOR, com o número acima como justificativa: a 0.80
 * entram mais 38 casos e o erro passa a ser o inverso — declarar cliente quem
 * não é, escondendo prospect frio da campanha. Digamos os dois: 0.90 = "já é
 * cliente" (sai da fila), 0.80 = "revisar" (fica na fila, marcado).
 *
 * ═══ POR QUE DIFUSO E NÃO IGUALDADE ═══
 *
 * É o que o usuário descreveu: alguém cadastrou com a letra errada. No corpus
 * real, "Mecânica Salomon" e "Mecânica Salomon Ltda" são a mesma empresa, e
 * "Salomón"/"Salomon" ou "Mecânica"/"Mecanica" quebram qualquer igualdade.
 * Igualdade só acha o que ninguém digitou errado.
 *
 * ═══ POR QUE PORTO SIMILARIDADE E NÃO "CONTA" ═══
 *
 * É a mesma família do veto `catalogo_troca_por_acessorio`:amesma vírgula,
 * mesmo nome com sufixo, mesma chave com acentos diferentes. Comparar string
 * com string é o que separa o_clone do original.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** A partir daqui: é o mesmo nome com outra escrita. */
export const LIMIAR_CLIENTE = 0.9;
/** A partir daqui: provavelmente o mesmo nome, e a decisão é do humano. */
export const LIMIAR_REVISAR = 0.8;
/** Abaixo disto é outra empresa, e tratá-lo como igual apaga prospect bom. */
export const LIMIAR_DESCARTAR = 0.75;

/** Razão social que não é identidade: muda a escrita e não o quem é. */
const SUFIXOS_RAZAO = [
  'ltda',
  'eireli',
  'me',
  'epp',
  'epi',
  'sa',
  's a',
  'ltd',
];

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Chave de comparação de nome: sem acento, sem caixa, sem pontuação e sem
 * razão social. `Aut Mecanica Salomon LTDA` e `auto mecanica salomon` viram a
 * mesma chave — que é o que a loja quis dizer nas duas vezes.
 */
export function chaveDeNome(nome: string): string {
  let limpo = semAcento(nome).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  for (const sufixo of SUFIXOS_RAZAO) {
    limpo = limpo.replace(new RegExp(`(^|\\s)${sufixo}(\\s|$)`, "g"), " ");
  }
  return limpo.replace(/\s+/g, " ").trim();
}

/** Similaridade de Dice sobre bigramas: 1 = idêntico, 0 = sem relação. */
export function similaridade(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const contagem = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    contagem.set(g, (contagem.get(g) ?? 0) + 1);
  }
  let inter = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = contagem.get(g) ?? 0;
    if (c > 0) {
      inter += 1;
      contagem.set(g, c - 1);
    }
  }
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}

/** Quantas palavras são as mesmas, na mesma ordem. Trava o falso positivo. */
function palavrasEmComum(a: string, b: string): number {
  const pa = new Set(a.split(" ").filter(Boolean));
  let comuns = 0;
  for (const p of b.split(" ").filter(Boolean)) if (pa.has(p)) comuns += 1;
  return comuns;
}

export interface NomeComparavel {
  nome: string;
  cidade?: string | null;
  uf?: string | null;
}

/**
 * Dois nomes são a MESMA empresa?
 *
 * Três condições, e as três são necessárias — cada uma barra um falso positivo
 * que o corpus mostrou:
 *
 *  1. chave igual → 1.0 sem dúvida (cobre acento e pontuação);
 *  2. similaridade >= limiar E uma palavra em comum → barra "Farmácia X" ≈
 *     "Auto Peças X", que tem letra alike e nenhum nome igual;
 *  3. similaridade >= limiar E nome com uma palavra só → "União" ≈ "Uniiao"
 *     passa; sem a exceção, fica de fora por não ter palavra em comum com a
 *     chave (que é uma palavra).
 */
/**
 * Similaridade BRUTA entre dois nomes, com as regras estruturais e sem corte de
 * limiar: devolve o número (0 quando as regras não seguram).
 *
 * A separação existe porque são duas perguntas diferentes. "São o mesmo nome?"
 * (com corte, para decidir cliente) e "quanto são parecidos?" (sem corte, para
 * decidir cliente/revisar/limpo). Com uma função só, o par "Uniao"≈"Uniiao"
 * — 0.888, real e verdadeiro — voltava 0 e nunca chegava à faixa de revisão.
 */
export function brutoDeNomes(a: NomeComparavel, b: NomeComparavel): number {
  const ka = chaveDeNome(a.nome);
  const kb = chaveDeNome(b.nome);
  if (ka.length === 0 || kb.length === 0) return 0;
  if (ka === kb) return 1;
  const sim = similaridade(ka, kb);
  if (sim < LIMIAR_DESCARTAR) return 0;
  const emComum = palavrasEmComum(ka, kb);
  if (emComum === 0) {
    // Nome de uma palavra: a similaridade alta JÁ É a prova ("Uniao"≈"Uniiao").
    // Com duas ou mais, sem palavra em comum é coincidência de letra
    // ("farmacia sao joao" x "auto pecas sao joao") e devolve 0.
    const umaPalavra = ka.split(" ").length === 1 && kb.split(" ").length === 1;
    return umaPalavra ? sim : 0;
  }
  return sim;
}

/** Dois nomes são a MESMA empresa, no corte que a decisão pedir? */
export function mesmoNome(
  a: NomeComparavel,
  b: NomeComparavel,
  limiar = LIMIAR_CLIENTE,
): number {
  const bruto = brutoDeNomes(a, b);
  return bruto >= limiar ? bruto : 0;
}

/** A cidade fecha o casamento: mesma empresa em duas cidades são duas lojas. */
export function mesmaCidade(
  a: { cidade?: string | null; uf?: string | null },
  b: { cidade?: string | null; uf?: string | null },
): boolean {
  const ca = semAcento(a.cidade ?? "").replace(/\s+/g, " ").trim();
  const cb = semAcento(b.cidade ?? "").replace(/\s+/g, " ").trim();
  if (ca === "" || cb === "") return true; // sem dado, o nome decide
  const ua = semAcento(a.uf ?? "").trim();
  const ub = semAcento(b.uf ?? "").trim();
  if (ua !== "" && ub !== "" && ua !== ub) return false;
  return ca === cb;
}

/**
 * ÍNDICE de nomes para não comparar 21 mil × 21 mil.
 *
 * Duas entradas por linha: por cidade (que é como o operador pensa) e pelos
 * três primeiros caracteres da chave (que é o que sobra quando a cidade não
 * bate). A medida: 893 candidatos × base inteira = ~19 milhões de comparações
 * — o que transforma um clique em meio minuto de CPU.
 */
export class IndiceDeNomes {
  private readonly porCidade = new Map<string, Array<{ id: string; nome: string; chave: string }>>();
  private readonly porPrefixo = new Map<string, Array<{ id: string; nome: string; chave: string }>>();

  add(id: string, nome: string, cidade?: string | null, uf?: string | null): void {
    const chave = chaveDeNome(nome);
    if (chave.length === 0) return;
    const linha = { id, nome, chave };
    const kCidade = `${semAcento(cidade ?? "").replace(/\s+/g, " ").trim()}|${semAcento(uf ?? "").trim()}`;
    if (!this.porCidade.has(kCidade)) this.porCidade.set(kCidade, []);
    this.porCidade.get(kCidade)!.push(linha);
    const prefixo = chave.slice(0, 3);
    if (prefixo.length === 3) {
      if (!this.porPrefixo.has(prefixo)) this.porPrefixo.set(prefixo, []);
      this.porPrefixo.get(prefixo)!.push(linha);
    }
  }

  /** Candidatos prováveis: os da cidade; sem cidade no dado, os do prefixo. */
  candidatos(nome: string, cidade?: string | null, uf?: string | null): NomeComparavel[] {
    const chave = chaveDeNome(nome);
    const kCidade = `${semAcento(cidade ?? "").replace(/\s+/g, " ").trim()}|${semAcento(uf ?? "").trim()}`;
    const daCidade = this.porCidade.get(kCidade);
    if (daCidade && daCidade.length > 0) return daCidade.map((l) => ({ nome: l.nome }));
    const doPrefixo = this.porPrefixo.get(chave.slice(0, 3));
    return (doPrefixo ?? []).map((l) => ({ nome: l.nome }));
  }

  get tamanho(): number {
    let n = 0;
    for (const lista of this.porCidade.values()) n += lista.length;
    return n;
  }
}

/** Veredito sobre uma empresa: cliente, revisável, ou prospect limpo. */
export interface Veredito {
  estado: "cliente" | "revisar" | "limpo";
  /** Nome com quem bateu — para a tela mostrar de onde veio a dúvida. */
  comQuem: string | null;
  similaridade: number;
}

export function classificar(
  empresa: NomeComparavel,
  candidatos: NomeComparavel[],
): Veredito {
  let melhor = 0;
  let comQuem: string | null = null;
  for (const c of candidatos) {
    const sim = brutoDeNomes(empresa, c);
    if (sim > melhor) {
      melhor = sim;
      comQuem = c.nome;
    }
  }
  if (melhor >= LIMIAR_CLIENTE) return { estado: "cliente", comQuem, similaridade: melhor };
  if (melhor >= LIMIAR_REVISAR) return { estado: "revisar", comQuem, similaridade: melhor };
  return { estado: "limpo", comQuem: null, similaridade: melhor };
}

/**
 * Os contatos EMPRESA (têm IE) da organização, em índice.
 *
 * Por que só os que têm IE: a instalação tem 12.604 contatos e 12.594 deles
 * são comprador pessoa física do Mercado Livre ("Lúcia", "Roberto"), com nome
 * que não é o nome da empresa. Sem o IE, "Mecânica X" contra "Mecânica X" em nome de
 * gente dá alarme falso em vez de proteção.
 */
export async function indiceDeClientes(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<IndiceDeNomes> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id, name, source_metadata")
    .eq("organization_id", organizationId);
  if (error) throw new Error(`clientes_indisponiveis: ${error.message}`);
  const indice = new IndiceDeNomes();
  for (const c of (data ?? []) as Array<{
    id: string;
    name: string | null;
    source_metadata: Record<string, { ie?: string | null; cidade?: string | null; uf?: string | null } | null> | null;
  }>) {
    const meta = c.source_metadata?.mercos ?? null;
    if (!meta || (meta.ie ?? "") === "") continue;
    indice.add(c.id, c.name ?? "", meta.cidade ?? "", meta.uf ?? "");
  }
  return indice;
}
