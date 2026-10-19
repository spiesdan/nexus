/**
 * BUSCAR O PEDIDO QUE VAI EMBARCAR.
 *
 * A tela "Nova carga" listava os pedidos aprovados/faturados em bloco, sem
 * filtro. Com a fila grande, achar o pedido certo para montar a carga era obra
 * de rolagem e leitura linha a linha — e a pessoa que monta a carga está
 * normalmente no celular, no depósito, com a mão ocupada.
 *
 * ─── Por que a busca é aqui e não um `?busca=` na API ─────────────────────────
 *
 * A lista já vem no HTML com o resto da página: são até 200 pedidos, filtrados
 * por org e por status. Filtrar em memória é instantâneo e não custa uma
 * requisição por tecla. Mandar para o servidor só faria sentido se a fila fosse
 * maior do que o corte de 200 — e enquanto não for, a busca em memória é o
 * caminho mais barato. O corte está anotado em `app/app/expedicao/page.tsx`.
 *
 * ─── Por que a normalização é uma função, e não um `.replace()` no filtro ────
 *
 * Comparar texto com acento contra busca sem acento é o motivo número um de
 * busca "que não acha". O dado real é `São Paulo/SP`, `Curitibanos/SC`,
 * `REBOUCAS/PR` — e ninguém digita acento no celular. A comparação é feita com
 * os DOIS lados normalizados, então "sao paulo" acha "São Paulo" e
 * "curitibanos" acha "Curitibanos".
 *
 * ─── O que a busca cobre, e por quê ──────────────────────────────────────────
 *
 * - **Número do pedido**, das duas formas: `18558` e `PED-18558`. O número é o
 *   que a pessoa ouve no telefone e lê no romaneio; o `PED-` é o que aparece
 *   na tela. Procurar só um dos dois faz o filtro "não funcionar" em metade
 *   das vezes sem nenhum erro visível.
 * - **Nome do cliente**, sem acento e sem diferenciar caixa.
 * - **Cidade**, e aqui há um detalhe que muda o resultado: a cidade NÃO é um
 *   campo. Ela mora dentro de `endereco_entrega`, que é texto livre, no
 *   formato `CIDADE/UF` — medido no dado real:
 *
 *     Rua Evaristo da Veiga, 653, CASA — Ponta Grossa/PR
 *     RUA OROCIMBO CAETANO DA SILVA, 65 — VILA NOSSA SENHORA…, Curitibanos/SC
 *
 *   Não há coluna de cidade para filtrar. Buscar no endereço inteiro é o que
 *   funciona com o dado que existe — e, de brinde, achar o pedido também pelo
 *   nome da rua ou pelo bairro, que é como a pessoa costuma lembrar.
 * - **CNPJ/CPF do cliente**, porque é assim que pedido se localiza no balcão
 *   quando o nome está escrito de um jeito e o pedido de outro.
 */

import { chaveDoDia } from "@/lib/tempo/dia";

