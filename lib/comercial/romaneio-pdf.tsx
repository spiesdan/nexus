/**
 * O ROMANEIO DE CARGA — o papel que o motorista leva.
 *
 * ─── A ESTRUTURA É A DO ODVIX, QUE A OPERAÇÃO JÁ CONHECE ────────────────────
 *
 * O dono da operação pediu para copiar o romaneio do sistema que ele usava.
 * Lá o papel é assim, e nesta ordem:
 *
 *   1. cabeçalho: empresa à esquerda, "Romaneio Nº" ao centro, contato à direita;
 *   2. uma faixa de dados: Data · Nº Docs · Descrição (as cidades) · totais;
 *   3. a tabela de PEDIDOS que compõem a carga (origem, nº, emissão, cliente,
 *      condição de pagamento);
 *   4. a tabela de PRODUTOS consolidada — o que carregar, com quantidade,
 *      valor unitário, valor total e peso;
 *   5. os totais no rodapé.
 *
 * O que NÃO veio de lá, de propósito: o endereço de entrega em cada pedido.
 * O Odvix não faz rota — ele é ERP de balcão; aqui o papel é de quem dirige, e
 * sem endereço o motorista não entrega. Ele entra como segunda linha do
 * cliente, discreto, sem quebrar a tabela.
 *
 * Os pesos só aparecem quando existem: no Odvix a carga saía com "0,000 Kg" em
 * toda linha, e coluna inteira de zero é ruído, não informação.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { numeroDaCarga } from "@/lib/schemas/expedicao";

const styles = StyleSheet.create({
  page: { padding: 22, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: "1pt solid #d1d5db",
    paddingBottom: 5,
    marginBottom: 5,
  },
  // O nome do emitente é longo (razão social inteira) e empurrava o título
  // por cima dele. Ele encolhe/quebra; o título e o contato não.
  // 10,5 e não 13: o cabeçalho é identificação, não manchete — no papel o nome
  // da empresa ocupava a faixa inteira e o romaneio é lido a um braço de
  // distância, no volante. O corpo da tabela é 8–9, então 10,5 ainda é o maior
  // texto do cabeçalho sem virar título de cartaz.
  emitente: { fontSize: 10.5, fontWeight: "bold", color: "#1e3a5f", maxWidth: "48%", flexShrink: 1 },
  // O NÚMERO DA CARGA é o que o motorista procura primeiro no papel — e ele
  // era o mesmo cinza do resto do cabeçalho, colado na palavra "Romaneio".
  // Agora "Romaneio" é rótulo pequeno em cima e o número sai grande e na cor
  // do emitente. É a única informação do topo que precisa ser lida a distância.
  tituloBloco: { flexShrink: 0, marginHorizontal: 8, alignItems: "center" },
  tituloRotulo: {
    fontSize: 7,
    color: "#6b7280",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tituloNumero: { fontSize: 15, fontWeight: "bold", color: "#1e3a5f", marginTop: 1 },
  contato: { fontSize: 7.5, color: "#4b5563", textAlign: "right", lineHeight: 1.35, maxWidth: "30%" },
  // ─── DATA DE ENTREGA EM BRANCO, PARA PREENCHER À MÃO ─────────────────────
  //
  // A carga é impressa no dia em que é montada, mas o "Sair para rota" pode ser
  // clicado um ou dois dias depois. A data que o papel mostrava era a de
  // EMISSÃO — que não é a data em que o cliente recebe. O campo vazio, com
  // moldura, deixa o motorista escrever a data real antes de sair; enquanto
  // ninguém escreve, ele não afirma nada.
  linhaDataDeEntrega: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 3 },
  campoDataDeEntrega: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0.75,
    borderColor: "#9ca3af",
    borderStyle: "solid",
    borderRadius: 2,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  rotuloDataDeEntrega: {
    fontSize: 7.5,
    color: "#374151",
    marginRight: 5,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  espacoParaEscrever: { fontSize: 10, color: "#111827", letterSpacing: 1 },
  faixa: {
    backgroundColor: "#f3f4f6",
    borderTop: "0.5pt solid #d1d5db",
    borderBottom: "0.5pt solid #d1d5db",
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 7,
  },
  linhaDados: { flexDirection: "row", flexWrap: "wrap", marginBottom: 2 },
  campo: { flexDirection: "row", marginRight: 18 },
  rotulo: { fontSize: 8, color: "#6b7280", marginRight: 3 },
  valor: { fontSize: 8.5, fontWeight: "bold", color: "#111827" },
  secao: {
    fontSize: 8,
    fontWeight: "bold",
    letterSpacing: 0.4,
    color: "#1e3a5f",
    marginTop: 6,
    marginBottom: 3,
    textTransform: "uppercase",
  },
  cabecalhoTabela: {
    flexDirection: "row",
    backgroundColor: "#5b9bd5",
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: "bold",
    paddingVertical: 3,
    paddingHorizontal: 3,
  },
  cabecalhoProdutos: {
    flexDirection: "row",
    backgroundColor: "#a11b6a",
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: "bold",
    paddingVertical: 3,
    paddingHorizontal: 3,
    marginTop: 8,
  },
  linhaTabela: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #e5e7eb",
    paddingVertical: 2.5,
    paddingHorizontal: 3,
  },
  linhaAlternada: { backgroundColor: "#fafafa" },
  celula: { fontSize: 8 },
  celulaForte: { fontSize: 8, fontWeight: "bold" },
  endereco: { fontSize: 7, color: "#6b7280", marginTop: 0.5 },
  fechamentoPagamento: {
    marginTop: 7,
    borderTop: "1pt solid #a11b6a",
    paddingTop: 3,
  },
  linhaPagamento: { fontSize: 8, color: "#111827", marginTop: 1, lineHeight: 1.3 },
  rodapeTotais: {
    flexDirection: "row",
    borderTop: "1pt solid #a11b6a",
    marginTop: 10,
    paddingTop: 5,
  },
  totalBloco: { flex: 1 },
  totalRotulo: { fontSize: 7.5, color: "#6b7280" },
  totalValor: { fontSize: 10, fontWeight: "bold", color: "#111827", marginTop: 1 },
  rodape: {
    position: "absolute",
    bottom: 9,
    left: 22,
    right: 22,
    fontSize: 7,
    color: "#9ca3af",
    borderTop: "0.5pt solid #e5e7eb",
    paddingTop: 3,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export interface ItemDaParada {
  codigo: string;
  nome: string;
  quantidade: number;
  /** Preço unitário em centavos, quando o pedido tem (o romaneio do Odvix mostra). */
  preco_unit_cents?: number | null;
  /** Peso bruto unitário em kg, quando o cadastro do produto tem. */
  peso_kg?: number | null;
}

