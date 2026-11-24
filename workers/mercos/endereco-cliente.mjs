/**
 * ENDEREÇO DA FICHA DO CLIENTE — enriquecimento, não pré-requisito.
 *
 * Medido pelo dono (23/11): o bloco do cliente na PÁGINA DO PEDIDO traz nome,
 * razão, CNPJ, telefone e cidade/UF — mas NÃO traz rua, número, bairro nem
 * CEP. O endereço existe só na ficha do cliente, que é alcançada em duas
 * requisições: busca por documento na lista `/clientes/` e abertura da ficha.
 *
 * Este módulo é PURO (exceto o cache em disco): recebe linhas de texto e
 * devolve o que a página disse. Campo que não apareceu é `null` — nunca
 * inferido, nunca inventado. Se a leitura falhar, o pedido entra assim mesmo.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const DIAS_VALIDADE_CACHE = 30;

const ROTULOS = [
  // O lookahead impede que o VALOR "Rua das Palmeiras" seja confundido com o
  // rótulo "Rua": só conta como rótulo se a palavra for seguida de `:` ou fim
  // de linha.
  ["logradouro", /^(logradouro|rua|avenida|av\.?|endere[çc]o)(?=\s*:|$)\s*:?\s*(.*)$/i],
  ["numero_end", /^(n[º°]\.?|n\.|n[úu]mero)(?=\s*:|$)\s*:?\s*(.*)$/i],
  ["complemento", /^complemento\s*:?\s*(.*)$/i],
  ["bairro", /^bairro\s*:?\s*(.*)$/i],
  ["cep", /^cep\s*:?\s*(.*)$/i],
  ["cidade", /^cidade\s*:?\s*(.*)$/i],
  ["uf", /^(uf|estado)\s*:?\s*(.*)$/i],
];

const ehRotulo = (linha) => ROTULOS.some(([, re]) => re.test(linha));
const limpo = (valor) => {
  const t = String(valor ?? "").trim();
  return t && !ehRotulo(t) ? t : null;
};

/**
 * O CARTÃO DA FICHA — sem rótulo, em três linhas seguidas.
 *
 * Medido na ficha real (cliente da ABBASPEL, 24/11/2026):
 *
 *   "(49) 9959-0336"
 *   "AVENIDA MICHELE SIMONETTI 357 - SAO MIGUEL"   ← logradouro+número - bairro
 *   "CEP 89580-000"
 *   "FRAIBURGO - Santa Catarina"                   ← cidade - Estado por extenso
 *
 * O parser anterior só entendia campo rotulado ("Rua: ..."), então desta ficha
 * ele salvava **apenas o CEP** — o cliente continuava sem rua na NF-e.
 */
