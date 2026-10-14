/**
 * A JANELA DE UM DIA, no fuso de quem pediu — não em UTC.
 *
 * ═══ POR QUE ISTO EXISTE ══════════════════════════════════════════════════
 *
 * A tela de pedidos filtra por `de`/`ate`, e o filtro era aplicado assim:
 *
 *   created_at >= "2026-10-14T00:00:00Z"
 *   created_at <  "2026-10-14T23:59:59.999Z"
 *
 * Isso é a janela do dia **em UTC**, e a janela do dia do dono é outra coisa.
 * O Brasil está em UTC−3 (horário de Brasília), então o dia 14/10 de quem
 * vende começa às `2026-10-14T03:00:00Z`:
 *
 *   14/10 00:00 em Brasília  =  14/10 03:00 UTC
 *   15/10 00:00 em Brasília  =  15/10 03:00 UTC
 *
 * ═══ O QUE A FRONTEIRA EM UTC FAZIA ════════════════════════════════════════
 *
 *   - Excluía os pedidos das 00:00 às 02:59 de Brasília — os três primeiros
 *     pedidos do dia, os de maior movimento logo na abertura.
 *   - Incluía os das 21:00 às 23:59 do dia SEGUINTE, que o dono não conta
 *     como "dia 14".
 *
 * Num dia de 60 pedidos, 4 ou 5 caem nessa janela. Não é erro que aparece em
 * amostra pequena: aparece quando alguém fecha o dia e o total não bate.
 *
 * ═══ POR QUE SEM LIBRARY ══════════════════════════════════════════════════
 *
 * `Intl.DateTimeFormat` com `timeZone` já está no runtime, e o repo já usa
 * esse caminho (`lib/lgpd/holidays-br.ts`, `lib/lgpd/sla-alarm.ts`,
 * `lib/auth/types.ts` traz o fuso do usuário). Trazer uma lib para converter
 * uma data seria dependência nova para uma função de vinte linhas.
 *
 * ═══ O CONVERSOR ══════════════════════════════════════════════════════════
 *
 * De "parede" local (14/10 00:00 em São Paulo) para instante UTC. O truque é
 * duas passadas: chute como se o offset fosse zero, mede o offset REAL desse
 * instante, e refaz com o offset medido. A segunda passada existe porque o
 * offset muda com o horário de verão — e é justamente na virada que um cálculo
 * de passagem única erra.
 */

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fuso de quem não tem preferência declarada. O Brasil não tem horário de verão desde 2019. */
export const FUSO_PADRAO = "America/Sao_Paulo";

/** Cache de fusos que o runtime realmente conhece. `Intl` NÃO valida: ele lança. */
const fusoConhecido = new Map<string, boolean>();

function fusoExiste(timeZone: string): boolean {
  const guardado = fusoConhecido.get(timeZone);
  if (guardado !== undefined) return guardado;
  let existe = true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    existe = false;
  }
  fusoConhecido.set(timeZone, existe);
  return existe;
}

/**
 * Minutos a SOMAR no instante para chegar à parede local (Brasília = −180).
 *
 * `Intl.DateTimeFormat` LANÇA em fuso que não conhece, e o fuso vem de
 * `user_metadata.timezone` — que é dado de usuário. Um fuso inválido ali
 * derrubaria a tela INTEIRA de pedidos com um `RangeError` vindo de dentro do
 * `.gte()`, e a causa (`timezone` do usuário) estaria a três quadros do erro.
 * Fuso ruim vira UTC, e a lista abre.
 */
function offsetMinutos(timeZone: string, em: Date): number {
  if (!fusoExiste(timeZone)) return 0;
  const nome =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(em)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = /GMT([+-])(\d{2}):?(\d{2})/.exec(nome);
  if (!m) return 0;
  const sinal = m[1] === "-" ? -1 : 1;
  return sinal * (Number(m[2]) * 60 + Number(m[3]));
}

/** "14/10 00:00 na parede de São Paulo" → o instante UTC correspondente. */
function instanteUtc(ano: number, mes: number, dia: number, hh: number, timeZone: string): Date {
  const chute = Date.UTC(ano, mes - 1, dia, hh, 0, 0, 0);
  // Passada 1: mede o offset com o chute.
  let resultado = chute - offsetMinutos(timeZone, new Date(chute)) * 60_000;
  // Passada 2: refaz com o offset do instante já corrigido. É a que acerta a
  // virada de horário de verão, onde o offset do chute é o outro.
  resultado = chute - offsetMinutos(timeZone, new Date(resultado)) * 60_000;
  return new Date(resultado);
}

export interface JanelaDoDia {
  /** Inclusivo, ISO-8601 UTC. */
  de: string;
  /** EXCLUSIVO, ISO-8601 UTC — o primeiro instante do dia SEGUINTE. */
  ate: string;
}

/**
 * A janela do dia `YYYY-MM-DD` no fuso dado.
 *
 * `ate` é **exclusivo** de propósito: é o início do dia seguinte, o que evita
 * o `23:59:59.999` — que deixa de fora um pedido gravado exatamente no último
 * milissegundo, e esse tipo de "quase" só aparece em Production.
 *
 * Devolve `null` para data inexistente (`2026-02-31`) ou mal formada, e o
 * chamador decide — o filtro, tratar como ausente; a validação, recusar.
 */
export function janelaDoDia(dia: string, timeZone: string = FUSO_PADRAO): JanelaDoDia | null {
  const m = DIA.exec(dia.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const diaNum = Number(m[3]);
  // `Date.UTC` normaliza mês 13 e dia 32 para o mês seguinte — que é exatamente
  // o que faz "2026-02-31" virar 3 de março e passar como se fosse válido.
  if (mes < 1 || mes > 12 || diaNum < 1 || diaNum > 31) return null;
  const referencia = new Date(Date.UTC(ano, mes - 1, diaNum));
  if (
    referencia.getUTCFullYear() !== ano ||
    referencia.getUTCMonth() !== mes - 1 ||
    referencia.getUTCDate() !== diaNum
  ) {
    return null;
  }
  // Dia seguinte: passa por `Date.UTC`, que normaliza 31/12 + 1 para 01/01.
  const seguinte = new Date(Date.UTC(ano, mes - 1, diaNum + 1));
  return {
    de: instanteUtc(ano, mes, diaNum, 0, timeZone).toISOString(),
    ate: instanteUtc(
      seguinte.getUTCFullYear(),
      seguinte.getUTCMonth() + 1,
      seguinte.getUTCDate(),
      0,
      timeZone,
    ).toISOString(),
  };
}

/**
 * Os dois extremos da tela de pedidos, no fuso de quem pediu.
 *
 * `de` e `ate` aceitam DIA (`2026-10-14`) ou INSTANTE (`2026-10-14T10:00`). O
 * instante é um ponto no tempo e passa direto — convertê-lo para o fuso mudaria
 * a hora que o usuário digitou. O dia é uma parede local e precisa da janela.
 */
export function extremosDoPeriodo(
  de: string | undefined,
  ate: string | undefined,
  timeZone: string = FUSO_PADRAO,
): { de: string | null; ate: string | null } {
  const extremo = (v: string | undefined, ehFim: boolean): string | null => {
    const bruto = (v ?? "").trim();
    if (bruto === "") return null;
    if (!DIA.test(bruto)) {
      // Só o que tem hora é instante; qualquer outra coisa é lixo e se descarta.
      return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(bruto) ? bruto : null;
    }
    const janela = janelaDoDia(bruto, timeZone);
    if (!janela) return null;
    return ehFim ? janela.ate : janela.de;
  };
  return { de: extremo(de, false), ate: extremo(ate, true) };
}