export interface ParadaDoRomaneio {
  sequencia: number;
  numero: number;
  cliente_nome: string;
  endereco_entrega: string | null;
  total_cents: number;
  status: string;
  /** Cidade da entrega ("MAFRA/SC"), para separar a carga por cidade. */
  cidade?: string | null;
  /** Condição de pagamento do pedido ("AVISTA", "30 DIAS"…). */
  condicao_pagamento?: string | null;
  /** Data de emissão do pedido (ISO). */
  emissao?: string | null;
  /** Itens do pedido para o checklist de carregamento (opcional p/ compat). */
  itens?: ItemDaParada[];
}

export interface RomaneioDados {
  numero: number;
  placa: string | null;
  veiculo_tipo: string | null;
  motorista_nome: string | null;
  paradas: ParadaDoRomaneio[];
  /** Contato do emitente no cabeçalho (o Odvix imprime CNPJ, telefone, e-mail). */
  emitenteContato?: { documento?: string | null; endereco?: string | null; telefone?: string | null; email?: string | null } | null;
}

function numeroDoPedido(numero: number): string {
  return `PED-${String(numero).padStart(4, "0")}`;
}

function moeda(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()}`;
}

export function ordenarParadasDoRomaneio(paradas: ParadaDoRomaneio[]): ParadaDoRomaneio[] {
  return [...paradas].sort((a, b) => a.sequencia - b.sequencia || a.numero - b.numero);
}

export interface GrupoDeCidade {
  /** Rótulo como veio do cadastro ("MAFRA/SC"); null = sem cidade. */
  cidade: string | null;
  /** Título impresso (o rótulo, ou "Cidade não informada"). */
  rotulo: string;
  paradas: ParadaDoRomaneio[];
}

/**
 * A CARGA SEPARADA POR CIDADE — o motorista descarrega uma cidade de cada vez.
 *
 * Ordem dos grupos: a da ROTA, não alfabética. O primeiro grupo é o da parada
 * mais cedo da sequência, e assim por diante — quem montou a rota continua
 * mandando; a cidade é o que agrupa, não o que reordena o dia. Dentro do
 * grupo, sequência.
 *
 * Cidade é comparada pelo NOME, sem acento e sem caixa ("Mafra" = "MAFRA" =
 * "Mafra/SC"), porque o cadastro tem as três formas — e um cadastro com a
 * cidade por extenso não pode virar um grupo sozinho ao lado dos outros. O
 * rótulo impresso é o primeiro que apareceu, promovido para a forma com UF
 * assim que alguma parada do grupo tiver UF. Parada sem cidade vai para o
 * fim, num grupo próprio: esconder essas paradas num grupo qualquer faria o
 * motorista passar por elas sem saber por quê.
 */
export function agruparParadasPorCidade(paradas: ParadaDoRomaneio[]): GrupoDeCidade[] {
  const norm = (v: string): string =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const chaveDe = (rotulo: string): string => norm(rotulo.split(/[,/]/)[0] ?? rotulo);
  const grupos = new Map<string, GrupoDeCidade>();
  for (const p of ordenarParadasDoRomaneio(paradas)) {
    const rotulo = (p.cidade ?? "").trim();
    const chave = rotulo ? chaveDe(rotulo) : "";
    const existente = grupos.get(chave);
    if (existente) {
      existente.paradas.push(p);
      if (existente.cidade && !existente.rotulo.includes("/") && rotulo.includes("/")) {
        existente.cidade = rotulo;
        existente.rotulo = rotulo;
      }
    } else {
      grupos.set(chave, {
        cidade: rotulo || null,
        rotulo: rotulo || "Cidade não informada",
        paradas: [p],
      });
    }
  }
  const valores = [...grupos.values()];
  return [...valores.filter((g) => g.cidade), ...valores.filter((g) => !g.cidade)];
}

export interface ItemRepetido {
  codigo: string;
  nome: string;
  quantidade_total: number;
  /** PEDs que pediram (para conferir na separação por pedido abaixo). */
  pedidos: number[];
}

/**
 * Itens repetidos na carga: mesmo produto em 2+ pedidos, com a soma para
 * separar de uma vez. Chave = código; sem código, o nome normalizado
 * (caixa/espaço — "ESTOPA 20KG" e "estopa  20kg" são a mesma estopa).
 * Ordem: maior quantidade primeiro (o que mais pesa na separação).
 */
export function agruparItensRepetidos(paradas: ParadaDoRomaneio[]): ItemRepetido[] {
  const norm = (nome: string): string =>
    nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  interface Grupo extends ItemRepetido {
    nomeNorm: string;
    pedidosSet: Set<number>;
  }
  const porCodigo = new Map<string, Grupo>();
  const semCodigo: Grupo[] = [];
  const novo = (codigo: string, nome: string): Grupo => ({
    codigo: codigo.trim(),
    nome: nome.trim(),
    nomeNorm: norm(nome),
    quantidade_total: 0,
    pedidos: [],
    pedidosSet: new Set(),
  });
  for (const p of paradas) {
    for (const it of p.itens ?? []) {
      const codigo = it.codigo.trim();
      if (codigo) {
        let g = porCodigo.get(codigo);
        if (!g) {
          g = novo(codigo, it.nome);
          porCodigo.set(codigo, g);
        }
        g.quantidade_total += it.quantidade;
        g.pedidosSet.add(p.numero);
      } else {
        const nomeNorm = norm(it.nome);
        if (!nomeNorm) continue;
        let g = semCodigo.find((x) => x.nomeNorm === nomeNorm);
        if (!g) {
          g = novo("", it.nome);
          semCodigo.push(g);
        }
        g.quantidade_total += it.quantidade;
        g.pedidosSet.add(p.numero);
      }
    }
  }
  // Sem código que é o mesmo produto de um com código ("estopa 20kg" =
  // "114/ESTOPA 20KG"): dobra no grupo codificado, mantendo a identidade.
  for (const g of semCodigo) {
    const alvo = [...porCodigo.values()].find((c) => c.nomeNorm === g.nomeNorm);
    if (alvo) {
      alvo.quantidade_total += g.quantidade_total;
      for (const n of g.pedidosSet) alvo.pedidosSet.add(n);
    } else {
      porCodigo.set(`nome:${g.nomeNorm}`, g);
    }
  }
  return [...porCodigo.values()]
    .filter((g) => g.pedidosSet.size > 1)
    .map(({ pedidosSet, nomeNorm: _nomeNorm, ...resto }) => ({
      ...resto,
      pedidos: [...pedidosSet].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.quantidade_total - a.quantidade_total || a.nome.localeCompare(b.nome, "pt-BR"));
}


/**
 * OS PRODUTOS DA CARGA, CONSOLIDADOS — a tabela do Odvix.
 *
 * Um produto que aparece em três pedidos vira UMA linha com a soma, porque quem
 * carrega o caminhão pega a quantidade total de uma vez. Chave = código; sem
 * código, o nome normalizado.
 */
export interface ProdutoDaCarga {
  codigo: string;
  nome: string;
  quantidade: number;
  valorUnitCents: number;
  valorTotalCents: number;
  pesoKg: number;
}

export function agregarProdutosDaCarga(paradas: ParadaDoRomaneio[]): ProdutoDaCarga[] {
  const norm = (v: string): string =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const mapa = new Map<string, ProdutoDaCarga>();
  for (const p of ordenarParadasDoRomaneio(paradas)) {
    for (const it of p.itens ?? []) {
      const chave = it.codigo ? `cod:${norm(it.codigo)}` : `nome:${norm(it.nome)}`;
      const total = (it.preco_unit_cents ?? 0) * it.quantidade;
      const existente = mapa.get(chave);
      if (existente) {
        existente.quantidade += it.quantidade;
        existente.valorTotalCents += total;
        existente.pesoKg += (it.peso_kg ?? 0) * it.quantidade;
      } else {
        mapa.set(chave, {
          codigo: it.codigo,
          nome: it.nome,
          quantidade: it.quantidade,
          valorUnitCents: it.preco_unit_cents ?? 0,
          valorTotalCents: total,
          pesoKg: (it.peso_kg ?? 0) * it.quantidade,
        });
      }
    }
  }
  return [...mapa.values()].sort(
    (a, b) => a.codigo.localeCompare(b.codigo, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

export interface TotalPorPagamento {
  /** O rótulo como veio no pedido ("BOLETO 14 DIAS"), ou "Não informado". */
  rotulo: string;
  pedidos: number;
  totalCents: number;
}

/**
 * O FECHAMENTO POR MEIO DE PAGAMENTO — o que o motorista confere no fim do dia.
 *
 * Agrupa pelo texto normalizado (sem acento, sem caixa, sem espaço duplo):
 * "BOLETO 14 DIAS" e "Boleto 14 dias" são o mesmo meio, e separá-los faria a
 * soma não fechar. O rótulo impresso é o primeiro que apareceu — quem digitou
 * "PIX" continua vendo "PIX", não "PIX " normalizado.
 *
 * Pedido sem condição cai em "Não informado" em vez de sumir: a soma dos meios
 * tem de fechar com o total da carga, inclusive quando o dado falta.
 */
export function totaisPorCondicaoDePagamento(paradas: ParadaDoRomaneio[]): TotalPorPagamento[] {
  const norm = (v: string): string =>
    v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const mapa = new Map<string, TotalPorPagamento>();
  for (const p of paradas) {
    const bruto = (p.condicao_pagamento ?? "").trim();
    const chave = norm(bruto) || "__SEM_PAGAMENTO__";
    const atual = mapa.get(chave) ?? {
      rotulo: bruto || "Não informado",
      pedidos: 0,
      totalCents: 0,
    };
    atual.pedidos += 1;
    atual.totalCents += p.total_cents;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort(
    (a, b) => b.totalCents - a.totalCents || a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );
}

export function RomaneioPdf({
  emitente,
  carga,
}: {
  emitente: { nome: string };
  carga: RomaneioDados;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ConteudoRomaneio emitente={emitente} carga={carga} />
        <Rodape emitenteNome={emitente.nome} />
      </Page>
    </Document>
  );
}

function ConteudoRomaneio({
  emitente,
  carga,
}: {
  emitente: { nome: string };
  carga: RomaneioDados;
}) {
  const paradas = ordenarParadasDoRomaneio(carga.paradas);
  const produtos = agregarProdutosDaCarga(paradas);
  const totalCents = paradas.reduce((s, p) => s + p.total_cents, 0);
  const porPagamento = totaisPorCondicaoDePagamento(paradas);
  const totalItens = produtos.reduce((s, p) => s + p.quantidade, 0);
  const totalPeso = produtos.reduce((s, p) => s + p.pesoKg, 0);
  const temPeso = produtos.some((p) => p.pesoKg > 0);
  const cidades = [...new Set(paradas.map((p) => (p.cidade ?? "").trim()).filter(Boolean))];
  const contato = carga.emitenteContato ?? null;
  const linhasContato = [
    contato?.documento ? `CNPJ ${contato.documento}` : null,
    contato?.endereco,
    contato?.telefone,
    contato?.email,
  ].filter(Boolean) as string[];

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.emitente}>{emitente.nome}</Text>
        <View style={styles.tituloBloco}>
          <Text style={styles.tituloRotulo}>Romaneio</Text>
          <Text style={styles.tituloNumero}>{numeroDaCarga(carga.numero)}</Text>
        </View>
        <View>
          {linhasContato.map((l, i) => (
            <Text key={`${l}-${i}`} style={styles.contato}>
              {l}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.linhaDataDeEntrega}>
        <View style={styles.campoDataDeEntrega}>
          <Text style={styles.rotuloDataDeEntrega}>Data de entrega</Text>
          <Text style={styles.espacoParaEscrever}>____/____/____</Text>
        </View>
      </View>

      <View style={styles.faixa}>
        <View style={styles.linhaDados}>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Data:</Text>
            <Text style={styles.valor}>{dataCurta(paradas[0]?.emissao ?? new Date().toISOString())}</Text>
          </View>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Nº Docs:</Text>
            <Text style={styles.valor}>{paradas.length}</Text>
          </View>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Qtde Total:</Text>
            <Text style={styles.valor}>{totalItens.toFixed(4)}</Text>
          </View>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Valor Total:</Text>
            <Text style={styles.valor}>R$ {moeda(totalCents)}</Text>
          </View>
          {temPeso && (
            <View style={styles.campo}>
              <Text style={styles.rotulo}>Peso:</Text>
              <Text style={styles.valor}>{totalPeso.toFixed(3)} Kg</Text>
            </View>
          )}
        </View>
        <View style={styles.linhaDados}>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Descrição:</Text>
            <Text style={styles.valor}>{cidades.length > 0 ? cidades.join(" · ") : "—"}</Text>
          </View>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Veículo:</Text>
            <Text style={styles.valor}>
              {[carga.placa, carga.veiculo_tipo, carga.motorista_nome].filter(Boolean).join(" · ") ||
                "sem veículo definido"}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.secao}>Pedidos</Text>
      {/* "Origem" era a palavra "Pedido" repetida em toda linha e "Id" repetia
          o número que já vai em "Nº Documento" — duas colunas de largura fixa
          que só roubavam espaço do cliente (e endereço quebrado é linha a
          mais). Saíram para caber Valor e Pagamento sem empurrar a carga para
          uma 3ª página. */}
      <View style={styles.cabecalhoTabela}>
        <Text style={[styles.celula, { width: "13%" }]}>Nº Documento</Text>
        <Text style={[styles.celula, { width: "11%" }]}>Emissão</Text>
        <Text style={[styles.celula, { flex: 1 }]}>Cliente</Text>
        <Text style={[styles.celula, { width: "15%" }]}>Pagamento</Text>
        <Text style={[styles.celula, { width: "12%", textAlign: "right" }]}>Valor</Text>
      </View>
      {paradas.map((p, i) => (
        <View
          key={`ped-${p.sequencia}-${p.numero}`}
          style={[styles.linhaTabela, i % 2 === 1 ? styles.linhaAlternada : {}]}
          wrap={false}
        >
          <Text style={[styles.celula, { width: "13%" }]}>{numeroDoPedido(p.numero)}</Text>
          <Text style={[styles.celula, { width: "11%" }]}>{dataCurta(p.emissao)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.celulaForte}>{p.cliente_nome}</Text>
            {p.endereco_entrega ? (
              <Text style={styles.endereco}>{p.endereco_entrega}</Text>
            ) : (
              <Text style={[styles.endereco, { color: "#b45309" }]}>
                Sem endereço — confirme com o escritório
              </Text>
            )}
          </View>
          <Text style={[styles.celula, { width: "15%" }]}>{p.condicao_pagamento || "—"}</Text>
          <Text style={[styles.celulaForte, { width: "12%", textAlign: "right" }]}>
            {moeda(p.total_cents)}
          </Text>
        </View>
      ))}

      <View style={styles.cabecalhoProdutos}>
        <Text style={[styles.celula, { width: "10%" }]}>Código</Text>
        <Text style={[styles.celula, { width: "8%" }]}>Qtde</Text>
        <Text style={[styles.celula, { flex: 1 }]}>Descrição</Text>
        <Text style={[styles.celula, { width: "12%", textAlign: "right" }]}>Valor Unit.</Text>
        <Text style={[styles.celula, { width: "12%", textAlign: "right" }]}>Valor Total</Text>
        {temPeso && (
          <Text style={[styles.celula, { width: "10%", textAlign: "right" }]}>Peso</Text>
        )}
      </View>
      {produtos.map((p, i) => (
        <View
          key={`prod-${p.codigo}-${p.nome}-${i}`}
          style={[styles.linhaTabela, i % 2 === 1 ? styles.linhaAlternada : {}]}
          wrap={false}
        >
          <Text style={[styles.celula, { width: "10%" }]}>{p.codigo || "—"}</Text>
          <Text style={[styles.celula, { width: "8%" }]}>{p.quantidade.toFixed(4)}</Text>
          <Text style={[styles.celula, { flex: 1 }]}>{p.nome}</Text>
          <Text style={[styles.celula, { width: "12%", textAlign: "right" }]}>
            {moeda(p.valorUnitCents)}
          </Text>
          <Text style={[styles.celula, { width: "12%", textAlign: "right" }]}>
            {moeda(p.valorTotalCents)}
          </Text>
          {temPeso && (
            <Text style={[styles.celula, { width: "10%", textAlign: "right" }]}>
              {p.pesoKg.toFixed(3)}
            </Text>
          )}
        </View>
      ))}

      {/* Fechamento por meio de pagamento — uma linha compacta, não uma
          tabela: o papel do motorista é a lista do que carregar, e a soma por
          meio de pagamento tem de ca;ber sem empurrar a carga para uma 3ª
          página (o gate de 2 páginas existe). A soma fecha com o Valor Total
          do rodapé. */}
      <View style={styles.fechamentoPagamento}>
        <Text style={styles.totalRotulo}>Por meio de pagamento</Text>
        <Text style={styles.linhaPagamento}>
          {porPagamento
            .map((t) => `${t.rotulo}: R$ ${moeda(t.totalCents)} (${t.pedidos})`)
            .join("   ·   ")}
        </Text>
      </View>

      <View style={styles.rodapeTotais}>
        <View style={styles.totalBloco}>
          <Text style={styles.totalRotulo}>Qtde Total</Text>
          <Text style={styles.totalValor}>{totalItens.toFixed(4)}</Text>
        </View>
        <View style={styles.totalBloco}>
          <Text style={styles.totalRotulo}>Nº Docs</Text>
          <Text style={styles.totalValor}>{paradas.length}</Text>
        </View>
        <View style={styles.totalBloco}>
          <Text style={styles.totalRotulo}>Valor Total</Text>
          <Text style={styles.totalValor}>R$ {moeda(totalCents)}</Text>
        </View>
        {temPeso && (
          <View style={styles.totalBloco}>
            <Text style={styles.totalRotulo}>Peso Total</Text>
            <Text style={styles.totalValor}>{totalPeso.toFixed(3)} Kg</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Rodape({ emitenteNome }: { emitenteNome: string }) {
  return (
    <View style={styles.rodape} fixed>
      <Text>{emitenteNome}</Text>
      <Text
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Página ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  );
}

export async function renderRomaneioPdf(
  emitente: { nome: string },
  carga: RomaneioDados,
): Promise<Buffer> {
  const buf = await renderToBuffer(<RomaneioPdf emitente={emitente} carga={carga} />);
  return buf as Buffer;
}
