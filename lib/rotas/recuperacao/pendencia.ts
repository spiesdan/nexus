/**
 * QUEM REALMENTE BLOQUEIA A OTIMIZAÇÃO — uma régua, dois consumidores.
 *
 * A pergunta "esta carga pode ser roteirizada?" aparecia em dois lugares que
 * respondiam com réguas diferentes (medido em 15/11/2026, na jornada de entrada
 * do endereço):
 *
 *   - o servidor (`.../rota/otimizar`) recusa quando o destino não está
 *     resolvido: status `nao_tentada`/`ambiguo` **e** sem pino válido;
 *   - o painel de recuperação (`.../rota/recuperacoes`) contava todo destino
 *     que não fosse `encontrado`/`recuperado` — inclusive os que já têm pino
 *     bom — e escrevia "A otimização fica bloqueada enquanto houver endereço
 *     sem confirmação".
 *
 * O resultado era uma tela que mentia contra o próprio servidor: o operador
 * marcava a entrada, a otimização rodava e o painel continuava dizendo que
 * estava bloqueada. Aviso que não corresponde ao efeito ensina a ignorar
 * avisos — e o próximo, que for verdadeiro, é ignorado junto.
 *
 * A regra é a do servidor porque é ela que decide o que acontece; a tela tem
 * de mostrar o mesmo. Quem quiser só a lista de endereços que o motor de
 * recuperação ainda não resolveu continua olhando `recuperacao_status` — isso é
 * outra pergunta, e não é a de bloquear.
 */
export interface DestinoParaPendencia {
  recuperacao_status: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string | null;
}

/**
 * Este destino impede otimizar a rota?
 *
 * Sim só quando o endereço nunca foi resolvido (`nao_tentada`/`ambiguo`) **e**
 * não existe pino utilizável. Destino que já tem coordenada com
 * `geo_status = 'ok'` — inclusive o que veio da memória de uma entrada marcada
 * (0311) — nunca bloqueia: a rota não pode parar por causa de um campo de
 * recuperação que já não muda nada no mapa.
 */
export function bloqueiaOtimizacao(d: DestinoParaPendencia): boolean {
  const status = d.recuperacao_status ?? "nao_tentada";
  if (status !== "nao_tentada" && status !== "ambiguo") return false;
  return d.latitude == null || d.longitude == null || d.geo_status !== "ok";
}
