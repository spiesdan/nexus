/**
 * QUEM É O CLIENTE — lido do texto do pedido do Mercos, longe do navegador.
 *
 * ═══ Por que este arquivo existe ═════════════════════════════════════════
 *
 * O parser do cliente já custou duas famílias de defeito em produção:
 *
 *   1. o CNPJ da REPRESENTADA virava o cliente (o primeiro CNPJ da página é
 *      o da própria empresa, não o do comprador);
 *   2. quando o cliente NÃO tem CNPJ/CPF no cadastro, a âncora do documento
 *      não existe — e `razao`/`fantasia` saíam nulos. O importador então caía
 *      no nome da LISTA, que vem com o rótulo de pagamento ("event AVISTA"),
 *      com o selo de status ("- Concluído") e com o ícone colado. Foi assim
 *      que pedidos nasceram como "event AVISTA -  ADAO JOSE KAMITEKOSKI".
 *
 * O bloco do DETALHE empilha, nesta ordem:
 *
 *     Cliente
 *     1
 *     Listar todos clientes
 *     <fantasia do cliente>          ← nome quando não há documento
 *     - <razão social>               ← nome quando há documento
 *     - <CNPJ/CPF>
 *     <telefone>
 *     <cidade>, <uf>
 *     Trocar cliente
 *     Representada                   ← fim do escopo do cliente
 *     ...
 *
 * A regra é uma só: o escopo termina em "Representada"; o documento é o
 * primeiro CNPJ/CPF DENTRO do escopo; e o nome vem da linha anterior ao
 * documento ou, quando ele não existe, da linha logo depois de
 * "Listar todos clientes".
 *
 * O cartão da LISTA é outra coisa — e é só reserva:
 *
 *     #19433 emitido por VENDEDOR JB
 *     Concluído
 *     <ícone> ADAO JOSE KAMITEKOSKI
 *     event AVISTA
 *     R$ 73,00
 *
 * Ancorar em posição fixa (iNum+2/iNum+3) trocava pagamento por nome. Aqui o
 * nome é a primeira linha de conteúdo depois do status, e o rótulo de
 * pagamento ("event ...") marca o fim.
 *
 * Este módulo é PURO: recebe linhas e devolve dados. É o que permite cobrir
 * os casos reais em teste, sem navegador e sem Mercos.
 */

/** Ícones Material entram no innerText como caracteres da área de uso privado. */
const semIcone = (linha) => (linha || "").replace(/[\uE000-\uF8FF]/g, "").trim();

const RE_DOC = /^-?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/;

const ROTULOS =
  /^(Listar todos clientes|Trocar cliente|Cliente|Nova representada|Listar todas representadas|Representada)$/i;

/**
 * Quando o ERP não tem cliente nenhum no pedido (bloco vazio) ou o "cliente"
 * é o cadastro da própria empresa, o pedido não pode simplesmente sumir: ele
 * entra sob o contato canônico da organização. É a mesma regra aplicada na
 * correção dos pedidos históricos.
 */
export const CONSUMIDOR_FINAL = "CONSUMIDOR FINAL";

const soDigitos = (documento) => (documento || "").replace(/\D/g, "");

/** Status do cartão da lista — nunca é nome de cliente. */
const STATUS_DO_CARTAO = [
  "Concluído",
  "Em orçamento",
  "Cancelado",
  "Expedido",
  "Aprovado",
  "Faturado",
  "Parcialmente Faturado",
  "Aguardando Faturamento",
];

const ehStatusDoCartao = (linha) =>
  STATUS_DO_CARTAO.includes(linha) ||
  // "Faturado Concluído" é o par selo+status que o cartão mostra junto.
  /^(Faturado\s+)?Concluído$/i.test(linha) ||
  // O nome do ícone vira texto quando o Material Symbols não carrega.
  linha === "auto_awesome";

/**
 * Lê o bloco do cliente a partir das linhas do detalhe do pedido.
 * Devolve `{ razao, documento, fantasia, telefone, cidade }`, com `null` em
 * tudo que a página não trouxer — nunca inventa.
 *
 * `documentoRepresentada` é o CNPJ/CPF do BLOCO "Representada", que vem
 * depois do cliente. Quando os dois documentos são o mesmo, o pedido foi
 * cadastrado no nome da própria empresa (o caso "CLIENTE ONLINE" da loja
 * virtual e os pedidos internos) — não há comprador identificado, e o
 * documento não pode ser gravado como se fosse do cliente.
 */
