import type { LinhaRadar } from "@/lib/comercial/radar-score";

import type { LinhaRadarLista } from "./RecompraRadarList";

/**
 * A ponte entre o que a rota devolve e o que o cálculo do radar espera.
 *
 * Existia dentro do `RadarDashboard` e desceu para cá quando as seções
 * viraram telas: três delas fazem a mesma conversão, e três cópias divergem no
 * dia em que a rota ganhar um campo.
 */
export function paraLinha(l: LinhaRadarLista): LinhaRadar {
  return {
    contact_id: l.contact_id,
    nome: l.nome,
    fone: l.fone,
    cidade: l.cidade ?? null,
    uf: l.uf ?? null,
    vendedor_user_id: l.vendedor_user_id ?? null,
    qtd_pedidos: l.qtd_pedidos,
    ticket_medio_cents: l.ticket_medio_cents,
    intervalo_mediano_dias: l.intervalo_mediano_dias,
    intervalo_medio_dias: l.intervalo_medio_dias,
    dias_sem_compra: l.dias_sem_compra,
    atraso_dias: l.atraso_dias,
    situacao: l.situacao,
    ultima_compra: l.ultima_compra,
    ultimos: l.ultimos,
  };
}

/**
 * Link de WhatsApp com a mensagem já escrita.
 *
 * `null` (e não um `href` vazio) quando não dá para abrir: telefone ausente ou
 * curto demais. Um botão que existe e não leva a lugar nenhum é pior que um
 * botão a menos.
 */
export function zapHref(
  fone: string | null,
  nome: string,
  atraso: number,
  intervalo: number | null,
): string | null {
  if (!fone) return null;
  const digitos = fone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const msg =
    intervalo != null
      ? `Olá ${nome}! Você costuma comprar a cada ~${Math.round(intervalo)} dias e já passou ${atraso} dias do padrão. Posso preparar seu pedido?`
      : `Olá ${nome}! Faz tempo que você não compra com a gente. Posso preparar uma condição para você voltar?`;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(msg)}`;
}
