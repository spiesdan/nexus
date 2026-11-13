/**
 * SIMILARIDADE TEXTUAL — zero dependência externa.
 *
 * Usada pelo Address Recovery Engine para comparar o endereço informado pelo
 * vendedor com os candidatos dos provedores. Não confia num único percentual:
 * cada componente (rua, município, UF, CEP) é pontuado separadamente e os
 * vetos duros (§5 do requisito) vencem qualquer pontuação.
 */

export interface SimilaridadeResultado {
  /** 0 = totalmente diferente, 1 = idêntico. */
  score: number;
  /** Componentes do score para diagnóstico e auditoria. */
  componentes: {
    rua: number | null;
    municipio: number | null;
    uf: number | null;
    cep: number | null;
    bairro: number | null;
    numero: number | null;
  };
}

/** Distância de Levenshtein normalizada (0–1). */
export function levenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb === 0 ? 1 : 0;
  if (lb === 0) return 0;

  let prev: number[] = new Array(lb + 1);
  let curr: number[] = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    const ca = a[i - 1];
    for (let j = 1; j <= lb; j++) {
      const custo = ca === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,     // inserção
        (prev[j] ?? 0) + 1,         // remoção
        ((prev[j - 1] ?? 0) + custo) // substituição
      );
    }
    [prev, curr] = [curr, prev];
  }
  return 1 - (prev[lb] ?? 0) / Math.max(la, lb);
}

/** Jaro-Winkler (0–1), bom para nomes curtos com erros de uma letra. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length;
  const lb = b.length;
  if (la === 0 || lb === 0) return 0;

  const janela = Math.floor(Math.max(la, lb) / 2) - 1;
  const marcaA = new Array(la).fill(false);
  const marcaB = new Array(lb).fill(false);

  let matches = 0;
  for (let i = 0; i < la; i++) {
    const inicio = Math.max(0, i - janela);
    const fim = Math.min(lb, i + janela + 1);
    for (let j = inicio; j < fim; j++) {
      if (!marcaB[j] && a[i] === b[j]) {
        marcaA[i] = true;
        marcaB[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;

  let transposicoes = 0;
  let k = 0;
  for (let i = 0; i < la; i++) {
    if (!marcaA[i]) continue;
    while (!marcaB[k]) k++;
    if (a[i] !== b[k]) transposicoes++;
    k++;
  }

  const jaro =
    (matches / la + matches / lb + (matches - transposicoes / 2) / matches) / 3;
  if (jaro <= 0.7) return jaro;

  // Prefixo comum (máx 4) com peso.
  let prefixo = 0;
  for (let i = 0; i < Math.min(4, la, lb); i++) {
    if (a[i] === b[i]) prefixo++;
    else break;
  }
  return jaro + prefixo * 0.1 * (1 - jaro);
}

/** Similaridade de tokens (conjunto de palavras): interseção sobre união. */
export function tokensSimilaridade(a: string, b: string): number {
  const ta = new Set(a.split(/\s+/).filter(Boolean));
  const tb = new Set(b.split(/\s+/).filter(Boolean));
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersecao = 0;
  for (const t of ta) if (tb.has(t)) intersecao++;
  return intersecao / (ta.size + tb.size - intersecao);
}

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extrairCep(texto: string): string | null {
  const m = texto.match(/\b(\d{5})[- ]?(\d{3})\b/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** "89520000" → "89520-000". CEP torto (menos de 8 dígitos) vira null. */
export function formatarCep(cep: string | null | undefined): string | null {
  const digitos = (cep ?? "").replace(/\D/g, "");
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : null;
}

/**
 * Extrai CEP de uma string de endereço. Se não houver CEP no texto, tenta
 * associar com o CEP do cadastro (passado à parte).
 */
export function compararCep(cepA: string | null, cepB: string | null): number | null {
  if (!cepA || !cepB) return null;
  const na = cepA.replace(/[^0-9]/g, "");
  const nb = cepB.replace(/[^0-9]/g, "");
  if (!na || !nb) return null;
  if (na === nb) return 1;
  // CEP com mesmo prefixo de 5 dígitos = mesma região, pontuação parcial.
  if (na.slice(0, 5) === nb.slice(0, 5)) return 0.5;
  return 0;
}

/**
 * Compara dois componentes textuais (rua, município, bairro) com tolerância a
 * erros de digitação de 1–2 letras. Retorna 0 se completamente diferentes,
 * 1 se idênticos após normalização.
 */
export function compararComponente(textoA: string | null, textoB: string | null): number | null {
  if (textoA == null || textoB == null) return null;
  const a = normalizarTexto(textoA);
  const b = normalizarTexto(textoB);
  if (a === "" || b === "") return null;
  if (a === b) return 1;
  // Abreviação comum: "Av." → "Avenida", "R." → "Rua" etc. são normalizadas
  // pelo caller; aqui só comparamos o que sobrou.
  const lev = levenshtein(a, b);
  const jw = jaroWinkler(a, b);
  const tok = tokensSimilaridade(a, b);
  return Math.max(lev, jw, tok);
}

/**
 * Pontua similaridade entre o endereço informado e um candidato do provedor.
 * `componentes` traz as partes extraídas de cada lado; faltantes são nulos
 * e não punem o score (só vetos duros, tratados em confianca.ts, punem).
 */
export function similaridadeEndereco(
  informado: {
    rua?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
    bairro?: string | null;
    numero?: string | null;
  },
  candidato: {
    rua?: string | null;
    municipio?: string | null;
    uf?: string | null;
    cep?: string | null;
    bairro?: string | null;
    numero?: string | null;
  }
): SimilaridadeResultado {
  const componentes: SimilaridadeResultado["componentes"] = {
    rua: compararComponente(informado.rua ?? null, candidato.rua ?? null),
    municipio: compararComponente(informado.municipio ?? null, candidato.municipio ?? null),
    uf: compararComponente(informado.uf ?? null, candidato.uf ?? null),
    cep: compararCep(informado.cep ?? null, candidato.cep ?? null),
    bairro: compararComponente(informado.bairro ?? null, candidato.bairro ?? null),
    numero: compararComponente(informado.numero ?? null, candidato.numero ?? null),
  };

  // Peso por componente. Município e UF são estruturais; CEP é confirmação;
  // rua e bairro são descritivos; número é detalhado.
  const pesos = { rua: 0.25, municipio: 0.2, uf: 0.15, cep: 0.15, bairro: 0.15, numero: 0.1 };
  let soma = 0;
  let pesoTotal = 0;
  for (const [chave, peso] of Object.entries(pesos) as [keyof typeof pesos, number][]) {
    const valor = componentes[chave];
    if (valor != null) {
      soma += valor * peso;
      pesoTotal += peso;
    }
  }
  const score = pesoTotal === 0 ? 0 : soma / pesoTotal;
  return { score, componentes };
}

/**
 * Distância geográfica em metros entre dois pontos (haversine). Usada para
 * comparar candidatos de provedores diferentes (veto de distância).
 */
export function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
