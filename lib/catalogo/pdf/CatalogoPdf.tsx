/**
 * O PDF REAL DO CATÁLOGO — a prévia e o download renderizam ESTE componente.
 *
 * PREÇO ZERO: o tipo `ProdutoDoPdf` só carrega foto, nome e código. Não existe
 * campo de preço no contrato do gerador, portanto nenhum valor monetário pode
 * chegar ao PDF. A prova é o teste que extrai o texto com pdfjs-dist.
 */
import * as React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { SecaoDoCatalogo } from "../agrupamento";
import { diagramarCatalogo, type DiagramacaoDoCatalogo } from "./paginacao";

export interface ProdutoDoPdf {
  foto: string | Buffer | null;
  nome: string;
  codigo: string;
}

export interface SecaoDoPdf {
  chave: string;
  rotulo: string;
  produtos: ProdutoDoPdf[];
}

export interface ContracapaDoPdf {
  razaoSocial: string;
  cnpj: string | null;
  telefone: string | null;
  endereco: string | null;
}

export interface DadosDoCatalogoPdf {
  ano: number;
  logo: string | Buffer | null;
  secoes: SecaoDoPdf[];
  contracapa: ContracapaDoPdf | null;
  /** Ordem já revisada; as seções chegam nela. */
  ordemRevisada: string[];
}

const COR = {
  fundo: "#169BCB",
  titulo: "#173F68",
  verde: "#55C6A8",
  destaque: "#F2C84B",
  texto: "#243746",
  secundario: "#667784",
  claro: "#D7E3EA",
  papel: "#F4F7F8",
  branco: "#FFFFFF",
} as const;


/** @react-pdf/renderer aceita Buffer como `{ data, format }`, não como path. */
function fonteDeImagem(
  fonte: string | Buffer | null | undefined,
): { uri: string } | { data: string; format: string } | undefined {
  if (!fonte) return undefined;
  if (Buffer.isBuffer(fonte)) return { data: fonte.toString("base64"), format: "png" };
  return { uri: fonte };
}

const s = StyleSheet.create({
  pagina: { backgroundColor: COR.papel, padding: 36, fontFamily: "Helvetica" },
  capa: {
    backgroundColor: COR.fundo,
    padding: 48,
    justifyContent: "space-between",
    position: "relative",
  },
  capaTopo: { alignItems: "center", height: "45%", justifyContent: "center" },
  logo: { width: 260, maxHeight: 150, objectFit: "contain" },
  capaMeio: { alignItems: "center" },
  titulo: { fontSize: 46, fontFamily: "Helvetica-Bold", color: COR.branco, letterSpacing: 4 },
  subtitulo: { fontSize: 19, color: COR.branco, letterSpacing: 6, marginTop: 8 },
  ano: { fontSize: 14, color: COR.branco, textAlign: "center" },
  sumarioTitulo: { fontSize: 24, fontFamily: "Helvetica-Bold", color: COR.titulo, marginBottom: 22 },
  colunas: { flexDirection: "row", gap: 24 },
  coluna: { flexGrow: 1, flexBasis: 0 },
  entrada: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  numeroGrande: { fontSize: 26, fontFamily: "Helvetica-Bold", color: COR.claro, width: 42 },
  entradaTexto: { flexGrow: 1 },
  categoria: { fontSize: 12, fontFamily: "Helvetica-Bold", color: COR.titulo },
  numeroPagina: { fontSize: 9, color: COR.secundario, marginTop: 3 },
  cabecalho: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  circulo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COR.verde,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  circuloAlternado: { backgroundColor: COR.fundo },
  indice: { fontSize: 13, fontFamily: "Helvetica-Bold", color: COR.branco },
  secao: { fontSize: 16, fontFamily: "Helvetica-Bold", color: COR.titulo, flexGrow: 1 },
  linha: { height: 2, backgroundColor: COR.verde, marginBottom: 18 },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  cartao: { width: "48%", padding: 10, backgroundColor: COR.branco, borderRadius: 4 },
  fotoCaixa: { height: 110, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  foto: { width: "100%", height: 110, objectFit: "contain" },
  semFoto: { fontSize: 9, color: COR.secundario },
  nome: { fontSize: 11, fontFamily: "Helvetica-Bold", color: COR.texto, marginTop: 4 },
  codigoLinha: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  tarja: { width: 14, height: 6, backgroundColor: COR.destaque, marginRight: 6 },
  codigo: { fontSize: 9, color: COR.secundario },
  rodape: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: COR.secundario,
  },
  contracapa: {
    backgroundColor: COR.titulo,
    padding: 48,
    justifyContent: "space-between",
  },
  contracapaTitulo: { fontSize: 26, fontFamily: "Helvetica-Bold", color: COR.branco },
  contracapaLinha: { fontSize: 12, color: COR.branco, marginBottom: 8 },
});

function Capa({ ano, logo }: { ano: number; logo: string | Buffer | null }) {
  return (
    <Page size="A4" orientation="portrait" style={s.capa}>
      <View style={s.capaTopo}>{logo ? <Image src={fonteDeImagem(logo)} style={s.logo} /> : null}</View>
      <View style={s.capaMeio}>
        <Text style={s.titulo}>CATÁLOGO</Text>
        <Text style={s.subtitulo}>DE PRODUTOS</Text>
      </View>
      <Text style={s.ano}>{ano}</Text>
    </Page>
  );
}

