/**
 * O PDF DO FECHAMENTO DA CARGA — a prestação de contas fechada no papel.
 *
 * ═══ O QUE É ISTO, E O QUE NÃO É ═══════════════════════════════════════════
 *
 * O ROMANEIO imprimia a conferência de caixa como LINHAS VAZIAS: o motorista
 * preenchia à mão, guardava num arquivo físico, conferia de olho. A tela
 * (`PUT /api/v1/shipments/[id]/fechamento`) passou a ser essa lista com a conta
 * feita — e o fechamento agora VIVE no sistema.
 *
 * Este documento nasceu da mesma demanda, na ordem contrária: quem fecha o
 * caixa (o conferente) **já tem** a conta feita no sistema. O papel não serve
 * para preencher — serve para LEVAR a conta fechada: resumo financeiro, conta
 * (entradas/saídas/líquido/esperado/diferença), linhas contadas, conferência
 * e cobrança por condição/parada, tudo em UM só lugar.
 *
 * Só o fechamento: não é o romaneio (lista do que carregar) nem o relatório —
 * é a conta, fechada, da carga específica.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { numeroDaCarga } from "@/lib/schemas/expedicao";
import type { FechamentoPayload } from "@/lib/comercial/fechamento";

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
  emitente: { fontSize: 10.5, fontWeight: "bold", color: "#1e3a5f", maxWidth: "48%", flexShrink: 1 },
  tituloBloco: { flexShrink: 0, marginHorizontal: 8, alignItems: "center" },
  tituloRotulo: {
    fontSize: 7,
    color: "#6b7280",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  tituloNumero: { fontSize: 15, fontWeight: "bold", color: "#1e3a5f", marginTop: 1 },
  contato: { fontSize: 7.5, color: "#4b5563", textAlign: "right", lineHeight: 1.35, maxWidth: "30%" },
  faixa: {
    backgroundColor: "#f3f4f6",
    borderTop: "0.5pt solid #d1d5db",
    borderBottom: "0.5pt solid #d1d5db",
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 7,
  },
  linhaDados: { flexDirection: "row", flexWrap: "wrap" },
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
  linhaConta: { flexDirection: "row", marginBottom: 2 },
  linhaPagamento: { fontSize: 8, color: "#111827", marginTop: 1, lineHeight: 1.3 },
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

export interface EmitenteDoFechamentoPdf {
  nome: string;
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

function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()} ${hh}:${mm}`;
}

export function FechamentoPdf({
  emitente,
  dados,
}: {
  emitente: EmitenteDoFechamentoPdf;
  dados: FechamentoPayload;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ConteudoFechamento emitente={emitente} dados={dados} />
      </Page>
    </Document>
  );
}

function ConteudoFechamento({
  emitente,
  dados,
}: {
  emitente: EmitenteDoFechamentoPdf;
  dados: FechamentoPayload;
}) {
  const { carga, resumo, por_condicao, paradas, fechamento, avisos } = dados;
  const conta = fechamento?.conta ?? null;
  const fechado = fechamento !== null;

  const linhasContadas = fechamento?.linhas ?? [];

  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.emitente}>{emitente.nome}</Text>
        <View style={styles.tituloBloco}>
          <Text style={styles.tituloRotulo}>Fechamento</Text>
          <Text style={styles.tituloNumero}>{numeroDaCarga(carga.numero)}</Text>
        </View>
      </View>

      <View style={styles.faixa}>
        <View style={styles.linhaDados}>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Fechamento:</Text>
            <Text style={styles.valor}>{dataCurta(fechamento?.conferido_em ?? null)}</Text>
          </View>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Carga:</Text>
            <Text style={styles.valor}>{numeroDaCarga(carga.numero)}</Text>
          </View>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>A cobrar:</Text>
            <Text style={styles.valor}>R$ {moeda(resumo.aCobrar)}</Text>
          </View>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Faturado:</Text>
            <Text style={styles.valor}>R$ {moeda(resumo.totalFaturado)}</Text>
          </View>
          <View style={styles.campo}>
            <Text style={styles.rotulo}>Volumes:</Text>
            <Text style={styles.valor}>{resumo.volumes}</Text>
          </View>
        </View>
      </View>

      {conta ? (
        <View>
          <Text style={styles.secao}>Conta do caixa</Text>
          <View style={styles.linhaConta}>
            <Text style={styles.rotulo}>Entradas</Text>
            <Text style={styles.valor}>R$ {moeda(conta.entradas_cents)}</Text>
          </View>
          <View style={styles.linhaConta}>
            <Text style={styles.rotulo}>Saídas</Text>
            <Text style={styles.valor}>R$ {moeda(conta.saidas_cents)}</Text>
          </View>
          <View style={styles.linhaConta}>
            <Text style={styles.rotulo}>Líquido</Text>
            <Text style={styles.valor}>R$ {moeda(conta.liquido_cents)}</Text>
          </View>
          <View style={styles.linhaConta}>
            <Text style={styles.rotulo}>Esperado</Text>
            <Text style={styles.valor}>R$ {moeda(conta.esperado_cents)}</Text>
          </View>
          <View style={styles.linhaConta}>
            <Text style={styles.rotulo}>Diferença</Text>
            <Text style={styles.valor}>
              {conta.bate ? "R$ 0,00 (bateu)" : `R$ ${moeda(Math.abs(conta.diferenca_cents))} (${conta.diferenca_cents > 0 ? "sobra" : "falta"})`}
            </Text>
          </View>

          <Text style={styles.secao}>Linhas contadas</Text>
          {linhasContadas.map((l) => (
            <View key={l.chave} style={styles.linhaConta}>
              <Text style={styles.rotulo}>{l.chave}</Text>
              <Text style={styles.valor}>R$ {moeda(l.valor_cents)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.secao}>Conferência</Text>
      {fechamento ? (
        <View>
          <Text style={styles.linhaPagamento}>Conferido em: {dataHora(fechamento.conferido_em)}</Text>
          <Text style={styles.linhaPagamento}>Conferente: {fechamento.conferente_nome ?? "—"}</Text>
          {fechamento.observacao ? (
            <Text style={styles.linhaPagamento}>Observação: {fechamento.observacao}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.linhaPagamento}>Ainda não fechado.</Text>
      )}
      {avisos.map((a, i) => (
        <Text key={i} style={styles.linhaPagamento}>
          {a.texto}
        </Text>
      ))}

      <Text style={styles.secao}>A cobrar por condição</Text>
      {por_condicao.length > 0 ? (
        por_condicao.map((g) => (
          <View key={g.condicao} style={styles.linhaConta}>
            <Text style={styles.rotulo}>{g.condicao}</Text>
            <Text style={styles.valor}>R$ {moeda(g.valor_cents)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.linhaPagamento}>Sem valores a cobrar.</Text>
      )}

      <Text style={styles.secao}>Cobrança por parada</Text>
      {paradas.map((p) => (
        <View key={p.shipment_order_id} style={styles.linhaPagamento}>
          <Text style={styles.linhaPagamento}>
            {numeroDoPedido(p.numero)} — {p.cliente_nome} — {p.condicao?.trim() || "sem condição"}:{" "}
            {p.a_cobrar_cents > 0 ? `R$ ${moeda(p.a_cobrar_cents)}` : "sem a cobrar"}
          </Text>
        </View>
      ))}

      <Rodape emitenteNome={emitente.nome} />
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

export async function renderFechamentoPdf(
  emitente: EmitenteDoFechamentoPdf,
  dados: FechamentoPayload,
): Promise<Buffer> {
  const buf = await renderToBuffer(<FechamentoPdf emitente={emitente} dados={dados} />);
  return buf as Buffer;
}
