/**
 * Janela de coleta do Mercos — regra pura, sem rede.
 *
 * No fluxo normal `de`/`ate` derivam do último pedido importado. A recuperação
 * operacional de pedidos antigos (fev/2026 coletados e nunca importados) usa
 * MERCOS_DE/MERCOS_ATE explicitamente: os dois juntos, formato DD/MM/AAAA.
 * O log marca `recuperacao_periodo` para o artefato não esconder o backfill.
 */

const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function validarDataBr(valor) {
  const m = RE_DATA.exec(String(valor ?? "").trim());
  if (!m) return false;
  const [, dd, mm, aaaa] = m;
  const dia = Number(dd);
  const mes = Number(mm);
  const ano = Number(aaaa);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function formataBr(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date);
}

/**
 * `ultimoCreatedAt` é o created_at do último pedido importado (ISO), ou null.
 * `agoraMs` entra como argumento para o teste não depender do relógio.
 */
export function janelaDeColeta({
  agoraMs,
  ultimoCreatedAt = null,
  overrideDe = null,
  overrideAte = null,
  diasPadrao = 30,
}) {
  const deValido = validarDataBr(overrideDe);
  const ateValido = validarDataBr(overrideAte);
  if (Boolean(overrideDe) || Boolean(overrideAte)) {
    if (!deValido || !ateValido) {
      throw new Error("MERCOS_DE e MERCOS_ATE devem vir juntos, em DD/MM/AAAA válido.");
    }
    return { de: overrideDe.trim(), ate: overrideAte.trim(), recuperacao: true };
  }

  const agora = new Date(agoraMs);
  const inicio = ultimoCreatedAt
    ? new Date(ultimoCreatedAt)
    : new Date(agoraMs - diasPadrao * 86_400_000);
  return {
    de: formataBr(new Date(inicio.getTime() - 86_400_000)),
    ate: formataBr(new Date(agoraMs + 86_400_000)),
    recuperacao: false,
  };
}