function Sumario({
  diagramacao,
}: {
  diagramacao: DiagramacaoDoCatalogo;
}) {
  const porPagina = diagramacao.sumario;
  const paginas = Array.from({ length: diagramacao.paginasDeSumario }, (_, p) =>
    porPagina.filter((_, i) => Math.floor(i / 20) === p),
  );
  return (
    <>
      {paginas.map((entradas, indice) => (
        <Page key={indice} size="A4" orientation="portrait" style={s.pagina}>
          <Text style={s.sumarioTitulo}>SUMÁRIO</Text>
          <View style={s.colunas}>
            {[0, 1].map((coluna) => (
              <View key={coluna} style={s.coluna}>
                {entradas
                  .filter((e) => e.coluna === coluna)
                  .map((entrada) => (
                    <View key={entrada.chave} style={s.entrada}>
                      <Text style={s.numeroGrande}>{String(entrada.pagina).padStart(2, "0")}</Text>
                      <View style={s.entradaTexto}>
                        <Text style={s.categoria}>{entrada.rotulo}</Text>
                        <Text style={s.numeroPagina}>pág. {entrada.pagina}</Text>
                      </View>
                    </View>
                  ))}
              </View>
            ))}
          </View>
          <View style={s.rodape} fixed>
            <Text>CATÁLOGO DE PRODUTOS</Text>
            <Text render={({ pageNumber }) => `${pageNumber}`} />
          </View>
        </Page>
      ))}
    </>
  );
}

function PaginaDeSecao({
  pagina,
  total,
}: {
  pagina: DiagramacaoDoCatalogo<ProdutoDoPdf>["paginas"][number];
  total: number;
}) {
  return (
    <Page size="A4" orientation="portrait" style={s.pagina}>
      <View style={s.cabecalho}>
        <View style={[s.circulo, pagina.indiceSecao % 2 === 0 ? s.circuloAlternado : undefined]}>
          <Text style={s.indice}>{pagina.indiceSecao}</Text>
        </View>
        <Text style={s.secao}>
          {pagina.secaoRotulo}
          {pagina.primeiraDaSecao ? "" : " (cont.)"}
        </Text>
      </View>
      <View style={s.linha} />
      <View style={s.grade}>
        {pagina.itens.map((produto, indice) => (
          <View key={`${produto.codigo}-${indice}`} style={s.cartao}>
            <View style={s.fotoCaixa}>
              {produto.foto ? (
                <Image src={fonteDeImagem(produto.foto)} style={s.foto} />
              ) : (
                <Text style={s.semFoto}>Sem foto</Text>
              )}
            </View>
            <Text style={s.nome}>{produto.nome}</Text>
            <View style={s.codigoLinha}>
              <View style={s.tarja} />
              <Text style={s.codigo}>{produto.codigo}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.rodape} fixed>
        <Text>{pagina.secaoRotulo}</Text>
        <Text>{`${pagina.numero} / ${total}`}</Text>
      </View>
    </Page>
  );
}

function Contracapa({ dados, numero }: { dados: ContracapaDoPdf; numero: number }) {
  return (
    <Page size="A4" orientation="portrait" style={s.contracapa}>
      <Text style={s.contracapaTitulo}>{dados.razaoSocial}</Text>
      <View>
        {dados.cnpj ? <Text style={s.contracapaLinha}>CNPJ {dados.cnpj}</Text> : null}
        {dados.telefone ? <Text style={s.contracapaLinha}>{dados.telefone}</Text> : null}
        {dados.endereco ? <Text style={s.contracapaLinha}>{dados.endereco}</Text> : null}
      </View>
      <Text style={s.contracapaLinha}>{numero}</Text>
    </Page>
  );
}

export function CatalogoPdfDocument({ dados }: { dados: DadosDoCatalogoPdf }) {
  const secoes: SecaoDoPdf[] = dados.secoes;
  const diagramacao = diagramarCatalogo(secoes, { contracapa: dados.contracapa !== null });
  return (
    <Document title="Catálogo de Produtos" author="Nexus" subject="Catálogo de produtos">
      <Capa ano={dados.ano} logo={dados.logo} />
      <Sumario diagramacao={diagramacao} />
      {diagramacao.paginas.map((pagina, indice) => (
        <PaginaDeSecao
          key={`${pagina.secaoChave}-${indice}`}
          pagina={pagina}
          total={diagramacao.totalDePaginas}
        />
      ))}
      {dados.contracapa && diagramacao.numeroDaContracapa ? (
        <Contracapa dados={dados.contracapa} numero={diagramacao.numeroDaContracapa} />
      ) : null}
    </Document>
  );
}

/** O MESMO buffer para prévia e download — nunca um mockup em HTML. */
export async function renderCatalogoPdf(dados: DadosDoCatalogoPdf): Promise<Buffer> {
  return renderToBuffer(<CatalogoPdfDocument dados={dados} />);
}
