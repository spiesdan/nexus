/**
 * Tabela IBPT — leitura do CSV oficial e a conta do imposto aproximado.
 *
 * Fonte dos dados: o CSV público do IBPT
 * (`http://200.161.144.113/ibpt/TabelaIBPTax<UF>.csv`), baixado e importado
 * pelo operador — decisão de 2026-10-04: **sem API com token**, CSV por
 * exercício. Formato CONFIRMADO contra o arquivo real (não deduzido):
 *
 *   codigo;ex;tipo;descricao;nacionalfederal;importadosfederal;estadual;
 *   municipal;vigenciainicio;vigenciafim;chave;versao;fonte
 *
 * Separador `;`, `descricao` entre aspas (pode conter `;`), datas `dd/mm/aaaa`,
 * percentuais com ponto decimal (`13.45`). O arquivo é POR UF e a linha não
 * traz a UF — quem importa diz qual é (config fiscal da org).
 *
 * O `tipo` numérico da 3ª coluna do CSV (0 no arquivo de NCM) não é o nosso
 * `tipo`: produtos e serviços vêm em arquivos diferentes e quem importa diz
 * qual dos dois está entrando.
 */

/** Vocabulário do CHECK `fiscal_ibpt_tipo_check` — cobrado por tests/invariants/vocabulario-banco-x-typescript.test.ts. */
export type TipoIbpt = "produto" | "servico";

/**
 * Qual alíquota federal vale para a conta: o IBPT publica DUAS
 * (nacional e importados), e a que se aplica depende da ORIGEM DO PRODUTO,
 * que o pedido não guarda — por isso quem consulta escolhe e a tela mostra
 * as duas. INFERIDO, não é regra escrita em lugar nenhum.
 */
export type OrigemIbpt = "nacional" | "importado";

/** Uma linha já saneada do CSV, em formato de banco (datas ISO, números). */
export interface LinhaIbpt {
  codigo: string;
  ex: string;
  descricao: string | null;
  nacional_federal: number;
  importados_federal: number;
  estadual: number;
  municipal: number;
  /** `yyyy-mm-dd` */
  vigencia_inicio: string;
  /** `yyyy-mm-dd` ou null (a linha pode vir sem vigência final) */
  vigencia_fim: string | null;
  chave: string | null;
  versao: string | null;
  fonte: string | null;
}

export interface LeituraIbpt {
  /** `false` = não é o CSV do IBPT (cabeçalho não bate). */
  valido: boolean;
  linhas: LinhaIbpt[];
  /** Linhas de dados encontradas (antes da triagem). */
  lidas: number;
  /** Linhas descartadas por formato inesperado. */
  ignoradas: number;
}

const COLUNAS_IBPT = [
  "codigo",
  "ex",
  "tipo",
  "descricao",
  "nacionalfederal",
  "importadosfederal",
  "estadual",
  "municipal",
  "vigenciainicio",
  "vigenciafim",
  "chave",
  "versao",
  "fonte",
] as const;

/**
 * Divide uma linha CSV respeitando aspas (o `descricao` do IBPT pode conter
 * `;` e `""` para aspa escapada). Não é RFC 4180 completo — é o suficiente
 * para o arquivo do IBPT, e `lerCsvIbpt` joga fora o que não casar.
 */
export function dividirLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let emAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]!;
    if (emAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          emAspas = false;
        }
      } else {
        atual += c;
      }
    } else if (c === '"') {
      emAspas = true;
    } else if (c === ";") {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

/** Confere o calendário de verdade — `31/02` não existe, e `new Date(2026,1,31)` faria 01/03. */
function dataValida(aaaa: string, mm: string, dd: string): string | null {
  const d = new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)));
  if (d.getUTCFullYear() !== Number(aaaa) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) {
    return null;
  }
  return `${aaaa}-${mm}-${dd}`;
}

/** `dd/mm/aaaa` (formato do IBPT) ou `aaaa-mm-dd` → `aaaa-mm-dd`; resto é null. */
export function lerDataIbpt(bruto: string): string | null {
  const v = bruto.trim();
  if (!v) return null;
  const barra = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (barra) return dataValida(barra[3]!, barra[2]!, barra[1]!);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return dataValida(iso[1]!, iso[2]!, iso[3]!);
  return null;
}

