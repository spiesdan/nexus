/**
 * AS REGRAS DO AGENDAMENTO — funções puras, sem banco e sem relógio de sistema
 * (o instante chega por parâmetro). É a régua que o motor do tick e o teste
 * exercitam, e a única coisa que decide "pode mandar agora?".
 *
 * ═══ A ORDEM DAS RECUSAS, E POR QUE ELA IMPORTA ═════════════════════════
 *
 * Período → dia da semana → janela → cota → intervalo. A ordem é do mais
 * ESTRUTURAL ao mais circunstancial:
 *
 *   1. PERÍODO  ("do dia 19/10 ao 23/10") — fora dele a campanha nem devia
 *      estar agendada; recusar aqui é o que faz o tick "parar sozinho".
 *   2. DIA      ("de segunda a sexta") — é o CALENDÁRIO. Vem antes da janela
 *      porque um sábado fora dos dias escolhidos não é "fora do horário": sem
 *      este motivo separado, o operador que lê "fora da janela" num sábado
 *      desligado procuraria o defeito no horário.
 *   3. JANELA   ("das 7 às 12 e das 13 às 19") — é o RELÓGIO do dia.
 *   4. COTA     — é o DIA inteiro. Confundir cota com janela faz o operador
 *      achar que "não mandou" quando na verdade **já mandou tudo hoje**: a
 *      cota estourou às 10h e a janela das 13h está aberta — recusar por cota
 *      (e não por janela) é o que deixa o motivo certo na tela.
 *   5. INTERVALO ("uma por minuto") — o ritmo entre duas mensagens.
 *
 * O `"concluida"` existe no tipo porque quem decide que "não sobra prospect" é
 * o MOTOR (ele enxerga o ledger), não esta função — aqui só os quatro primeiros
 * motivos acontecem.
 */
import { offsetEmMinutos, partesNoFuso } from "@/lib/agenda/fuso";
import { dentroDaJanela, fusoSeguro, relogioNoFuso } from "@/lib/venda-automatica/janela";

/**
 * Uma janela do dia, em HH:MM no fuso da organização.
 */
export interface JanelaDoDia {
  inicio: string;
  fim: string;
  /**
   * Os DIAS DA SEMANA em que esta janela vale — 0 = domingo … 6 = sábado, o
   * MESMO `getUTCDay()` de quem monta a tela.
   *
   * Ausente ou vazia = TODOS os dias: é a campanha que não escolheu dias (e
   * toda campanha agendada antes de 1.31), e tratá-la como "nenhum dia" a
   * deixaria parada com a janela aberta na tela — o defeito silencioso que
   * este arquivo existe para tornar impossível.
   */
  dias?: number[];
}

/** Por que o tick espera. A tela mostra o rótulo, nunca o código. */
export type MotivoDeEspera =
  | "fora_do_periodo"
  | "fora_do_dia"
  | "fora_da_janela"
  | "intervalo"
  | "cota_do_dia"
  | "concluida";

/**
 * O dia (`YYYY-MM-DD`) está dentro do período? Início/fim nulos são "sem
 * limite" DAQUELE lado — e os dois nulos é "sem período" (sempre dentro).
 *
 * Comparação lexicográfica de `YYYY-MM-DD` é correta (mesmo comprimento).
 */
export function dentroDoPeriodo(
  dia: string,
  inicio: string | null,
  fim: string | null,
): boolean {
  if (inicio && dia < inicio) return false;
  if (fim && dia > fim) return false;
  return true;
}

/**
 * O dia da semana de um `YYYY-MM-DD` — 0 = domingo … 6 = sábado, em UTC.
 *
 * `Date.UTC` de propósito: o dia JÁ é um dia de calendário no fuso da org
 * (quem o calculou foi `relogioNoFuso`), e reler a meia-noite local de quem
 * roda o worker daria o dia errado para quem está a leste de Greenwich.
 *
 * `null` quando o texto não é uma data: quem chama trata como "sem filtro de
 * dia" em vez de recusar tudo por causa de um campo torto.
 */
export function diaDaSemanaDe(dia: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return null;
  const instante = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dow = new Date(instante).getUTCDay();
  return Number.isInteger(dow) ? dow : null;
}

/** A janela vale naquele dia da semana? `dias` ausente/vazia = todos. */
export function janelaValeNoDia(janela: JanelaDoDia, diaDaSemana: number): boolean {
  const dias = janela.dias;
  if (!dias || dias.length === 0) return true;
  return dias.includes(diaDaSemana);
}

/**
 * Alguma janela vale para HOJE? É o portão que separa "hoje não é um dos dias
 * escolhidos" de "hoje é, mas agora está fora do horário" — dois motivos
 * distintos na tela.
 *
 * Lista vazia (campanha sem horário) e dia ilegível devolvem `true`: o filtro
 * de dia só existe quando o operador escolheu dias.
 */
export function dentroDeAlgumDia(
  janelas: JanelaDoDia[],
  diaDaSemana: number | null,
): boolean {
  if (janelas.length === 0 || diaDaSemana === null) return true;
  return janelas.some((j) => janelaValeNoDia(j, diaDaSemana));
}

/**
 * Está aberta alguma das janelas de HOJE? Lista VAZIA = sem restrição (sempre
 * dentro) — é o caso da campanha que não escolheu horário, e tratá-la como
 * "fechada" deixaria a campanha parada sem explicação.
 *
 * ⚠️ A janela só conta no DIA dela. Sem esta amarração, duas janelas com dias
 * diferentes se somariam: "sábado das 8 às 17" + "segunda das 20 às 22" abriria
 * a SEGUNDA ÀS 10H — o dia da segunda casaria pelo segundo elemento e a hora
 * pelo primeiro.
 */
