/**
 * O ROMANEIO DE CARGA EM PDF — o papel que viaja com o motorista.
 *
 * Pedidos em ordem de sequência, com endereço de entrega e espaço para
 * assinatura. Antes da separação por pedido, o RESUMO DE SEPARAÇÃO agrega
 * os itens repetidos (o mesmo produto em 2+ pedidos): quem separa pega as
 * 2 estopas de uma vez em vez de voltar buscar depois. Mesma doutrina do
 * PDF de pedido: identidade da loja, nunca do software.
 *
 * ─── POR QUE O LAYOUT É DENSO ────────────────────────────────────────────────
 *
 * A carga 022 (22 paradas, 50 itens) saía em CINCO páginas. Medido: cada
 * parada gastava ~90pt porque o checklist tinha uma linha por item E um bloco
 * de assinatura com 18pt de respiro — 22 × 90 = quase duas páginas só nisso,
 * mais o resumo de separação. Um romaneio de cinco folhas não é um romaneio:
 * é um caderno, e o motorista confere na última página enquanto entrega.
 *
 * O que mudou, sem tirar nenhuma informação:
 * - os itens de uma parada correm em linha (flexWrap) com o par de caixas
 *   colado ao item — antes cada item abria uma linha inteira;
 * - a assinatura virou uma linha fina (antes era um bloco com borda e 18pt);
 * - endereço ausente não gasta linha: entra como marca curta na linha do
 *   pedido (a ausência continua visível, que é o que importa);
 * - cabeçalho e resumo de separação perderam o respiro decorativo.
 *
 * `wrap={false}` por parada: uma parada nunca parte no meio entre duas folhas.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { numeroDaCarga } from "@/lib/schemas/expedicao";

const styles = StyleSheet.create({
  page: { padding: 18, fontSize: 8, fontFamily: "Helvetica", color: "#1f2937" },
  header: {
    borderBottom: "1.5pt solid #1e3a5f",
    paddingBottom: 3,
    marginBottom: 3,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  emitente: { fontSize: 12, fontWeight: "bold", color: "#1e3a5f" },
  info: { fontSize: 7.5, color: "#4b5563", textAlign: "right" },
  resumoLinha: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1e3a5f",
    color: "#ffffff",
    fontSize: 7.5,
    fontWeight: "bold",
    paddingVertical: 1.5,
    paddingHorizontal: 5,
  },
  separacao: {
    border: "0.5pt solid #1e3a5f",
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 5,
    marginTop: 2,
    marginBottom: 3,
  },
  blocoTitulo: { fontSize: 8, fontWeight: "bold", color: "#1e3a5f", marginBottom: 1 },
  legenda: { fontSize: 6.5, color: "#6b7280", marginTop: 2, marginBottom: 1 },
  fluxoItens: { flexDirection: "row", flexWrap: "wrap", marginTop: 1 },
  itemCheck: { fontSize: 7.5, marginRight: 9, marginBottom: 0.5 },
  sepItem: { fontSize: 7.5, marginRight: 9, marginBottom: 0.5 },
  sepPedidos: { fontSize: 6.5, color: "#6b7280" },
  parada: {
    borderBottom: "0.5pt solid #e5e7eb",
    paddingVertical: 1.5,
  },
  paradaTopo: { flexDirection: "row", alignItems: "baseline" },
  seqNum: { width: 18, fontSize: 9.5, fontWeight: "bold", color: "#1e3a5f" },
  pedido: { fontSize: 7.5, fontWeight: "bold", marginRight: 4 },
  cliente: { flex: 1, fontSize: 7.5 },
  semEndereco: { fontSize: 6.5, color: "#b45309", marginLeft: 4 },
  cidade: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    backgroundColor: "#eef2f7",
    borderLeft: "2pt solid #1e3a5f",
    paddingVertical: 1.5,
    paddingHorizontal: 4,
    marginTop: 3,
    marginBottom: 1,
  },
  cidadeNome: { fontSize: 8, fontWeight: "bold", color: "#1e3a5f" },
  cidadeQtd: { fontSize: 6.5, color: "#4b5563" },
  valor: { fontSize: 7.5, fontWeight: "bold", marginLeft: 6 },
  endereco: { fontSize: 7, color: "#4b5563", marginLeft: 18, marginBottom: 1 },
  assinatura: { fontSize: 6.5, color: "#6b7280", marginBottom: 1 },
  rodape: {
    position: "absolute",
    bottom: 9,
    left: 18,
    right: 18,
    fontSize: 6.5,
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
  /** Itens do pedido para o checklist de carregamento (opcional p/ compat). */
  itens?: ItemDaParada[];
}

