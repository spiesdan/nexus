/**
 * REGRA DE DESFECHO: não se registra entrega num endereço que o sistema
 * desconhece (auditoria 71/72, P0-2).
 *
 * O histórico e o comprovante guardam ONDE a entrega aconteceu. Sem endereço,
 * a baixa inventa um destino que ninguém consegue auditar depois. A política
 * do produto é explícita no código: "sem endereço não há ordem — corrija o
 * cadastro ou marque no mapa" (`_roteirizador.tsx`), "sem endereço — corrija
 * antes de incluir" (`_painel-pedidos.tsx`). Não há PRD que autorize entregar
 * sem endereço; o que existia era um botão verde habilitado sobre texto morto.
 *
 * O motorista NÃO pode marcar pino na cabine (`modoMarcar={false}`), então a
 * correção tem que acontecer na própria tela: campo de endereço + salvamento.
 * Esta função é a trava comum a todas as entradas de desfecho.
 */

export interface ParadaComEndereco {
  endereco?: string | null;
}

/** Endereço "conhecido" = texto não vazio. Pino aproximado não supre a falta. */
export function enderecoEhConhecido(endereco: string | null | undefined): boolean {
  return Boolean(endereco?.trim());
}

export function podeRegistrarDesfecho(parada: ParadaComEndereco | null | undefined): boolean {
  return enderecoEhConhecido(parada?.endereco);
}
