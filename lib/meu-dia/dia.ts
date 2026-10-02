/**
 * Meu Dia — a lógica pura que transforma tarefas + compromissos na linha do
 * tempo da aba (§21: "o que preciso fazer agora?").
 *
 * Tudo aqui é função pura recebendo `agora` explícito: o fuso é o do NAVEGADOR
 * (quem olha a tela), nunca o do servidor. As datas chegam em duas moedas
 * diferentes — tarefas em `YYYY-MM-DD` (date-only, sem fuso) e compromissos em
 * instante ISO — e a única ponta que sabe traduzir uma para a outra é este
 * arquivo, para a comparação acontecer num só relógio.
 */

export interface TarefaDoDia {
  id: string;
  titulo: string;
  contato: string | null;
  /** `YYYY-MM-DD` ou `null` (sem data). */
  agendada_para: string | null;
}

export interface CompromissoDoDia {
  id: string;
  titulo: string;
  contato: string | null;
  /** Instante ISO com offset — o campo `iniciaEm` da agenda. */
  iniciaEm: string;
  situacao: string;
}

export type ItemDaLinha =
  | {
      kind: "compromisso";
      id: string;
      titulo: string;
      contato: string | null;
      quando: Date;
      hora: string;
      situacao: string;
    }
  | {
      kind: "tarefa";
      id: string;
      titulo: string;
      contato: string | null;
      /** `YYYY-MM-DD` ou `null`. */
      data: string | null;
      atrasada: boolean;
    };

export interface LinhaDoDia {
  /** Tarefa com data anterior a hoje — o grupo que precisa de ação primeiro. */
  atrasado: ItemDaLinha[];
  /** Compromissos e tarefas de hoje. */
  hoje: ItemDaLinha[];
  /** Compromissos e tarefas de amanhã. */
  amanha: ItemDaLinha[];
  /** Tarefas de depois de amanhã e sem data. */
  depois: ItemDaLinha[];
}

/** Chave local `YYYY-MM-DD` de um Date — NUNCA `toISOString().slice`, que é UTC. */
export function chaveDeData(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

/**
 * `YYYY-MM-DD` de amanhã no fuso de quem olha — o valor que a ação "Amanhã"
 * manda no PATCH (a coluna `agendada_para` é date-only, sem fuso).
 */
export function chaveDeAmanha(agora: Date = new Date()): string {
  return chaveDeData(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
}

/** Hora local `HH:MM` de um Date. */
export function horaDe(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Soma dias a uma data local, devolvendo a chave `YYYY-MM-DD` do resultado. */
function chaveMaisDias(base: Date, dias: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias);
  return chaveDeData(d);
}

/**
 * Agrupa tarefas e compromissos nos quatro grupos da linha do tempo.
 *
 * Regras (aqui, e não no componente, para serem testáveis sem renderizar):
 *
 * - **atrasado**: tarefa cuja data é anterior a hoje. Compromisso perdido
 *   (se chegou no recorte) cai aqui também — é o mesmo "passou e não foi".
 * - **hoje/amanhã**: por chave local; compromissos ordenados por hora,
 *   tarefas (que não têm hora) entram depois, na ordem em que a API devolveu.
 * - **depois**: data futura além de amanhã e tarefas SEM data (não há onde
 *   colocá-las antes — elas são justamente o que não está marcado).
 * - compromisso `cancelled` não é compromisso: some da linha.
 */
export function agruparDoDia(op: {
  agora: Date;
  tarefas: TarefaDoDia[];
  compromissos: CompromissoDoDia[];
}): LinhaDoDia {
  const hoje = chaveDeData(op.agora);
  const amanha = chaveMaisDias(op.agora, 1);
  const linha: LinhaDoDia = { atrasado: [], hoje: [], amanha: [], depois: [] };

  for (const c of op.compromissos) {
    if (c.situacao === "cancelled") continue;
    const quando = new Date(c.iniciaEm);
    if (Number.isNaN(quando.getTime())) continue;
    const item: ItemDaLinha = {
      kind: "compromisso",
      id: c.id,
      titulo: c.titulo,
      contato: c.contato,
      quando,
      hora: horaDe(quando),
      situacao: c.situacao,
    };
    const chave = chaveDeData(quando);
    if (chave < hoje) linha.atrasado.push(item);
    else if (chave === hoje) linha.hoje.push(item);
    else if (chave === amanha) linha.amanha.push(item);
    else linha.depois.push(item);
  }

  for (const t of op.tarefas) {
    const item: ItemDaLinha = {
      kind: "tarefa",
      id: t.id,
      titulo: t.titulo,
      contato: t.contato,
      data: t.agendada_para,
      atrasada: t.agendada_para !== null && t.agendada_para < hoje,
    };
    if (t.agendada_para === null || t.agendada_para > amanha) linha.depois.push(item);
    else if (t.agendada_para < hoje) linha.atrasado.push(item);
    else if (t.agendada_para === hoje) linha.hoje.push(item);
    else linha.amanha.push(item);
  }

  // Compromisso com hora antes de tarefa sem hora, dentro de cada grupo.
  const porHora = (a: ItemDaLinha, b: ItemDaLinha): number => {
    if (a.kind === "compromisso" && b.kind === "tarefa") return -1;
    if (a.kind === "tarefa" && b.kind === "compromisso") return 1;
    if (a.kind === "compromisso" && b.kind === "compromisso") {
      return a.quando.getTime() - b.quando.getTime();
    }
    return 0;
  };
  linha.hoje.sort(porHora);
  linha.amanha.sort(porHora);
  linha.atrasado.sort((a, b) => {
    const da = a.kind === "tarefa" ? a.data ?? "" : chaveDeData(a.quando);
    const db = b.kind === "tarefa" ? b.data ?? "" : chaveDeData(b.quando);
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return linha;
}

/**
 * Saudação pelo relógio de quem olha. Os cortes (12h/18h) são apresentação,
 * não regra de negócio — por isso moram aqui e não num doc: trocá-los muda só
 * a frase na tela.
 */
export function saudacaoDoDia(agora: Date): string {
  const h = agora.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/** "sexta-feira, 2 de outubro" — data por extenso no fuso de quem olha. */
export function dataPorExtenso(agora: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(agora);
}

/**
 * Recorte instantâneo [hoje 00:00, amanhã 00:00) no fuso local — o dia
 * inteiro de quem olha. Instante, nunca o filtro `dia` da rota (que corta em
 * UTC e engole horas do dia de quem olha; ver o aviso em
 * `hooks/agenda/useAgendamentos.ts`).
 */
export function limitesDoDia(agora: Date): { de: string; ate: string } {
  const meiaNoite = (dias: number): Date =>
    new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + dias);
  return { de: meiaNoite(0).toISOString(), ate: meiaNoite(1).toISOString() };
}

/**
 * [hoje 00:00, depois-de-amanhã 00:00) — hoje + amanhã inteiros, a janela
 * que alimenta a linha do tempo (ela mostra Hoje e Amanhã).
 */
export function limitesDeHojeEAmanha(agora: Date): { de: string; ate: string } {
  const meiaNoite = (dias: number): Date =>
    new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + dias);
  return { de: meiaNoite(0).toISOString(), ate: meiaNoite(2).toISOString() };
}