export interface RomaneioDados {
  numero: number;
  placa: string | null;
  veiculo_tipo: string | null;
  motorista_nome: string | null;
  paradas: ParadaDoRomaneio[];
}

function moeda(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function numeroDoPedido(numero: number): string {
  return `PED-${String(numero).padStart(4, "0")}`;
}

/**
 * Ordem de entrega: sequência da rota, desempate pelo número. A rota SQL já
 * vem ordenada, mas o romaneio não confia nisso — quem IMPRIME garante a
 * ordem que o motorista dirige.
 */
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
  const total = paradas.reduce((s, p) => s + p.total_cents, 0);
  const repetidos = agruparItensRepetidos(paradas);
  const totalItens = paradas.reduce((s, p) => s + (p.itens?.length ?? 0), 0);
  const grupos = agruparParadasPorCidade(paradas);
  // A numeração é REDISTRIBUÍDA na ordem em que o papel é lido. Manter o número
  // da rota original imprimiria "1, 5, 9, 2, 3" — o motorista conferiria uma
  // lista que parece fora de ordem. A rota continua sendo a ordem; a cidade é
  // o que a agrupa.
  const ordemDaParada = new Map<ParadaDoRomaneio, number>();
  let n = 0;
  for (const g of grupos) for (const p of g.paradas) ordemDaParada.set(p, ++n);
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.emitente}>{emitente.nome}</Text>
        <Text style={styles.info}>
          {[carga.placa, carga.veiculo_tipo, carga.motorista_nome].filter(Boolean).join(" · ") ||
            "Sem veículo definido"}
        </Text>
      </View>

      <View style={styles.resumoLinha}>
        <Text>
          Romaneio — {numeroDaCarga(carga.numero)} · {paradas.length} paradas · {totalItens} itens
        </Text>
        <Text>{moeda(total)}</Text>
      </View>

      {repetidos.length > 0 && (
        <View style={styles.separacao}>
          <Text style={styles.blocoTitulo}>Separação — leve tudo de uma vez</Text>
          <View style={styles.fluxoItens}>
            {repetidos.map((r, i) => (
              <Text key={`${r.codigo}-${r.nome}-${i}`} style={styles.sepItem}>
                [ ] {r.quantidade_total} un. {r.codigo ? `${r.codigo} — ` : ""}
                {r.nome}
                <Text style={styles.sepPedidos}>
                  {"  "}
                  {r.pedidos.map(numeroDoPedido).join(" · ")}
                </Text>
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* A legenda das duas caixas sai UMA vez, não por parada: repetir em
          cada uma custava uma linha × 22 e era o segundo maior desperdício
          do layout antigo. */}
      <Text style={styles.legenda}>
        Por parada: [ ] carregado · [ ] entregue · assinatura do recebedor depois dos itens.
      </Text>

      {grupos.map((g) => (
        <View key={`cidade-${g.rotulo}`}>
          <View style={styles.cidade} wrap={false}>
            <Text style={styles.cidadeNome}>{g.rotulo}</Text>
            <Text style={styles.cidadeQtd}>
              {g.paradas.length} {g.paradas.length === 1 ? "parada" : "paradas"}
            </Text>
          </View>
          {g.paradas.map((p) => {
            const itens = p.itens ?? [];
            return (
              <View key={`${p.sequencia}-${p.numero}`} style={styles.parada} wrap={false}>
                <View style={styles.paradaTopo}>
                  <Text style={styles.seqNum}>{ordemDaParada.get(p) ?? p.sequencia}</Text>
                  <Text style={styles.pedido}>{numeroDoPedido(p.numero)}</Text>
                  <Text style={styles.cliente}>
                    {p.cliente_nome}
                    {!p.endereco_entrega && (
                      <Text style={styles.semEndereco}> · sem endereço</Text>
                    )}
                  </Text>
                  <Text style={styles.valor}>{moeda(p.total_cents)}</Text>
                </View>
                {p.endereco_entrega && <Text style={styles.endereco}>{p.endereco_entrega}</Text>}
                <View style={styles.fluxoItens}>
                  {itens.map((it, idx) => (
                    <Text key={`${it.codigo}-${idx}`} style={styles.itemCheck}>
                      [ ] [ ] {it.quantidade} un. {it.codigo ? `${it.codigo} — ` : ""}
                      {it.nome}
                    </Text>
                  ))}
                  {/* `wrap={false}`: a linha de assinatura nunca parte no meio —
                      "Assinatura do recebedor:" numa linha e os traços na outra
                      não é canhoto, é borrão. */}
                  <Text style={styles.assinatura} wrap={false}>
                    Assinatura do recebedor: ______________________________
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
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