/** Tira acento, caixa e espaço extra — o mesmo tipo de chave usada em `lib/rotas/paradas.ts`. */
export function chaveDeBusca(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Só o que a busca precisa do pedido — não a linha inteira. */
export interface PedidoBuscavel {
  numero: number;
  cliente_nome: string | null;
  cliente_documento: string | null;
  endereco_entrega: string | null;
}

/** O que a tela filtra, além do texto livre. */
export interface FiltroDeEmbarque {
  busca?: string;
  /** Cidade: casa no endereço de entrega OU na cidade do cadastro do cliente. */
  cidade?: string;
  /** `AAAA-MM-DD` — dia de referência (previsão de entrega, ou criação). */
  de?: string;
  ate?: string;
}

/** O pedido com o que o filtro de cidade/data precisa ler. */
export interface PedidoFiltravel extends PedidoBuscavel {
  contact_id?: string | null;
  previsao_entrega?: string | null;
  created_at?: string | null;
}

/**
 * O DIA DE REFERÊNCIA do pedido para o filtro de data.
 *
 * `previsao_entrega` quando existe (é o dia em que a carga precisa sair) e,
 * quando não existe, o dia da criação — nunca `null`, senão o pedido some de
 * qualquer recorte por data e a pessoa conclui que ele não está na fila.
 *
 * A criação passa por `chaveDoDia` (fuso de São Paulo) para o recorte casar com
 * o que a tela mostra; cortar o ISO em UTC jogaria para o dia seguinte todo
 * pedido feito depois das 21h.
 */
export function diaDeReferencia(p: PedidoFiltravel): string | null {
  const previsao = p.previsao_entrega?.slice(0, 10);
  if (previsao) return previsao;
  return p.created_at ? chaveDoDia(new Date(p.created_at)) : null;
}

/**
 * A CIDADE do pedido como texto pesquisável: o endereço de entrega (quando
 * preenchido) mais a cidade/UF do cadastro do cliente.
 *
 * As duas fontes existem porque o dado real é assim: o endereço é digitado por
 * pedido e boa parte não tem; o cadastro do cliente é preenchido uma vez e vale
 * para todos. Filtrar só pelo endereço escondia quase a fila inteira.
 */
export function cidadeDoPedido(
  p: PedidoFiltravel,
  cidadeDoContato?: (contactId: string | null | undefined) => string | null,
): string {
  const doCadastro = p.contact_id ? (cidadeDoContato?.(p.contact_id) ?? "") : "";
  return chaveDeBusca(`${p.endereco_entrega ?? ""} ${doCadastro}`);
}

/** A cidade do pedido existe? (Para a tela dizer o que o filtro está escondendo.) */
export function temCidade(
  p: PedidoFiltravel,
  cidadeDoContato?: (contactId: string | null | undefined) => string | null,
): boolean {
  return cidadeDoPedido(p, cidadeDoContato) !== "";
}

/**
 * Filtra os embarcáveis pelo que a pessoa digita.
 *
 * Busca vazia devolve a lista inteira — sem filtro é o estado inicial, e uma
 * busca que esconde algo quando o campo está vazio é um filtro que "some com
 * pedido" sem explicar.
 */
export function filtrarEmbarcaveis<T extends PedidoBuscavel>(pedidos: T[], busca: string): T[] {
  return filtrarEmbarcaveisPor(pedidos, { busca });
}

/**
 * O filtro completo da tela: texto livre + cidade + período.
 *
 * `cidadeDoContato` é uma FUNÇÃO e não um mapa porque o mapa carrega só os
 * contatos da página; quem não estiver nele cai em "sem cidade" em vez de
 * quebrar.
 */
export function filtrarEmbarcaveisPor<T extends PedidoFiltravel>(
  pedidos: T[],
  filtro: FiltroDeEmbarque,
  cidadeDoContato?: (contactId: string | null | undefined) => string | null,
): T[] {
  const alvo = chaveDeBusca(filtro.busca ?? "");
  const cidade = chaveDeBusca(filtro.cidade ?? "");
  const de = (filtro.de ?? "").slice(0, 10);
  const ate = (filtro.ate ?? "").slice(0, 10);

  return pedidos.filter((p) => {
    if (alvo !== "") {
      // O número entra nas duas formas: `18558`, que é o que a pessoa digita
      // ouvindo no telefone, e `PED-18558`, que é o que ela lê na tela. Procurar
      // só um dos dois faz a busca "não funcionar" em metade das vezes sem
      // nenhum erro visível.
      const numeroCru = String(p.numero);
      const numeroFormatado = `ped-${String(p.numero).padStart(4, "0")}`;
      const casou =
        numeroCru.includes(alvo) ||
        chaveDeBusca(numeroFormatado).includes(alvo) ||
        chaveDeBusca(p.cliente_nome).includes(alvo) ||
        chaveDeBusca(p.cliente_documento).includes(alvo) ||
        chaveDeBusca(p.endereco_entrega).includes(alvo);
      if (!casou) return false;
    }

    if (cidade !== "" && !cidadeDoPedido(p, cidadeDoContato).includes(cidade)) return false;

    if (de !== "" || ate !== "") {
      const dia = diaDeReferencia(p);
      // Sem data de referência o pedido não pode afirmar que está no recorte:
      // fica de fora, e a tela mostra quantos ficaram (nunca invisível).
      if (!dia) return false;
      if (de !== "" && dia < de) return false;
      if (ate !== "" && dia > ate) return false;
    }

    return true;
  });
}