/** Percentual do IBPT: `13.45` (e, por tolerância, `13,45`) → 13.45; fora de 0..100 é null. */
export function lerPercentual(bruto: string): number | null {
  const v = bruto.trim();
  if (!v) return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function cabecalhoIbpt(linha: string): Map<string, number> | null {
  const campos = dividirLinhaCsv(linha.replace(/^\uFEFF/, "")).map((c) => c.trim().toLowerCase());
  const mapa = new Map<string, number>();
  campos.forEach((c, i) => mapa.set(c, i));
  for (const esperada of COLUNAS_IBPT) if (!mapa.has(esperada)) return null;
  return mapa;
}

/**
 * Lê o CSV inteiro. Cabeçalho errado devolve `valido: false` com lista vazia
 * (a rota responde 422 apontando o arquivo errado); linha de dado ruim conta
 * como `ignoradas` e o resto segue — um registro malformado não pode derrubar
 * a importação inteira da tabela nova.
 */
export function lerCsvIbpt(texto: string): LeituraIbpt {
  const linhas = texto.split(/\r?\n/);
  let indiceCabecalho = -1;
  let mapa: Map<string, number> | null = null;
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i]!.trim()) continue;
    mapa = cabecalhoIbpt(linhas[i]!);
    if (mapa) {
      indiceCabecalho = i;
      break;
    }
  }
  if (!mapa || indiceCabecalho < 0) {
    return { valido: false, linhas: [], lidas: 0, ignoradas: 0 };
  }

  const idx = mapa;
  const col = (campo: (typeof COLUNAS_IBPT)[number], campos: string[]): string =>
    (campos[idx.get(campo)!] ?? "").trim();

  const resultado: LeituraIbpt = { valido: true, linhas: [], lidas: 0, ignoradas: 0 };
  for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
    const linha = linhas[i]!;
    if (!linha.trim()) continue;
    resultado.lidas += 1;
    const campos = dividirLinhaCsv(linha);
    if (Math.max(...[...idx.values()]) >= campos.length) {
      resultado.ignoradas += 1;
      continue;
    }
    const codigo = col("codigo", campos);
    if (!/^\d{1,16}$/.test(codigo)) {
      resultado.ignoradas += 1;
      continue;
    }
    const nacional = lerPercentual(col("nacionalfederal", campos));
    const importados = lerPercentual(col("importadosfederal", campos));
    const estadual = lerPercentual(col("estadual", campos));
    const municipal = lerPercentual(col("municipal", campos));
    const inicio = lerDataIbpt(col("vigenciainicio", campos));
    if (nacional === null || importados === null || estadual === null || municipal === null || inicio === null) {
      resultado.ignoradas += 1;
      continue;
    }
    resultado.linhas.push({
      codigo,
      ex: col("ex", campos),
      descricao: col("descricao", campos) || null,
      nacional_federal: nacional,
      importados_federal: importados,
      estadual: estadual,
      municipal: municipal,
      vigencia_inicio: inicio,
      vigencia_fim: lerDataIbpt(col("vigenciafim", campos)),
      chave: col("chave", campos) || null,
      versao: col("versao", campos) || null,
      fonte: col("fonte", campos) || null,
    });
  }
  return resultado;
}

/** A alíquota federal que vale para a origem escolhida (ver `OrigemIbpt`). */
export function percentualFederal(
  linha: Pick<LinhaIbpt, "nacional_federal" | "importados_federal">,
  origem: OrigemIbpt,
): number {
  return origem === "importado" ? linha.importados_federal : linha.nacional_federal;
}

/** Soma das três esferas (federal da origem + estadual + municipal) em %. */
export function percentualTotal(
  linha: Pick<LinhaIbpt, "nacional_federal" | "importados_federal" | "estadual" | "municipal">,
  origem: OrigemIbpt,
): number {
  return percentualFederal(linha, origem) + linha.estadual + linha.municipal;
}

/** Quanto de imposto cabe em `valorCents` a `percentual` (%). Arredondamento: mais próximo. */
export function impostoAproximadoCents(valorCents: number, percentual: number): number {
  return Math.round((valorCents * percentual) / 100);
}
