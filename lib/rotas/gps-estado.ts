/**
 * O ESTADO HONESTO DO GPS no escritório.
 *
 * Regra do dono (20/11/2026): nunca mostrar "online" por default. Sem posição,
 * dizer "sem posição"; com posição antiga, dizer "sem sinal há N min" e a hora
 * da última. O limite vem de `GPS_SEM_SINAL_MINUTOS` (declarado no env), não de
 * número mágico na tela.
 */
export function estadoDoGps(
  ultimaPosicaoEm: string | null,
  agoraMs: number,
  limiteMinutos: number,
  formatarHora: (iso: string) => string,
  t: (texto: string) => string,
): string | null {
  if (!ultimaPosicaoEm) return null;
  const quando = Date.parse(ultimaPosicaoEm);
  if (!Number.isFinite(quando)) return null;
  const hora = formatarHora(ultimaPosicaoEm);
  const minutos = Math.max(0, Math.floor((agoraMs - quando) / 60_000));
  const base = `${t("Última posição às")} ${hora}`;
  return minutos >= limiteMinutos
    ? `${base} · ${t("sem sinal há")} ${minutos} min`
    : base;
}