export function lerCliente(linhas, { documentoRepresentada = null } = {}) {
  // O bloco do cliente começa em "Listar todos clientes" e o escopo termina
  // em "Representada". Ancorar as duas pontas é o que impede o CNPJ da
  // própria empresa (que vem depois) de virar documento do comprador.
  const iRepresentada = linhas.findIndex((l) => /^[^\w]*\s*Representada\s*$/i.test(l));
  const escopo = iRepresentada > -1 ? linhas.slice(0, iRepresentada) : linhas;
  const iListar = escopo.findIndex((l) => /^Listar todos clientes$/i.test(l));
  const bloco = iListar > -1 ? escopo.slice(iListar) : escopo;

  const jDoc = bloco.findIndex((l) => RE_DOC.test(l));
  const tiraPrefixo = (l) => (l || "").replace(/^[-–]\s*/, "").trim();

  const documento = jDoc > -1 ? (bloco[jDoc].match(RE_DOC) || [])[1] ?? null : null;

  // ── Cliente COM documento: a razão é a linha anterior ao CNPJ/CPF e a
  // fantasia é a anterior a ela (quando não começa com "-", que seria outra
  // linha da razão).
  const razaoComDoc = jDoc > 0 ? tiraPrefixo(bloco[jDoc - 1]) : null;
  const anterior = jDoc > 1 ? bloco[jDoc - 2] : null;
  const fantasiaComDoc =
    anterior && !/^[-–]/.test(anterior) && !ROTULOS.test(anterior.trim()) ? anterior.trim() : null;

  // ── Cliente SEM documento: não há âncora de CNPJ/CPF. O nome é a linha
  // logo depois de "Listar todos clientes". Se essa linha for só ícone ou um
  // rótulo do bloco, não há cliente selecionado.
  const brutoNome = bloco[1] ?? "";
  const nome = semIcone(brutoNome);
  const nomeSemDoc = nome && !ROTULOS.test(nome) ? nome : null;
  // Pode vir como "- razão social" quando o Mercos esconde a fantasia.
  const nomeComPrefixo = Boolean(nomeSemDoc && /^[-–]/.test(brutoNome));

  // Telefone e cidade vêm nas linhas seguintes — ao documento, quando existe;
  // ao nome, quando não existe.
  const inicioJanela = jDoc > -1 ? jDoc + 1 : nomeSemDoc ? 2 : -1;
  const janela = inicioJanela > -1 ? bloco.slice(inicioJanela, inicioJanela + 3) : [];
  const soNumero = (l) => (l || "").replace(/[^\d()\s-]/g, "").trim();
  const linhaFone = janela.find(
    (l) => /\(\d{2}\)\s?\d{4,5}-?\d{4}|\d{4,5}-\d{4}/.test(soNumero(l)) && soNumero(l).length >= 8,
  );
  const telefone = linhaFone ? soNumero(linhaFone) || null : null;
  const linhaCidade = janela.find((l) => l.includes(",") && !/^[^\w(]*\s*[\d.,/-]+$/.test(l.trim()));
  const cidade = linhaCidade ? linhaCidade.replace(/^[^\w(]*\s*/, "").trim() : null;

  // Cliente cadastrado com o documento da própria empresa não identifica
  // ninguém: o pedido é de consumidor final e o documento é descartado.
  const documentoDaPropriaEmpresa =
    soDigitos(documento) !== "" && soDigitos(documento) === soDigitos(documentoRepresentada);
  if (documentoDaPropriaEmpresa) {
    return { razao: null, documento: null, fantasia: CONSUMIDOR_FINAL, telefone: null, cidade: null };
  }

  return {
    razao: jDoc > -1 ? razaoComDoc : nomeComPrefixo ? tiraPrefixo(nome) : null,
    documento,
    // Com documento, a fantasia só existe se houver uma linha própria antes
    // da razão. Sem documento, a linha depois de "Listar todos clientes" é o
    // próprio nome — e vira fantasia para o importador usá-lo.
    fantasia: jDoc > -1 ? fantasiaComDoc : nomeComPrefixo ? null : nomeSemDoc,
    telefone,
    cidade,
  };
}

/**
 * Lê o cartão da lista. É só reserva para quando o detalhe falha — mas é a
 * reserva que já colocou "event AVISTA" e "- Concluído" no nome do cliente.
 */
export function lerCartao(linhas) {
  const iNum = linhas.findIndex((l) => /^#\d{3,8}/.test(l));
  if (iNum < 0) {
    return { numero: null, status: null, vendedor_lista: null, razao_lista: null, fantasia_lista: null };
  }

  const numero = Number(linhas[iNum].match(/#(\d{3,8})/)[1]);
  const vendedor_lista =
    linhas[iNum].match(/emitido por\s+(.+?)(?:\s+R\$|\s*$)/i)?.[1]?.trim() ?? null;
  const status = STATUS_DO_CARTAO.find((s) => linhas.some((l) => l === s)) ?? null;

  // O nome é a primeira linha de conteúdo depois do status. O ícone do
  // cliente vem colado na frente; o rótulo de pagamento ("event ...") e o
  // valor ("R$ ...") fecham o bloco.
  let razao_lista = null;
  let fantasia_lista = null;
  for (let i = iNum + 1; i < linhas.length; i++) {
    const bruto = linhas[i];
    const limpo = semIcone(bruto);
    if (!limpo) continue;
    if (/^event\b/i.test(limpo) || /^R\$/.test(limpo)) break;
    if (ehStatusDoCartao(limpo)) continue;
    if (!razao_lista) {
      razao_lista = limpo;
      continue;
    }
    // A linha seguinte, colada e sem ícone, é a fantasia ("NEOVIA ENGENHARIA").
    fantasia_lista = limpo;
    break;
  }

  return { numero, status, vendedor_lista, razao_lista, fantasia_lista };
}
