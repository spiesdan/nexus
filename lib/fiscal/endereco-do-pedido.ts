/**
 * ENDEREÇO FISCAL A PARTIR DO `endereco_entrega` DO PEDIDO.
 *
 * O coletor do Mercos traz razão, documento, fantasia, telefone e cidade —
 * nunca rua, número e bairro (`workers/mercos/coletar.mjs`). O endereço existe
 * no PEDIDO (76% dos últimos 90 dias), e é a reserva para o cadastro vazio.
 *
 * CONSERVADOR: se o texto não separa com segurança, devolve null. Endereço
 * fiscal errado é pior que campo vazio — a SEFAZ rejeita, ou pior, aceita e
 * emite nota com destino errado.
 *
 * Formatos medidos em produção:
 *   "FAZ BATATAIS, S/N — BELA VISTA DO SUL, MAFRA/SC, 89300001"
 *   "BR-280, 1421, DE 1180 A 1998 LADO PAR, 1421 — CAMPO DA ÁGUA VERDE, Canoinhas/SC, 89466218"
 *
 * Regra de leitura: `—` separa logradouro+número de bairro+cidade/UF+CEP; a
 * direita é lida da última vírgula para trás (CEP de 8 dígitos, cidade/UF,
 * bairro); a esquerda tem vírgulas INTERNAS — a primeira parte é o logradouro,
 * a última é o número, o meio é complemento.
 */

export interface EnderecoDoPedido {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}

const CEP = /^\d{8}$/;
const CIDADE_UF = /^([^/]+)\/([A-Za-z]{2})$/;
const NUMERO = /^(\d+[A-Za-z]?|[Ss]\/?[Nn])$/;

function limpo(partes: string[]): string {
  return partes.map((p) => p.trim().replace(/\s+/g, " ")).filter(Boolean).join(", ");
}

export function enderecoDoPedido(valor: string | null | undefined): EnderecoDoPedido | null {
  const texto = (valor ?? "").trim();
  if (!texto) return null;

  const traco = texto.indexOf("—");
  if (traco < 0) return null; // sem separador, não há como separar bairro de rua
  const esquerda = texto.slice(0, traco).trim();
  const direita = texto.slice(traco + 1).trim();
  if (!esquerda || !direita) return null;

  // Direita, de trás para frente: CEP, cidade/UF, bairro (com vírgulas internas).
  const partes = direita.split(",").map((p) => p.trim());
  if (partes.length < 3) return null;
  const cep = partes[partes.length - 1]!.replace(/\D/g, "");
  if (!CEP.test(cep)) return null;
  const cidadeUf = CIDADE_UF.exec(partes[partes.length - 2] ?? "");
  if (!cidadeUf) return null;
  const bairro = limpo(partes.slice(0, -2));
  if (!bairro) return null;

  // Esquerda: primeira parte é rua, última é número, meio é complemento.
  const partesRua = esquerda.split(",").map((p) => p.trim());
  if (partesRua.length < 2) return null;
  const logradouro = partesRua[0]!;
  const numero = partesRua[partesRua.length - 1]!;
  if (!/[A-Za-z]/.test(logradouro) || !NUMERO.test(numero)) return null;
  // O Mercos repete o número no meio em alguns endereços de rodovia
  // ("BR-280, 1421, DE 1180 A 1998 LADO PAR, 1421"). Um segmento IGUAL ao
  // número é duplicata, não complemento — descartá-lo não inventa informação.
  const meio = limpo(
    partesRua.slice(1, -1).filter((parte) => parte !== numero && !/^\d+$/.test(parte)),
  );

  return {
    logradouro,
    numero: numero.toUpperCase().replace(/\s/g, ""), // "s/n" → "S/N"
    ...(meio ? { complemento: meio } : {}),
    bairro,
    cidade: cidadeUf[1]!.trim().replace(/\s+/g, " "),
    uf: cidadeUf[2]!.toUpperCase(),
    cep,
  };
}
