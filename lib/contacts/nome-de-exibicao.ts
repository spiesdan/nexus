/**
 * O NOME DO CLIENTE NO PEDIDO — uma regra, um lugar.
 *
 * Decisão do dono (18/11/2026): na tela de Pedidos, na busca de cliente e no
 * cadastro feito na hora de criar o pedido, **o nome fantasia vem primeiro**.
 * Sem fantasia, vale a razão social (PJ) ou o nome (PF). Sem nada, "Sem nome".
 *
 * A coluna existe e é documentada no baseline: `contacts.fantasia` — "Nome
 * fantasia (PJ). Razão social vai em name/display_name." O que faltava era a
 * PRECEDÊNCIA aplicada de forma única; cada tela repetia `display_name ?? name`,
 * e o pedido gravava um snapshot sem fantasia.
 *
 * Por que não reutilizar `rotuloDoContato` direto: aquele resolvedor é do canal
 * e responde "como chamar esta pessoa no WhatsApp" (display_name → name →
 * telefone). Aqui a pergunta é outra — é nome comercial/razão social de um
 * documento —, e o telefone NÃO serve de nome. Os dois compartilham a guarda de
 * identificador técnico, que não pode virar nome em nenhum dos dois.
 */
import { ehIdentificadorTecnico, SEM_NOME } from "./rotulo-do-contato";

/** O mínimo que o resolvedor precisa; aceita o contato inteiro sem cast. */
export interface ContatoComFantasia {
  fantasia?: string | null;
  display_name?: string | null;
  name?: string | null;
}

/**
 * A precedência do dono, na ordem: fantasia → display_name → name → "Sem nome".
 *
 * `fantasia` só de espaços não conta (o campo é texto livre no cadastro do
 * ERP). Identificador técnico também não: um `@lid` no `display_name` não pode
 * virar razão social no pedido.
 */
export function nomeDeExibicao(
  contato: ContatoComFantasia | null | undefined,
  t: (texto: string) => string = (texto) => texto,
): string {
  const candidatos = [contato?.fantasia, contato?.display_name, contato?.name];
  for (const bruto of candidatos) {
    const valor = (bruto ?? "").trim();
    if (valor !== "" && !ehIdentificadorTecnico(valor)) return valor;
  }
  return t(SEM_NOME);
}

/**
 * Sobrepõe o nome do snapshot pelo nome ATUAL do contato vinculado.
 *
 * Por que na leitura: `commercial_orders.cliente_nome` é snapshot — é o nome
 * que valia no dia do pedido, e é o que o documento fiscal/impresso usou. Pedido
 * antigo mostrar fantasia sem reescrever histórico é requisito da regra: quem
 * abrir a lista hoje vê o nome comercial de hoje, e o snapshot continua
 * intacto no banco para quem precisar do que foi impresso.
 *
 * Pedido sem vínculo (`contact_id` nulo) mantém o snapshot: não há cadastro de
 * onde tirar fantasia.
 */
export function comNomeDoContato<T extends { contact_id?: string | null; cliente_nome: string }>(
  linhas: readonly T[],
  contatosPorId: ReadonlyMap<string, ContatoComFantasia>,
): T[] {
  return linhas.map((linha) => {
    const contato = linha.contact_id ? contatosPorId.get(linha.contact_id) : undefined;
    if (!contato) return linha;
    return { ...linha, cliente_nome: nomeDeExibicao(contato) };
  });
}