const ESTADO_PARA_UF = {
  acre: "AC", alagoas: "AL", amapá: "AP", amapa: "AP", amazonas: "AM",
  bahia: "BA", ceará: "CE", ceara: "CE", "distrito federal": "DF",
  "espírito santo": "ES", "espirito santo": "ES", goiás: "GO", goias: "GO",
  maranhão: "MA", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS",
  "minas gerais": "MG", pará: "PA", para: "PA", paraíba: "PB", paraiba: "PB",
  paraná: "PR", parana: "PR", pernambuco: "PE", piauí: "PI", piaui: "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
  rondônia: "RO", rondonia: "RO", roraima: "RR", "santa catarina": "SC",
  "são paulo": "SP", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

/** "AVENIDA X 357 - SAO MIGUEL" → logradouro "AVENIDA X", número "357", bairro "SAO MIGUEL". */
function separarLinhaDoCartao(linha) {
  const partes = String(linha).split(" - ");
  const bairro = partes.length > 1 ? partes.pop().trim() : null;
  const resto = partes.join(" - ").trim();
  const m = /^(.*?)[,\s]+(\d{1,6}|s\/?n|sn)$/i.exec(resto);
  if (m) return { logradouro: m[1].trim() || null, numero_end: m[2].toUpperCase(), bairro };
  return { logradouro: resto || null, numero_end: null, bairro };
}

/** Lê o endereço das linhas da ficha. Nunca inventa: ausente é `null`. */
export function lerEnderecoDaFicha(linhas) {
  const resultado = {
    logradouro: null, numero_end: null, complemento: null,
    bairro: null, cep: null, cidade: null, uf: null,
  };
  const texto = (linhas ?? []).map((l) => String(l ?? "").trim()).filter(Boolean);
  for (let i = 0; i < texto.length; i++) {
    for (const [campo, re] of ROTULOS) {
      const m = re.exec(texto[i]);
      if (!m) continue;
      // Rótulo e valor podem vir na mesma linha ("CEP: 89300-000") ou em
      // linhas separadas (campo de formulário com label em cima).
      // O último grupo é sempre o valor: alguns rótulos têm um grupo extra
      // para o sinônimo ("rua|avenida"), outros não.
      const valor = limpo(m[m.length - 1]) ?? limpo(texto[i + 1]);
      if (valor && resultado[campo] == null) resultado[campo] = valor;
      break;
    }
  }
  // ── O CARTÃO SEM RÓTULO (formato real da ficha) ──────────────────────────
  // Ancora no CEP e lê o vizinho de cima (endereço) e o de baixo (cidade/UF).
  // Só preenche o que ainda está nulo: página rotulada continua ganhando.
  if (resultado.logradouro == null || resultado.cidade == null) {
    const iCep = texto.findIndex((l) => /^cep\s*[: ]\s*\d{5}-?\d{3}$/i.test(l));
    if (iCep > 0) {
      const doCartao = separarLinhaDoCartao(texto[iCep - 1]);
      if (resultado.logradouro == null) resultado.logradouro = doCartao.logradouro;
      if (resultado.numero_end == null) resultado.numero_end = doCartao.numero_end;
      if (resultado.bairro == null) resultado.bairro = doCartao.bairro;
      const cidadeLinha = texto[iCep + 1];
      const mCidade = /^(.+?)\s+-\s+(.+)$/.exec(cidadeLinha ?? "");
      if (mCidade) {
        if (resultado.cidade == null) resultado.cidade = mCidade[1].trim();
        if (resultado.uf == null) {
          resultado.uf = ESTADO_PARA_UF[mCidade[2].trim().toLowerCase()] ?? null;
        }
      }
    }
  }
  // A UF costuma vir junto da cidade ("Mafra, SC"). Só a aproveitamos quando
  // é uma sigla de dois caracteres — o resto permanece nulo, sem adivinhação.
  if (resultado.uf == null && resultado.cidade) {
    const m = /,\s*([A-Za-z]{2})$/.exec(resultado.cidade);
    if (m) {
      resultado.uf = m[1].toUpperCase();
      resultado.cidade = resultado.cidade.slice(0, m.index).trim() || null;
    }
  }
  return resultado;
}

export function temEndereco(endereco) {
  return Boolean(endereco?.logradouro || endereco?.bairro || endereco?.cep);
}

/** A chave do cache é o documento — a única chave que o pedido do Mercos traz. */
export function chaveCache(documento) {
  return (String(documento ?? "").replace(/\D/g, "") || null);
}

export function cacheValido(entrada, agoraMs = Date.now(), dias = DIAS_VALIDADE_CACHE) {
  const t = Date.parse(entrada?.lido_em ?? "");
  return Number.isFinite(t) && agoraMs - t < dias * 86_400_000;
}

export function carregarCache(caminho, agoraMs = Date.now(), dias = DIAS_VALIDADE_CACHE) {
  if (!caminho || !existsSync(caminho)) return {};
  try {
    const dados = JSON.parse(readFileSync(caminho, "utf8"));
    const valido = {};
    for (const [chave, entrada] of Object.entries(dados ?? {})) {
      if (cacheValido(entrada, agoraMs, dias)) valido[chave] = entrada;
    }
    return valido;
  } catch {
    return {}; // cache corrompido não é desculpa para parar a importação
  }
}

export function salvarCache(caminho, cache) {
  if (!caminho) return;
  writeFileSync(caminho, JSON.stringify(cache, null, 2) + "\n");
}

/** Só documentos sem cache válido entram — e no máximo `limite` por rodada. */
export function selecionarParaEnriquecer(documentos, cache, limite = 20) {
  const vistos = new Set();
  return [...new Set(documentos.map(chaveCache).filter(Boolean))]
    .filter((chave) => !cache[chave])
    .slice(0, Math.max(0, limite))
    .filter((chave) => (vistos.add(chave), true));
}
