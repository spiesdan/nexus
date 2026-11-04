/**
 * O ROMANEIO DE CARGA — o papel que o MOTORISTA usa na rua.
 *
 * ─── O que mudou, e por quê ─────────────────────────────────────────────────
 *
 * O romaneio era um documento de escritório impresso para quem dirige: trazia
 * o resumo de separação (que é do depósito, não da rua), o valor de cada
 * parada (que o motorista não cobra), dois quadradinhos por item sem dizer o
 * que cada um marcava, e fonte de 7,5pt — ilegível no sol, dentro da cabine.
 *
 * A pergunta que este papel responde é uma só: **para quem entrego, onde, e o
 * que tem na caixa**. Tudo que não responde isso saiu. O que ficou ganhou
 * tamanho: número da parada, nome do cliente e endereço são o que se lê de
 * relance; itens vêm com UM quadradinho para marcar a entrega.
 *
 * O que NÃO saiu: a ordem das paradas (a rota manda), o agrupamento por cidade
 * (descarrega uma cidade de cada vez) e a linha de assinatura de quem recebeu
 * (é a prova de entrega). A separação por cidade continua calculada aqui —
 * `agruparItensRepetidos` segue exportada para quem separa a carga no galpão.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { numeroDaCarga } from "@/lib/schemas/expedicao";

const styles = StyleSheet.create({
  page: { padding: 22, fontSize: 9.5, fontFamily: "Helvetica", color: "#111827" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: "1.5pt solid #1e3a5f",
    paddingBottom: 4,
    marginBottom: 6,
  },
  emitente: { fontSize: 13, fontWeight: "bold", color: "#1e3a5f" },
  titulo: { fontSize: 15, fontWeight: "bold", color: "#1e3a5f", textAlign: "right" },
  info: { fontSize: 8.5, color: "#4b5563", textAlign: "right" },
  faixa: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#1e3a5f",
    color: "#ffffff",
    fontSize: 9.5,
    fontWeight: "bold",
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 2,
    marginBottom: 6,
  },
  cidade: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    backgroundColor: "#eef2f7",
    borderLeft: "2.5pt solid #1e3a5f",
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    marginTop: 5,
    marginBottom: 2,
  },
  cidadeNome: { fontSize: 10, fontWeight: "bold", color: "#1e3a5f" },
  cidadeQtd: { fontSize: 8, color: "#4b5563" },
  parada: {
    borderBottom: "0.5pt solid #e5e7eb",
    paddingTop: 3,
    paddingBottom: 3,
  },
  paradaTopo: { flexDirection: "row", alignItems: "baseline" },
  seqNum: {
    width: 17,
    fontSize: 11,
    fontWeight: "bold",
    color: "#1e3a5f",
    marginRight: 3,
  },
  cliente: { flex: 1, fontSize: 10.5, fontWeight: "bold" },
  pedido: { fontSize: 8, color: "#6b7280" },
  endereco: { fontSize: 9, color: "#374151", marginLeft: 20, marginTop: 1 },
  semEndereco: { fontSize: 9, color: "#b45309", marginLeft: 20, marginTop: 1 },
  fluxo: { flexDirection: "row", flexWrap: "wrap", marginLeft: 20, marginTop: 2 },
  item: { fontSize: 9, marginRight: 12, marginBottom: 1 },
  assinatura: { fontSize: 8.5, color: "#6b7280", marginLeft: 20, marginTop: 2 },
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
  const totalItens = paradas.reduce((s, p) => s + (p.itens?.length ?? 0), 0);
  const grupos = agruparParadasPorCidade(paradas);
  // A numeração é REDISTRIBUÍDA na ordem em que o papel é lido, para o
  // motorista não ler "1, 5, 9, 2". A rota continua mandando; a cidade agrupa.
  const ordemDaParada = new Map<ParadaDoRomaneio, number>();
  let n = 0;
  for (const g of grupos) for (const p of g.paradas) ordemDaParada.set(p, ++n);

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.emitente}>{emitente.nome}</Text>
        <View>
          <Text style={styles.titulo}>Romaneio {numeroDaCarga(carga.numero)}</Text>
          <Text style={styles.info}>
            {[carga.placa, carga.veiculo_tipo, carga.motorista_nome].filter(Boolean).join(" · ") ||
              "Sem veículo definido"}
          </Text>
        </View>
      </View>

      <View style={styles.faixa}>
        <Text>
          {paradas.length} {paradas.length === 1 ? "entrega" : "entregas"} · {totalItens}{" "}
          {totalItens === 1 ? "item" : "itens"}
        </Text>
        <Text>Marque [ ] a cada item entregue</Text>
      </View>

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
                  <Text style={styles.cliente}>{p.cliente_nome}</Text>
                  <Text style={styles.pedido}>{numeroDoPedido(p.numero)}</Text>
                </View>

                {p.endereco_entrega ? (
                  <Text style={styles.endereco}>{p.endereco_entrega}</Text>
                ) : (
                  <Text style={styles.semEndereco}>
                    Sem endereço — confirme com o escritório antes de sair.
                  </Text>
                )}

                <View style={styles.fluxo}>
                  {itens.map((it, idx) => (
                    <Text key={`${it.codigo}-${idx}`} style={styles.item}>
                      [ ] {it.quantidade} un. {it.codigo ? `${it.codigo} — ` : ""}
                      {it.nome}
                    </Text>
                  ))}
                  {/* A assinatura fecha a parada, na mesma linha quando cabe:
                      é a prova de entrega e não pode ficar só na última folha. */}
                  <Text style={styles.assinatura} wrap={false}>
                    Recebido por: ______________________
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
