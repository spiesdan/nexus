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

/**
 * Filtra os embarcáveis pelo que a pessoa digita.
 *
 * Busca vazia devolve a lista inteira — sem filtro é o estado inicial, e uma
 * busca que esconde algo quando o campo está vazio é um filtro que "some com
 * pedido" sem explicar.
 */
export function filtrarEmbarcaveis<T extends PedidoBuscavel>(pedidos: T[], busca: string): T[] {
  const alvo = chaveDeBusca(busca);
  if (alvo === "") return pedidos;

  return pedidos.filter((p) => {
    // O número entra nas duas formas: `18558`, que é o que a pessoa digita
    // ouvindo no telefone, e `PED-18558`, que é o que ela lê na tela. Procurar
    // só um dos dois faz a busca "não funcionar" em metade das vezes sem
    // nenhum erro visível.
    const numeroCru = String(p.numero);
    const numeroFormatado = `ped-${String(p.numero).padStart(4, "0")}`;
    if (numeroCru.includes(alvo) || chaveDeBusca(numeroFormatado).includes(alvo)) return true;

    if (chaveDeBusca(p.cliente_nome).includes(alvo)) return true;
    if (chaveDeBusca(p.cliente_documento).includes(alvo)) return true;
    // O endereço carrega a cidade (`CIDADE/UF`) e é a única fonte dela.
    if (chaveDeBusca(p.endereco_entrega).includes(alvo)) return true;

    return false;
  });
}