export function dentroDeAlgumaJanela(
  agoraIso: string,
  fuso: string | null,
  janelas: JanelaDoDia[],
): boolean {
  if (janelas.length === 0) return true;
  const seguro = fusoSeguro(fuso);
  const diaDaSemana = diaDaSemanaDe(relogioNoFuso(agoraIso, seguro).dia);
  return janelas.some(
    (j) =>
      (diaDaSemana === null || janelaValeNoDia(j, diaDaSemana)) &&
      dentroDaJanela(agoraIso, seguro, j.inicio, j.fim),
  );
}

/**
 * O instante UTC da MEIA-NOITE LOCAL daquele dia no fuso da organização.
 *
 * É com ele que a cota do dia é contada: contar em UTC faria o dia virar às 21h
 * locais (São Paulo, UTC-3) e "50 por dia" viraria "50 a cada 21 horas" — o
 * operador veria a cota reiniciar antes da meia-noite dele.
 *
 * Duas passadas porque o offset depende do instante (horário de verão): a
 * primeira lê o offset no palpite, a segunda corrige com o offset do instante
 * encontrado. É a mesma escolha de `instanteDe` (`lib/agenda/fuso.ts`) para a
 * hora que não existe no salto.
 */
export function inicioDoDiaNoFuso(agoraIso: string, fuso: string | null): string {
  const seguro = fusoSeguro(fuso);
  const instante = new Date(agoraIso);
  const p = partesNoFuso(instante, seguro);
  const alvoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, 0, 0, 0);
  const primeiro = alvoUtc - offsetEmMinutos(new Date(alvoUtc), seguro) * 60_000;
  const segundo = alvoUtc - offsetEmMinutos(new Date(primeiro), seguro) * 60_000;
  return new Date(segundo).toISOString();
}

export interface EstadoDoEnvio {
  agoraIso: string;
  fuso: string | null;
  janelas: JanelaDoDia[];
  dataInicio: string | null;
  dataFim: string | null;
  /** Carimbo do último envio da campanha (`ultimo_envio_at`); null = nunca. */
  ultimoEnvioAt: string | null;
  espacoMs: number;
  /** Envios de HOJE desta campanha — é o que a cota dela conta. */
  enviadosHoje: number;
  /** A cota do dia desta campanha (`limite_diario`). */
  limiteDiario: number;
  /**
   * A cota do NÚMERO — a MESMA régua que o agente de IA obedece: todo envio do
   * dia pelo mesmo WhatsApp, de qualquer origem (as campanhas e o agente),
   * contra o teto do número.
   *
   * Ausente = sem leitura, e o motor não inventa teto. `Infinity` é "número
   * formado": o teto do CRM não limita.
   */
  enviadosHojeDoNumero?: number;
  tetoDoNumero?: number;
}

/**
 * Pode mandar AGORA? Devolve `{pode:true}` ou o PRIMEIRO motivo que recusou,
 * na ordem documentada no topo do arquivo.
 */
export function podeEnviarAgora(
  p: EstadoDoEnvio,
): { pode: true } | { pode: false; motivo: MotivoDeEspera } {
  const { dia } = relogioNoFuso(p.agoraIso, fusoSeguro(p.fuso));

  if (!dentroDoPeriodo(dia, p.dataInicio, p.dataFim)) {
    return { pode: false, motivo: "fora_do_periodo" };
  }
  // O CALENDÁRIO antes do RELÓGIO: sábado fora dos dias escolhidos não é
  // "fora do horário", e o motivo errado faria o operador conferir a janela.
  if (!dentroDeAlgumDia(p.janelas, diaDaSemanaDe(dia))) {
    return { pode: false, motivo: "fora_do_dia" };
  }
  if (!dentroDeAlgumaJanela(p.agoraIso, p.fuso, p.janelas)) {
    return { pode: false, motivo: "fora_da_janela" };
  }
  // A cota é do DIA, não do relógio: quando ela estoura, a janela aberta não
  // muda nada — e o motivo tem de dizer cota, não janela.
  if (p.enviadosHoje >= p.limiteDiario) {
    return { pode: false, motivo: "cota_do_dia" };
  }
  // A cota do NÚMERO, logo depois da cota da campanha e ANTES do intervalo: as
  // duas são "cota do dia" (mesmo motivo, mesma tela), e o teto do número manda
  // quando é menor. Sem esta linha a campanha furava o warm-up que o agente de
  // IA respeita — o número recebia 50 do disparo no dia em que o próprio
  // produto diz que 20 é o seguro. Quem paga o banimento é o WhatsApp da
  // empresa, não a campanha.
  if (
    p.tetoDoNumero !== undefined &&
    p.enviadosHojeDoNumero !== undefined &&
    p.enviadosHojeDoNumero >= p.tetoDoNumero
  ) {
    return { pode: false, motivo: "cota_do_dia" };
  }
  if (p.ultimoEnvioAt) {
    const ultimo = Date.parse(p.ultimoEnvioAt);
    const agora = Date.parse(p.agoraIso);
    if (Number.isFinite(ultimo) && Number.isFinite(agora) && agora - ultimo < p.espacoMs) {
      return { pode: false, motivo: "intervalo" };
    }
  }
  return { pode: true };
}
