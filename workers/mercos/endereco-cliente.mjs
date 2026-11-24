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
