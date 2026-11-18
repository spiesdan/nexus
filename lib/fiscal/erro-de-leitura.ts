import { logger } from "@/lib/logger";

/**
 * LISTA FISCAL: ERRO DE LEITURA NÃO É LISTA VAZIA.
 *
 * Medido na auditoria 5.8: as cinco listas (`eventos`, `manifestações`,
 * `produtos`, `fornecedores`, `sincronizações`) ignoravam o `error` do
 * PostgREST. Quando a consulta falhava, a tela dizia “Nenhum evento recebido” /
 * “Nenhum fornecedor com nota ainda” — o operador concluía que não havia dado,
 * não que o dado não pôde ser lido. É o mesmo defeito que a ficha do pedido já
 * corrigiu (A11), com outra roupa.
 *
 * Lançar é deliberado: a error boundary da rota (`app/app/error.tsx`) oferece
 * “Tentar novamente” e mantém o `X-Request-Id` do Next. Devolver `[]` seria
 * escolher a mentira.
 */
export function exigirLeituraDeLista(
  error: { message: string } | null,
  recurso: string,
  organizationId: string,
): void {
  if (!error) return;
  logger.error(`fiscal: falha ao ler ${recurso}`, {
    organization_id: organizationId,
    erro: error.message.slice(0, 300),
  });
  throw new Error(`fiscal_${recurso}_indisponivel`);
}
