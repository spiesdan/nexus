/**
 * A tarefa espelhada da prospecção (spec 19, §31 — MEU DIA; D7).
 *
 * O Meu Dia não ganha bloco novo: ele já lê `commercial_tasks`, e é por lá
 * que as tarefas da prospecção chegam. O gatilho é o PRÓXIMO PASSO do drawer
 * (§16) — quando o vendedor define uma, a rota do prospect espelha o texto
 * numa tarefa de verdade; limpar a ação cancela a espelhada; concluir a
 * tarefa limpa a ação de volta. Uma fonte, não duas.
 *
 * Puro de propósito — monta o ROW, quem fala com o Supabase é a rota:
 * `app/api/v1/prospecting/prospects/[id]/route.ts` (criar/editar/cancelar) e
 * `app/api/v1/tarefas/[id]/route.ts` (concluir devolve o passo a null).
 */

/**
 * Limite do schema do cliente (`tarefaCreateSchema.titulo`/`tarefaPatchSchema`
 * travam em 200). O banco não tem teto (só `char_length > 0`), mas a tela de
 * tarefas e o Meu Dia leem o que o vendedor espera ler — corto em pontos de
 * código para nunca abrir surrogate solto no meio do texto.
 */
export const LIMITE_TITULO_TAREFA = 200;

/** O que a rota precisa do prospect para montar a tarefa. */
export interface ProspectDaTarefa {
  id: string;
  nome: string;
  categoria: string | null;
  cidade: string | null;
  contact_id: string | null;
  owner_user_id: string | null;
}

function cortar(texto: string, limite: number): string {
  const pontos = Array.from(texto);
  if (pontos.length <= limite) return texto;
  return `${pontos.slice(0, limite - 1).join("")}…`;
}

/**
 * Título no molde do §31 ("Contatar Restaurante X"): a ação que o vendedor
 * escreveu + o nome da empresa, separados — o passo é frase livre ("ligar
 * amanhã de manhã", placeholder do drawer), então o separador evita run-on e
 * o nome garante que a tarefa se identifique sozinha no Meu Dia (prospect
 * sem CRM não tem `contato_nome`).
 */
export function tituloDaTarefaEspelhada(passo: string, nome: string): string {
  return cortar(`${passo.trim()} - ${nome.trim()}`, LIMITE_TITULO_TAREFA);
}

/** Proveniência no molde da tarefa da ficha 360° (contexto quando existe). */
export function descricaoDaTarefaEspelhada(p: Pick<ProspectDaTarefa, "categoria" | "cidade">): string {
  const contexto = [p.categoria, p.cidade].filter(Boolean).join(" · ");
  return contexto
    ? `Tarefa criada a partir da fila de prospecção — ${contexto}.`
    : "Tarefa criada a partir da fila de prospecção.";
}

export interface TarefaEspelhadaParaCriar {
  organization_id: string;
  titulo: string;
  descricao: string;
  /** Ação em texto livre — sem verbo garantido, o tipo honesto é "outro". */
  tipo: "outro";
  status: "pendente";
  contact_id: string | null;
  /** Vendedor dono do prospect; sem dono, quem definiu a ação. */
  responsavel_user_id: string;
  /** §31 coloca as tarefas em "Hoje" — data YYYY-MM-DD (a coluna não tem hora). */
  agendada_para: string;
  prospect_id: string;
  created_by: string;
}

export interface TarefaEspelhadaParaAtualizar {
  titulo: string;
  descricao: string;
  contact_id: string | null;
  responsavel_user_id: string;
  /** Definir (ou redefinir) a ação reabre a espelhada — a ação está viva. */
  status: "pendente";
}

export interface ContextoDaTarefa {
  organizationId: string;
  usuarioId: string;
  /** `YYYY-MM-DD` do relógio único (a rota passa o dia UTC, como o resto). */
  hoje: string;
}

export function tarefaEspelhadaParaCriar(
  p: ProspectDaTarefa,
  passo: string,
  ctx: ContextoDaTarefa,
): TarefaEspelhadaParaCriar {
  return {
    organization_id: ctx.organizationId,
    titulo: tituloDaTarefaEspelhada(passo, p.nome),
    descricao: descricaoDaTarefaEspelhada(p),
    tipo: "outro",
    status: "pendente",
    contact_id: p.contact_id,
    responsavel_user_id: p.owner_user_id ?? ctx.usuarioId,
    agendada_para: ctx.hoje,
    prospect_id: p.id,
    created_by: ctx.usuarioId,
  };
}

export function tarefaEspelhadaParaAtualizar(
  p: ProspectDaTarefa,
  passo: string,
  ctx: { usuarioId: string },
): TarefaEspelhadaParaAtualizar {
  return {
    titulo: tituloDaTarefaEspelhada(passo, p.nome),
    descricao: descricaoDaTarefaEspelhada(p),
    contact_id: p.contact_id,
    responsavel_user_id: p.owner_user_id ?? ctx.usuarioId,
    status: "pendente",
  };
}
