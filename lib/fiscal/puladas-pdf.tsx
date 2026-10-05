/**
 * NUMERAÇÕES PULADAS POR SÉRIE — o relatório do menu Emissor do Odivix.
 *
 * Renderizado para Buffer via @react-pdf/renderer pela rota
 * `GET /api/v1/fiscal-inutilizacoes/puladas`. O dado é puro: a lacuna é o
 * número que existe entre o primeiro e o último emitido de uma série e não
 * tem nota em `invoices`. Cada lacuna diz a verdade — inutilizada (com o
 * motivo gravado em `fiscal_inutilizacoes`) ou sem inutilização registrada —
 * sem suposição sobre o porquê.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const MARINHO = "#1e3a5f";
const CINZA = "#6b7280";
const BORDA = "#e5e7eb";
const FUNDO = "#f3f4f6";
const ALERTA = "#b45309";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  titulo: { fontSize: 15, fontWeight: "bold", color: MARINHO, marginBottom: 2 },
  emitente: { fontSize: 9, color: CINZA, marginBottom: 14 },
  bloco: { marginBottom: 14 },
  blocoTitulo: { fontSize: 11, fontWeight: "bold", color: MARINHO, marginBottom: 4 },
  blocoResumo: { fontSize: 9, color: CINZA, marginBottom: 6 },
  cab: {
    flexDirection: "row",
    backgroundColor: MARINHO,
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "bold",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  linha: {
    flexDirection: "row",
    fontSize: 9,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDA,
  },
  linhaZebrada: { backgroundColor: FUNDO },
  colNumero: { width: 70 },
  colSituacao: { width: 110 },
  colMotivo: { flex: 1 },
  situacaoOk: { color: CINZA },
  situacaoAviso: { color: ALERTA, fontWeight: "bold" },
  vazio: { fontSize: 10, color: CINZA, marginTop: 8 },
  rodape: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 8, color: CINZA },
});

export interface LacunaPulada {
  numero: number;
  inutilizada: boolean;
  motivo: string | null;
  status: string | null;
}

export interface SeriePuladas {
  serie: string;
  primeiro: number | null;
  ultimo: number | null;
  emitidas: number;
  lacunas: LacunaPulada[];
}

export function nomeDoPdfPuladas(serie: string | null): string {
  return serie
    ? `numeracoes-puladas-serie-${serie.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`.toLowerCase()
    : "numeracoes-puladas.pdf";
}

export async function renderPuladasPdf(
  emitente: { nome: string; documento: string | null },
  series: SeriePuladas[],
  serieFiltro: string | null,
): Promise<Buffer> {
  const comLacunas = series.filter((s) => s.lacunas.length > 0);

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titulo}>Numerações puladas por série</Text>
        <Text style={styles.emitente}>
          {emitente.nome}
          {emitente.documento ? ` · ${emitente.documento}` : ""}
          {serieFiltro ? ` · Série ${serieFiltro}` : ""}
        </Text>

        {comLacunas.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma numeração pulada nas séries consultadas.</Text>
        ) : (
          comLacunas.map((s) => (
            <View key={s.serie} style={styles.bloco} wrap={false}>
              <Text style={styles.blocoTitulo}>Série {s.serie}</Text>
              <Text style={styles.blocoResumo}>
                {s.primeiro !== null && s.ultimo !== null
                  ? `Faixa emitida: ${s.primeiro} a ${s.ultimo} · `
                  : ""}
                {s.emitidas} emitida(s) · {s.lacunas.length} pulada(s)
              </Text>
              <View style={[styles.cab, styles.linha]} fixed>
                <Text style={styles.colNumero}>Nº</Text>
                <Text style={styles.colSituacao}>Situação</Text>
                <Text style={styles.colMotivo}>Motivo</Text>
              </View>
              {s.lacunas.map((l, i) => (
                <View key={l.numero} style={i % 2 === 1 ? [styles.linha, styles.linhaZebrada] : styles.linha}>
                  <Text style={styles.colNumero}>{l.numero}</Text>
                  <Text style={l.inutilizada ? styles.situacaoOk : styles.situacaoAviso}>
                    {l.inutilizada ? "Inutilizada" : "Sem inutilização"}
                  </Text>
                  <Text style={styles.colMotivo}>
                    {l.inutilizada
                      ? `${l.motivo ?? ""}${l.status ? ` (${l.status})` : ""}`
                      : "—"}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}

        <Text style={styles.rodape}>
          {/* Sem idioma fixo: o PDF é um documento gerado aqui, e a data do
              rodapé segue o locale da máquina de quem emite — o guarda de
              `i18n-a-data-segue-o-idioma` reprova idioma escrito à mão. */}
          Emitido em {new Date().toLocaleString()} · lacunas = números sem nota entre o
          primeiro e o último emitido de cada série
        </Text>
      </Page>
    </Document>,
  );
}
