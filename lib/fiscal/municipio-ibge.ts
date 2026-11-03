/**
 * O CÓDIGO IBGE DO MUNICÍPIO — a peça que faltava para o cadastro preencher a
 * NF-e sozinho.
 *
 * O `enderDest` da NF-e é um TLocal e exige `cMun` (7 dígitos). O cadastro de
 * contatos guarda cidade e UF, mas não o código — e era por isso que o
 * formulário de emissão pedia o endereço inteiro na mão, mesmo com o cliente
 * cadastrado. O comentário do sidecar dizia exatamente isso: "o cMun (IBGE) que
 * o cadastro de contatos não guarda".
 *
 * A tabela vem do serviço de localidades do IBGE
 * (`https://servicodados.ibge.gov.br/api/v1/localidades/municipios`), baixada
 * em 2026-11-03: 5.571 municípios. É dado oficial, versionado no repositório —
 * e não consulta em tempo de execução, porque instalação self-host pode estar
 * sem saída para a internet.
 *
 * Regenerar:
 *
 *     curl -s https://servicodados.ibge.gov.br/api/v1/localidades/municipios \
 *       | jq -c '[.[] | {nome, id, uf: (.microrregiao.mesorregiao.UF.sigla // .["regiao-imediata"]["regiao-intermediaria"].UF.sigla)}]'
 *
 * e regravar `municipios-ibge.json` no formato `"NOME SEM ACENTO/UF": "codigo|Nome Oficial"`.
 */
import tabela from "./municipios-ibge.json";

export interface MunicipioIbge {
  /** cMun — 7 dígitos, como o TLocal da NF-e exige. */
  codigo: string;
  /** xMun — o nome oficial do IBGE, sem o "cidade, estado" que o cadastro às vezes tem. */
  nome: string;
  uf: string;
}

const MAPA = tabela as Record<string, string>;

/**
 * O estado escrito por extenso, que o cadastro também traz.
 *
 * Medido nesta instalação: "Canoinhas, Santa Catarina" (UF vazia), "Irati,
 * Paraná" (UF vazia), "Três Barras, Santa Catarina". Sem esta tabela o nome do
 * estado depois da vírgula era jogado fora e a cidade com homônimo (Irati
 * existe em PR e SC) ficava sem código — pedindo UF a quem já tinha escrito o
 * estado, só que por extenso.
 */
const UF_POR_NOME: Record<string, string> = {
  ACRE: "AC",
  ALAGOAS: "AL",
  AMAPA: "AP",
  AMAZONAS: "AM",
  BAHIA: "BA",
  CEARA: "CE",
  "DISTRITO FEDERAL": "DF",
  "ESPIRITO SANTO": "ES",
  GOIAS: "GO",
  MARANHAO: "MA",
  "MATO GROSSO": "MT",
  "MATO GROSSO DO SUL": "MS",
  "MINAS GERAIS": "MG",
  PARA: "PA",
  PARAIBA: "PB",
  PARANA: "PR",
  PERNAMBUCO: "PE",
  PIAUI: "PI",
  "RIO DE JANEIRO": "RJ",
  "RIO GRANDE DO NORTE": "RN",
  "RIO GRANDE DO SUL": "RS",
  RONDONIA: "RO",
  RORAIMA: "RR",
  "SANTA CATARINA": "SC",
  "SAO PAULO": "SP",
  SERGIPE: "SE",
  TOCANTINS: "TO",
};

/** "São Bento do Sul" → "SAO BENTO DO SUL". */
export function normalizarMunicipio(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Resolve o município do cadastro no código do IBGE.
 *
 * O cadastro tem cidade escrita de três jeitos — "Mafra", "MAFRA" e
 * "Mafra, Santa Catarina" — e o `uf` às vezes vem vazio. A cidade é lida até a
 * vírgula; sem UF, só resolve quando o nome existe em um único estado (é o caso
 * de Mafra) — se houver homônimo, devolve `null` em vez de escolher no chute,
 * porque município errado na NF-e é rejeição na SEFAZ.
 */
export function municipioIbge(
  cidade: string | null | undefined,
  uf: string | null | undefined,
): MunicipioIbge | null {
  const [cidadeBruta = "", estadoBruto = ""] = (cidade ?? "").split(",");
  const nome = normalizarMunicipio(cidadeBruta);
  if (!nome) return null;
  // UF de 2 letras manda; na falta dela, o estado escrito por extenso no mesmo
  // campo ("Mafra, Santa Catarina") é a informação que o cadastro deu.
  let sigla = normalizarMunicipio(uf ?? "");
  if (sigla.length !== 2) sigla = UF_POR_NOME[normalizarMunicipio(estadoBruto)] ?? "";

  if (sigla.length === 2) {
    const achado = MAPA[`${nome}/${sigla}`];
    if (!achado) return null;
    const [codigo, oficial] = achado.split("|");
    return codigo && oficial ? { codigo, nome: oficial, uf: sigla } : null;
  }

  const candidatos = Object.entries(MAPA).filter(([chave]) => chave.startsWith(`${nome}/`));
  if (candidatos.length !== 1) return null;
  const [chave, valor] = candidatos[0] as [string, string];
  const [codigo, oficial] = valor.split("|");
  const ufDoAchado = chave.split("/")[1];
  return codigo && oficial && ufDoAchado ? { codigo, nome: oficial, uf: ufDoAchado } : null;
}
