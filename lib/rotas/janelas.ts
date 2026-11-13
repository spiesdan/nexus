/**
 * JANELAS DE ENTREGA — conversão entre hora do dia e minuto.
 *
 * A janela é o horário que o cliente combinou (`time` no banco, "HH:MM:SS").
 * O solver trabalha em MINUTOS desde a saída da base. As duas grandezas só se
 * encontram quando existe uma hora de saída (`shipments.saida_prevista`) — sem
 * ela, não há como dizer "chegar entre 14h e 16h" para quem ainda não sabe a
 * que horas sai. Nada aqui inventa uma saída padrão.
 */

/** "14:30:00" → 870. Inválido/vazio → null. */
export function minutosDoDia(hora: string | null | undefined): number | null {
  if (!hora) return null;
  const partes = hora.split(":");
  if (partes.length < 2) return null;
  const h = Number(partes[0]);
  const m = Number(partes[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** 870 → "14:30". Fora do dia dá a volta (1530 → "01:30"). */
export function horaDoMinuto(minuto: number): string {
  const normalizado = ((Math.round(minuto) % 1440) + 1440) % 1440;
  const h = Math.floor(normalizado / 60);
  const m = normalizado % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** `14:30` → `14:30`; o banco devolve segundos, a tela não precisa deles. */
export function horaCurta(hora: string | null | undefined): string | null {
  const min = minutosDoDia(hora);
  return min == null ? null : horaDoMinuto(min);
}

/** "07:30" (input type=time) → "07:30:00" (coluna `time`). */
export function horaParaColuna(hora: string | null | undefined): string | null {
  const min = minutosDoDia(hora);
  if (min == null) return null;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}:00`;
}
