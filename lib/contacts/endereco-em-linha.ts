/**
 * ENDEREÇO EM UMA LINHA — uma decisão, um lugar.
 *
 * O endereço do contato mora em colunas estruturadas (`logradouro`,
 * `numero_end`, `complemento`, `bairro`, `cidade`, `uf`, `cep`), mas três
 * lugares precisam da mesma cadeia pronta: `endereco_entrega` do pedido
 * (romaneio, impressão, mapa), o prefill do editor e o backfill histórico.
 * Cada um montava do seu jeito — "Rua X, 123" aqui, "Rua X 123 - bairro" ali
 * — e o romaneio mostrava "Endereço não informado" para cliente COM endereço.
 *
 * A regra: rua + número + complemento, depois bairro + cidade/UF + CEP, só
 * com o que existir. Vazio de verdade devolve "" — quem decide o literal de
 * ausência ("Endereço não informado") é a tela, não o formatador.
 *
 * ## `enderecoDaRua`: o mesmo endereço, só a rua
 *
 * A impressão do Mercos separa o endereço em CAMPOS: "Endereço" leva rua +
 * número + complemento, e bairro, CEP, cidade e estado têm linhas próprias.
 * Usar `enderecoEmLinha` ali repetia bairro, cidade, UF e CEP em cada
 * impresso. `enderecoDaRua` é a parte que o campo "Endereço" imprime.
 */

import { nomeDoEstado } from "@/lib/format/estados";

/** O que qualquer endereço estruturado precisa ter para virar linha. */
export interface EnderecoEstruturado {
  logradouro?: string | null;
  numero_end?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}

function limpo(v: string | null | undefined): string {
  // "NULL" literal do export do WP/Mercos ("RUA BRASIL, 183, NULL"). É ausência
  // disfarçada de texto, e ia para a tela, o romaneio e o mapa: medido em 87
  // cadastros desta instalação (51 na rua, 36 no bairro).
  return (v ?? "")
    .replace(/\bNULL\b\.?/gi, " ")
    .replace(/\s+/g, " ")
    // Separador que sobrou do "NULL" removido ("RUA X, 132,"): sem isto o
    // número repetido não é reconhecido e a linha sai "132,, 132".
    .replace(/^[\s,\-–]+|[\s,\-–]+$/g, "");
}

/**
 * "Rua Antônio Liller, 585 — Centro, Canoinhas/SC, 89460-000".
 * CEP sai como está no banco (só dígitos ou com hífen, sem inventar formato).
 */
export function enderecoEmLinha(e: EnderecoEstruturado | null | undefined): string {
  if (!e) return "";
  const numero = limpo(e.numero_end);
  // O WP importava "rua + número" colados no logradouro E o número separado
  // ("RUA X, 65" + numero_end "65" → "65, 65"). O sufixo repetido sai.
  let rua = limpo(e.logradouro);
  if (rua && numero) {
    const esc = numero.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rua = rua.replace(new RegExp(`[\\s,\\-]+${esc}$`, "i"), "").trim();
  }
  const compl = limpo(e.complemento);
  const bairro = limpo(e.bairro);
  const cidade = limpo(e.cidade);
  const uf = limpo(e.uf).toUpperCase();
  const cep = limpo(e.cep);

  const primeira = [rua + (numero ? `, ${numero}` : ""), compl].filter(Boolean).join(" — ");
  const municipio = [cidade, uf].filter(Boolean).join("/");
  const segunda = [bairro, municipio, cep].filter(Boolean).join(", ");
  return [primeira, segunda].filter(Boolean).join(" — ");
}

/**
 * A RUA DO IMPRESSO — logradouro + número + complemento, separados por espaço.
 *
 * O Mercos imprime o campo "Endereço" como "RUA MATOS COSTA 502 ********": a
 * rua, o número e o complemento, e SÓ isso — bairro, CEP, cidade e estado vão
 * nos campos deles. O dado veio do WP/Mercos com os três pedaços numa coluna
 * só ("RUA MATOS COSTA, 502, ********") e o número repetido em `numero_end`;
 * por isso os segmentos são separados e o número/complemento só entram quando
 * ainda não estão lá.
 */
export function enderecoDaRua(e: EnderecoEstruturado | null | undefined): string {
  if (!e) return "";
  const segmentos = limpo(e.logradouro)
    .split(",")
    .map((parte) => limpo(parte))
    .filter(Boolean);
  const jaTem = (valor: string) =>
    segmentos.some((segmento) => segmento.toLowerCase() === valor.toLowerCase());

  const numero = limpo(e.numero_end);
  if (numero && !jaTem(numero)) segmentos.push(numero);
  const complemento = limpo(e.complemento);
  if (complemento && !jaTem(complemento)) segmentos.push(complemento);

  return segmentos.join(" ");
}

/**
 * A CIDADE SEM O ESTADO COLADO — "Porto União, Santa Catarina" → "Porto União".
 *
 * O cadastro do Mercos trouxe o nome do estado junto da cidade em parte dos
 * contatos. O impresso já tem o campo "Estado", então a linha da cidade
 * repetia o que a linha de baixo diz. Só remove o sufixo quando ele é o nome
 * do estado da UF (ou a própria sigla) — um bairro depois da vírgula fica.
 */
export function cidadeSemEstado(
  cidade: string | null | undefined,
  uf: string | null | undefined,
): string {
  const texto = limpo(cidade);
  if (!texto) return texto;
  const corte = texto.lastIndexOf(",");
  if (corte < 0) return texto;

  const sufixo = limpo(texto.slice(corte + 1)).toLowerCase();
  const nome = (nomeDoEstado(uf) ?? "").toLowerCase();
  const sigla = limpo(uf).toLowerCase();
  if (sufixo !== "" && (sufixo === nome || sufixo === sigla)) {
    return limpo(texto.slice(0, corte));
  }
  return texto;
}
