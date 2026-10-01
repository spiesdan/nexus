/**
 * O funil por campanha (spec 19, §28 — Encontrados → … → Pedidos).
 *
 * Cada estágio é a CONTAGEM VERDADEIRA daquele estágio nos dados reais, não
 * um anel matemático contido no anterior: na vida real um pedido nasce sem
 * ninguém fechar a oportunidade, e esconder isso seria maquiar o painel. O
 * gráfico é de barras por estágio (molde `app/app/indicadores/_funil.tsx`),
 * com largura relativa ao maior estágio — não um funil de anéis.
 *
 * Os estágios do PROSPECT derivam do `status_comercial` (D15: o funil do §16
 * é o vocabulário que já existe; Oportunidade/Pedido são do CRM e chegam de
 * fora, em `FimDoFunil`). Os conjuntos embaixo são aninhados por construção
 * (contém os estados "além" deles), então contatados ≥ responderam ≥
 * qualificados cai sozinho — a única que não é função do status é
 * "selecionados".
 */
import type { StatusComercial } from "@/lib/schemas/prospeccao";

export interface ProspectDoFunil {
  status_comercial: StatusComercial;
  owner_user_id: string | null;
}

/** O que não é status do prospect: vem das queries de CRM (leads/pedidos). */
export interface FimDoFunil {
  oportunidades: number;
  pedidos: number;
  faturamento_cents: number;
}

export interface FunilDaCampanha extends FimDoFunil {
  encontrados: number;
  selecionados: number;
  contatados: number;
  responderam: number;
  qualificados: number;
}

/**
 * Enviou mensagem de verdade (ou chegou ao fim de ciclo como cliente).
 * `sem_interesse`/`descartado` ficam de FORA: o botão "Ignorar" do drawer
 * marca sem interesse sem ter tentado contato, e contar isso como contatado
 * inflaria o funil com skips.
 */
const CONTATADOS: ReadonlySet<StatusComercial> = new Set<StatusComercial>([
  "contatado",
  "respondeu",
  "qualificado",
  "cliente",
]);

/** Contatados que mostraram reação — `respondeu` ou além. */
const RESPONDERAM: ReadonlySet<StatusComercial> = new Set<StatusComercial>([
  "respondeu",
  "qualificado",
  "cliente",
]);

/** Passaram pela qualificação comercial — `qualificado` ou além. */
const QUALIFICADOS: ReadonlySet<StatusComercial> = new Set<StatusComercial>([
  "qualificado",
  "cliente",
]);

/**
 * Entrou no fluxo ativo: tem dono na fila OU já saiu do estado inicial.
 * `novo`/`nao_analisado` sem dono = descoberto e intocado (só "Encontrados").
 */
function selecionado(p: ProspectDoFunil): boolean {
  return p.owner_user_id !== null || (p.status_comercial !== "novo" && p.status_comercial !== "nao_analisado");
}

export function calcularFunil(prospects: ProspectDoFunil[], fim: FimDoFunil): FunilDaCampanha {
  let selecionados = 0;
  let contatados = 0;
  let responderam = 0;
  let qualificados = 0;
  for (const p of prospects) {
    if (selecionado(p)) selecionados++;
    if (CONTATADOS.has(p.status_comercial)) contatados++;
    if (RESPONDERAM.has(p.status_comercial)) responderam++;
    if (QUALIFICADOS.has(p.status_comercial)) qualificados++;
  }
  return {
    encontrados: prospects.length,
    selecionados,
    contatados,
    responderam,
    qualificados,
    oportunidades: fim.oportunidades,
    pedidos: fim.pedidos,
    faturamento_cents: fim.faturamento_cents,
  };
}
