/**
 * GEOCODIFICAÇÃO servidor — Nominatim com ritmo justo e cache no contato.
 *
 * O mapa antigo geocodificava no NAVEGADOR, 1 req/s por endereço, a cada
 * abertura. Agora o servidor resolve (mesma fila de 1,1s entre chamadas,
 * User-Agent honesto, `countrycodes=br`) e grava em `contacts` — a segunda
 * abertura não reconsulta nada. Quando a rua não existe no OSM, o último
 * recurso é o bairro/CEP/município, gravado como APROXIMADO (`precisao:
 * "bairro"` ou `"cidade"`); sem nem isso, a parada vai para "sem mapa", nunca
 * para um ponto inventado.
 */

export type EstadoGeo = "ok" | "nao_encontrado" | "ambiguo" | "erro";

/** O quanto o ponto vale: número certo, rua aproximada, bairro ou só cidade. */
export type PrecisaoGeo = "numero" | "rua" | "bairro" | "cidade";

export interface ResultadoGeo {
  estado: EstadoGeo;
  latitude: number | null;
  longitude: number | null;
  precisao: PrecisaoGeo | null;
}

export interface PartesEndereco {
  logradouro?: string | null;
  numero_end?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  /**
   * CEP — o último recurso antes de desistir. Endereço rural ("Lageadinho a
   * 100 mts da BR") e rua que o OSM do interior não tem não casam por nome,
   * mas o CEP sempre resolve para o município. O pino sai marcado como
   * aproximado (precisão "cidade"), nunca como se fosse a porta.
   */
  cep?: string | null;
}

/** "268 sala03" → "268"; "SN"/"S/N"/"KM 258" → null (não é número de porta). */
export function normalizarNumero(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim().toUpperCase();
  if (v === "" || v === "SN" || v === "S/N" || /^KM\b/.test(v)) return null;
  const m = v.match(/\d+/);
  return m ? m[0] : null;
}

/** "89520000" → "89520-000". CEP torto (menos de 8 dígitos) vira null. */
export function formatarCep(cep: string | null | undefined): string | null {
  const digitos = (cep ?? "").replace(/\D/g, "");
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : null;
}

const ABREVIACOES: [RegExp, string][] = [
  [/\bR\.?(?=[\s.,]|$)/g, "Rua"],
  [/\bAV\.?(?=[\s.,]|$)/gi, "Avenida"],
  [/\bCEL\.?(?=[\s.,]|$)/gi, "Coronel"],
  [/\bMAL\.?(?=[\s.,]|$)/gi, "Marechal"],
  [/\bGOV\.?(?=[\s.,]|$)/gi, "Governador"],
  [/\bROD\.?(?=[\s.,]|$)/gi, "Rodovia"],
  [/\bEST\.?(?=[\s.,]|$)/gi, "Estrada"],
  [/\bPCA\.?(?=[\s.,]|$)/gi, "Praça"],
  [/\bJD\.?(?=[\s.,]|$)/gi, "Jardim"],
];

/** "R CEL ALBUQUERQUE" → "Rua Coronel ALBUQUERQUE". */
export function expandirAbreviacoes(rua: string): string {
  // "AV.GOV.Jorge" (ponto sem espaço): separa antes de expandir.
  let s = rua
    .trim()
    .replace(/([A-Za-z])\.([A-Za-z])/g, "$1 $2")
    .replace(/\s+/g, " ");
  for (const [re, por] of ABREVIACOES) s = s.replace(re, por);
  return s.replace(/\s+/g, " ").trim();
}

// Complemento colado onde era para ser bairro/número ("LOJA", "FUNDOS",
// "SALA 3", "CASA") envenena a consulta: o Nominatim procura literalmente.
const COMPLEMENTOS =
  /\b(LOJAS?|SALAS?|SOBRELOJA|CASAS?|FUNDOS|FRENTE|PREDIOS?|PRÉDIOS?|GALP(O|AO|ÕES)|BOX|QUIOSQUE|PISO|SUPERIOR|TERREO|TÉRREO|ALTOS|BAIXOS|SOBRADO|BARRACA?O|BARRACÕES|CXPST|CAIXA POSTAL|CX POSTAL|SN|S\/N)\s*\d*\b\.?/gi;

// Faixa de numeração do cadastro ("... , ATÉ 599/600", "DE 500/501 AO FIM",
// "... DE 1400 A 2298 LADO PAR") e referência antiga ("antiga panif arco
// iris"): não são endereço, e o Nominatim tenta casar literalmente.
const FAIXAS = /\s+AT[EÉ]\s.*$/i;
const ATE_AO_FIM = /\s+DE\s+[\d/\s]+\s+AO\s+FIM.*$/i;
const LADO_PAR_IMPAR = /\s+DE\s+[\d/\s]+\s+A\s+[\d/\s]+.*LADO\s+(PAR|ÍMPAR).*$/i;
const LADO_SOZINHO = /\s+LADO\s+(PAR|ÍMPAR).*$/i;
// Faixa sem "lado" ("... , 771, DE 120/121 A 899/900"): resto de numeração
// do cadastro. Exige dígitos dos dois lados para não comer nome de rua.
const FAIXA_DE_A = /,?\s*DE\s+\d[\d/\s]*\s+A\s+\d.*$/i;
const REFERENCIA_ANTIGA = /\s+ANTIGA?\b.*$/i;

/** Tira complemento do trecho sem apagar o resto ("268 sala03" → "268"). */
export function limparComplemento(trecho: string): string {
  // NFC primeiro: "ÃO" decomposto (A + ~ combinante) tem fronteira no meio
  // e o corte de letra solta comeria o O de BARÃO/SÃO — medido nas duas
  // formas, não confiar na forma que o banco entrega.
  const semFaixa = expandirAbreviacoes(trecho.normalize("NFC"))
    .replace(FAIXAS, " ")
    .replace(ATE_AO_FIM, " ")
    .replace(LADO_PAR_IMPAR, " ")
    .replace(LADO_SOZINHO, " ")
    .replace(FAIXA_DE_A, " ")
    .replace(REFERENCIA_ANTIGA, " ")
    // "NULL" e "***" do export do WP/Mercos ("FERREIRA 505 NULL").
    .replace(/\bNULL\b\.?/gi, " ")
    .replace(/\*+/g, " ")
    // "n.177"/"Nº 45" → número puro (o normalizarNumero extrai os dígitos).
    .replace(/\bN\.?º?\s*(?=\d)/gi, "")
    // Letra solta no MEIO ("CAMPOS S SALES" → "CAMPOS SALES"): inicial
    // perdida do cadastro. Só maiúscula seguida de outra palavra — "RUA X"
    // no fim pode ser o nome de verdade e fica. Lookaround com \p{L} de
    // propósito: o \b não enxerga o Ã como letra (medido no Node 24) e
    // comia o O de BARÃO/SÃO.
    .replace(/(?<![\p{L}\d])[A-Z]\.?(?![\p{L}\d])(?=\s+\S)/gu, "");
  return semFaixa.replace(COMPLEMENTOS, " ").replace(/\s+/g, " ").replace(/^[,\-–\s]+|[,\-–\s]+$/g, "").trim();
}

/**
 * A rua sem o número colado: o WP importava "rua + número" no logradouro E o
 * número separado ("RUA X, 65" + "65" → consulta "65, 65", que o Nominatim
 * não entende).
 */
export function ruaSemNumeroColado(logradouro: string, numero: string | null): string {
  let rua = logradouro.trim().replace(/\s+/g, " ");
  if (rua && numero) {
    const esc = numero.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rua = rua.replace(new RegExp(`[\\s,\\-]+${esc}$`, "i"), "").trim();
  }
  return rua;
}

/**
 * A cadeia de consultas, da mais exata para a mais solta. Cada fase existe
 * por um envenenamento medido (sondar-variantes.ts, 2026-09-06/07):
 * 1. rua + número (o exato, quando o OSM tem o imóvel);
 * 2. rua + cidade (número com "sala03" ou inexistente não mata a rua);
 * 3. nome sem tipo + número ("Av. Rubens Ribeiro" × OSM "Rua Rubens
 *    Ribeiro": tipo trocado no cadastro zera tudo, mas sem tipo + número
 *    o Nominatim cai para os trechos da rua);
 * 4. primeiro trecho + cidade (lixo irredutível no fim — "systen som");
 * 5. rua + cidade sem UF (cadastro com UF trocada: Canoinhas/PR).
 * A rua já sai normalizada (abreviatura expandida, complemento fora);
 * bairro entra quando é bairro de verdade.
 */
/**
 * Número de porta do cadastro: separado ("RUA X, 65") ou colado no fim do
 * logradouro ("RUA X, 100" — exige a vírgula; "TRAVESSA 7" é nome, não número).
 */
function numeroDa(p: PartesEndereco): string | null {
  const ruaLimpa = limparComplemento(p.logradouro ?? "");
  const numero = normalizarNumero(p.numero_end);
  if (numero) return numero;
  return ruaLimpa.match(/,\s*(\d{1,6})\s*$/)?.[1] ?? null;
}

export function montarConsultas(p: PartesEndereco): string[] {
  const ruaLimpa = limparComplemento(p.logradouro ?? "");
  const numero = numeroDa(p);
  const rua = ruaSemNumeroColado(ruaLimpa, numero);
  const cidade = (p.cidade ?? "").trim().replace(/\s+/g, " ");
  const uf = (p.uf ?? "").trim().toUpperCase();
  if (!rua || !cidade) return [];
  const bairroLimpo = limparComplemento(p.bairro ?? "");
  const bairroVale = bairroLimpo.length >= 3 ? [bairroLimpo] : [];
  const base = [...bairroVale, cidade, uf, "Brasil"].filter(Boolean).join(", ");
  const cadeia: string[] = [];
  if (numero) cadeia.push(`${rua}, ${numero}, ${base}`);
  cadeia.push(`${rua}, ${cidade}, ${uf}, Brasil`.replace(/, ,/g, ","));
  const semTipo = semTipoVial(rua);
  if (numero && semTipo && semTipo.toLowerCase() !== rua.toLowerCase()) {
    cadeia.push(`${semTipo}, ${numero}, ${base}`);
  }
  // O NOME COMO O OSM ESCREVE — sem o título e sem o conector do cadastro.
  //
  // Medido na carga 039 (12/11/2026): "RUA VEREADOR JOAO ALEXANDRINA" não
  // existe no OSM, mas "Rua João Alexandrina" existe; e "R. Saulo de Carvalho"
  // não existe, mas "Rua Saulo Carvalho" existe. Nos dois casos a consulta
  // exata falhava, a cadeia caía no município e o pino ia parar na Prefeitura
  // — a 1,3 km da parada, e ainda escolhida como a primeira pela ordem por
  // distância. O título ("Vereador", "Dr.", "Cel.") e o conector ("de", "da",
  // "do") são invenção do cadastro, não do mapa; tirá-los é a diferença entre
  // achar a rua e desistir.
  //
  // Sem número de propósito: quando a rua+numero já falhou, repetir o número
  // na variante só gasta outra chamada de 1,1s e costuma falhar igual.
  for (const variante of variantesDoNome(semTipo || rua)) {
    cadeia.push(`${variante}, ${cidade}, ${uf}, Brasil`);
  }
  // Último recurso antes do manual: primeiro trecho (rua sem o lixo do fim).
  const primeiroTrecho = rua.split(",")[0]?.trim() ?? "";
  const trechoUtil = primeiroTrecho || rua;
  if (primeiroTrecho && primeiroTrecho.toLowerCase() !== rua.toLowerCase()) {
    cadeia.push(`${primeiroTrecho}, ${cidade}, ${uf}, Brasil`.replace(/, ,/g, ","));
  }
  // UF trocada no cadastro (Canoinhas/PR): sem UF o Nominatim resolve.
  cadeia.push(`${trechoUtil}, ${cidade}, Brasil`);
  return [...new Set(cadeia)];
}

/**
 * Nome sem o tipo de via ("Avenida Rubens Ribeiro da Silva" → "Rubens
 * Ribeiro da Silva"). O cadastro chama de Av. o que o OSM chama de Rua (e
 * vice-versa); sem o tipo, com número, o Nominatim encontra os trechos.
 */
export function semTipoVial(rua: string): string {
  return rua
    .replace(
      /^(rua|avenida|travessa|trav|alameda|rodovia|estrada|praça|praca|largo|viela|beco|passarela|via)\b\.?\s*/i,
      "",
    )
    .trim();
}

/**
 * Títulos que o cadastro cola na frente do nome e o OSM não usa: "VEREADOR
 * JOAO ALEXANDRINA" é "Rua João Alexandrina" no mapa. Só os que são cargo —
 * "Dom", "Frei" e "Marechal" ficam de fora porque costumam ser o próprio nome
 * da rua ("Rua Dom Pedro II", "Rua Marechal Deodoro").
 */
const HONORIFICOS =
  /^(?:(?:vereador|vereadora|deputado|deputada|senador|senadora|governador|governadora|prefeito|prefeita|doutor|doutora|dr|dra|coronel|cel|major|capitão|capitao|tenente|general|professor|professora|prof|padre)\s+)+/i;

export function semHonorifico(rua: string): string {
  return rua.replace(HONORIFICOS, "").trim();
}

/**
 * Conectores que o cadastro tem e o OSM não: "SAULO DE CARVALHO" × "Rua Saulo
 * Carvalho". Não vale a pena quando sobra uma palavra só ("RUA DA PAZ" →
 * "RUA PAZ" viraria consulta genérica em qualquer cidade) — nesse caso devolve
 * o nome original e a variante some.
 */
export function semConectores(rua: string): string {
  const limpa = rua
    .replace(/(^|\s)(de|da|do|das|dos)(\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Só vale quando sobra NOME suficiente: "Rua da Paz" → "Rua Paz" é uma
  // consulta genérica que acha qualquer praça; já "Rua Saulo Carvalho" tem
  // duas palavras de nome e continua específica.
  const nome = semTipoVial(limpa);
  return nome.split(" ").filter(Boolean).length >= 2 ? limpa : rua;
}

/**
 * As variantes do nome da rua, na ordem em que valem a pena: título fora,
 * conector fora, e os dois juntos. Cada uma é única e diferente do original.
 */
export function variantesDoNome(rua: string): string[] {
  const saida = new Set<string>();
  const original = rua.trim().toLowerCase();
  const candidatos = [
    semHonorifico(rua),
    semConectores(rua),
    semConectores(semHonorifico(rua)),
  ];
  for (const c of candidatos) {
    const v = c.trim();
    if (v && v.toLowerCase() !== original) saida.add(v);
  }
  return [...saida];
}

/**
 * O geocodificador é o Nominatim (OpenStreetMap) — público por padrão, próprio
 * quando `GEOCODER_URL` aponta para a instância da casa.
 *
 * A decisão de stack (Leaflet + OSM + Nominatim + OSRM, tudo autohospedável)
 * está em `docs/adr/0002-stack-geografica-osm.md`; o procedimento de subir as
 * instâncias e atualizar os dados, em `docs/runbooks/geodados.md`.
 *
 * Não existe código de provedor aqui de propósito: o contrato é o do Nominatim
 * (`/search?format=json`). Trocar de mecanismo significa escrever outro cliente
 * e escolher por variável — o módulo que consome (rotas) não muda.
 */
const NOMINATIM_PADRAO = "https://nominatim.openstreetmap.org/search";

/** Endpoint efetivo — a instância própria vence o default público. */
export function urlDoGeocoder(): string {
  const bruto = (process.env.GEOCODER_URL ?? "").trim();
  return bruto || NOMINATIM_PADRAO;
}

/**
 * Ritmo mínimo entre chamadas. `0` (instância própria) desliga a espera; valor
 * inválido volta ao padrão público em vez de zerar por acidente.
 */
export function ritmoDoGeocoderMs(): number {
  const texto = (process.env.GEOCODER_MIN_INTERVALO_MS ?? "").trim();
  if (texto === "") return 1100;
  const bruto = Number(texto);
  return Number.isFinite(bruto) && bruto >= 0 ? bruto : 1100;
}

/**
 * Os `addresstype` que são um LUGAR maior que o bairro: CEP e município.
 * Servem de ponto aproximado quando a rua não está no OSM.
 */
const LUGARES_APROXIMADOS = new Set([
  "postcode",
  "city",
  "town",
  "village",
  "municipality",
  "administrative",
  "hamlet",
]);

/** Bairro é mais preciso que cidade — e mais honesto do que chamá-lo de cidade. */
const BAIRROS_APROXIMADOS = new Set(["suburb", "neighbourhood", "quarter"]);

// Ritmo justo: com a instância pública, serializa as chamadas do processo com
// 1,1s entre elas — sem isso, rajada de carga com 20 paradas = bloqueio. Com
// instância própria (`GEOCODER_MIN_INTERVALO_MS=0`) a espera some, mas a fila
// fica: ainda queremos no máximo uma chamada por vez por processo.
let ultimaChamada = 0;
let fila: Promise<void> = Promise.resolve();

function reservarVez(): Promise<void> {
  const intervalo = ritmoDoGeocoderMs();
  const vez = fila.then(async () => {
    const espera = intervalo - (Date.now() - ultimaChamada);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaChamada = Date.now();
  });
  // A fila nunca quebra por causa de um chamador que falhou.
  fila = vez.catch(() => undefined);
  return vez;
}

function ua(): string {
  return (process.env.GEOCODER_UA ?? "Nexus-Rotas/1.0").trim() || "Nexus-Rotas/1.0";
}

export async function geocodificarEndereco(endereco: string, cidade?: string | null, uf?: string | null): Promise<ResultadoGeo> {
  const consulta = [endereco.trim(), cidade?.trim(), uf?.trim(), "Brasil"].filter(Boolean).join(", ");
  if (!consulta) return { estado: "erro", latitude: null, longitude: null, precisao: null };
  return buscar(consulta);
}

/**
 * Linha do pedido ("RUA X, 65 — BAIRRO, CIDADE/UF, 89520000") de volta para
 * partes: o pedido avulso (sem contato estruturado) também merece a cadeia
 * completa, não um chute único.
 */
export function parseLinhaEndereco(linha: string): PartesEndereco {
  const [esq, dir] = linha.split(/[—–]/).map((s) => (s ?? "").trim());
  const resto = (dir ?? "").split(",").map((s) => s.trim());
  // "BAIRRO, CIDADE/UF, CEP" ou "CIDADE/UF, ..." ou só "CIDADE/UF".
  let cidade: string | null = null;
  let uf: string | null = null;
  let bairro: string | null = null;
  for (const seg of resto) {
    const m = seg.match(/^(.+?)\s*\/\s*([A-Za-z]{2})$/);
    if (m && !cidade) {
      cidade = m[1]?.trim() || null;
      uf = m[2]?.trim() || null;
    } else if (!cidade && !/^\d{5}-?\d{3}$/.test(seg) && seg) {
      bairro = bairro ? `${bairro}, ${seg}` : seg;
    }
  }
  return { logradouro: esq || null, numero_end: null, bairro, cidade, uf };
}

/**
 * AS CONSULTAS DE EMERGÊNCIA — quando a rua não existe no OSM.
 *
 * Medido em 2026-11-05 na carga 027: quatro paradas ficaram sem pino porque
 * a rua do cadastro não está mapeada ("AURELIANO GONÇALVES LINS" em Ponte
 * Alta do Norte, "ESTRADA GERAL DE ALTO CANOINHAS", "LAGEADINHO A 100 MTS DA
 * BR") e uma nem rua tinha. O CEP, porém, resolve sempre para o município.
 *
 * O ponto que sai daqui é APROXIMADO e é gravado como tal (`precisao:
 * "cidade"`, `geo_fonte: nominatim:cidade`): a tela diz "aproximado" e o
 * motorista pode arrastar o pino. Melhor um pino honesto no município do que
 * a parada sumir do mapa — e nunca um pino no lugar errado fingindo exatidão.
 */
export function consultasDeEmergencia(p: PartesEndereco): string[] {
  const cidade = (p.cidade ?? "").trim().replace(/\s+/g, " ");
  const uf = (p.uf ?? "").trim().toUpperCase();
  const cep = formatarCep(p.cep);
  const bairro = limparComplemento(p.bairro ?? "");
  const saida: string[] = [];
  // Bairro antes de tudo: quando o OSM conhece o bairro, o pino cai dentro
  // dele. Medido na carga 039: "Sossego, Canoinhas, SC" resolve no bairro
  // certo, enquanto o CEP genérico 89460-000 caía em Marcílio Dias — um
  // distrito a 4 km, que a ordem por distância tratava como a parada.
  if (bairro.length >= 3) {
    saida.push([bairro, cidade, uf, "Brasil"].filter(Boolean).join(", "));
  }
  // CEP genérico (final 000) é o município inteiro: o centroide do polígono
  // pode ser qualquer distrito, não a cidade. Nesses casos a consulta de
  // município é mais honesta e mais previsível — mas só quando há município
  // para consultar; sem cidade, o CEP genérico ainda é melhor que nada.
  if (cep && (!cep.endsWith("-000") || !cidade)) saida.push(`${cep}, Brasil`);
  if (cidade) saida.push([cidade, uf, "Brasil"].filter(Boolean).join(", "));
  return [...new Set(saida)];
}

/**
 * Geocodifica com a cadeia de fallback: tenta cada consulta em ordem e fica
 * com o primeiro "ok" — com número exato ganhando da rua aproximada. O
 * "não localizado" final significa OSM sem a rua mesmo (medido: interior),
 * não consulta malformada — aí o caminho é marcar no mapa.
 *
 * Resultado de precisão "bairro"/"cidade" NÃO encerra a cadeia: uma consulta
 * de rua que só devolve o município é sinal de que a rua não foi encontrada,
 * não de que achamos o imóvel. O ponto aproximado só é aceito nas consultas
 * de emergência (bairro/CEP/município), depois de esgotada a rua.
 *
 * Com número no cadastro, a fase de rua só fecha com precisão de imóvel
 * (`aceitaResultado`); geometria de rua/avenida sem imóvel confirmado não é
 * ponto de parada — o pino não pode colapsar duas paradas da mesma avenida.
 */
/**
 * Aceita um resultado da cadeia de ruas como ponto da parada.
 *
 * Com número no cadastro, só a precisão de imóvel ("numero") fecha a fase de
 * rua: geometria de avenida/rua sem imóvel confirmado não é ponto de parada —
 * medido na carga 40 (12/11/2026): 19506 e 19542, mesma avenida Avenida
 * Presidente Getúlio Vargas, colapsaram no mesmo pino (-26.4154231, -51.3182519)
 * e a rota saiu com trecho de 0 km entre clientes diferentes. Sem número no
 * cadastro, o trecho de rua continua aceito como aproximado (diretriz medida no
 * OSM do interior).
 */
export function aceitaResultado(r: ResultadoGeo, temNumero: boolean): boolean {
  if (r.estado !== "ok") return false;
  if (r.precisao === "numero") return true;
  return !temNumero && r.precisao === "rua";
}

export async function geocodificarComFallback(p: PartesEndereco, linhaPedido?: string | null): Promise<ResultadoGeo> {
  let cadeia = montarConsultas(p);
  let temNumero = Boolean(numeroDa(p));
  // Sem rua no cadastro, destrincha a linha do pedido e tenta a cadeia nela.
  if (cadeia.length === 0 && linhaPedido?.trim()) {
    const partes = parseLinhaEndereco(linhaPedido);
    cadeia = montarConsultas(partes);
    temNumero = Boolean(numeroDa(partes));
  }
  // Último suspiro: a linha crua (o Nominatim às vezes entende o que a
  // normalização desmontou).
  const crua = linhaPedido?.trim() ? [`${linhaPedido.trim()}, Brasil`] : [];
  const emergencia = consultasDeEmergencia(p);
  let viuErro = false;
  for (const consulta of [...cadeia, ...crua]) {
    const r = await buscar(consulta);
    if (aceitaResultado(r, temNumero)) return r;
    if (r.estado === "erro") viuErro = true;
    // nao_encontrado/ambiguo/bairro/cidade: próxima fase (mais solta) pode resolver.
  }
  for (const consulta of emergencia) {
    const r = await buscar(consulta);
    if (r.estado === "ok") return r;
    if (r.estado === "erro") viuErro = true;
  }
  if (cadeia.length + crua.length + emergencia.length === 0) {
    return { estado: "erro", latitude: null, longitude: null, precisao: null };
  }
  return { estado: viuErro ? "erro" : "nao_encontrado", latitude: null, longitude: null, precisao: null };
}

export interface CandidatoNominatim {
  lat?: string;
  lon?: string;
  addresstype?: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    municipality?: string;
    postcode?: string;
  };
}

/**
 * A CLASSIFICAÇÃO DO PRIMEIRO RESULTADO — o que o ponto vale.
 *
 * Exportada porque é a parte que decide entre exato, rua e município, e tem
 * de ser provada sem depender da rede (o Nominatim não se dubla em CI).
 */
export function classificarResultado(j: CandidatoNominatim[] | null | undefined): ResultadoGeo {
  if (!j || j.length === 0) return { estado: "nao_encontrado", latitude: null, longitude: null, precisao: null };
  const primeiro = j[0]!;
  const lat = Number(primeiro.lat);
  const lng = Number(primeiro.lon);
  // Faixa também: lat/lng fora da ordem geográfica válida não é ponto de
  // entrega (prompt §3). Só finito não bastava — um valor absurdo entra como
  // "ok" e pintava a parada no mapa em lugar nenhum/rua errada.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { estado: "erro", latitude: null, longitude: null, precisao: null };
  }
  // Número certo: o OSM conhece o imóvel (housenumber ou addresstype).
  if (primeiro.address?.house_number || primeiro.addresstype === "house" || primeiro.addresstype === "building") {
    return { estado: "ok", latitude: lat, longitude: lng, precisao: "numero" };
  }
  // Rua aproximada: todos os candidatos são a mesma rua na mesma cidade
  // (o OSM do interior raramente tem número — o trecho basta para a rota,
  // e a tela diz que é aproximado em vez de fingir exatidão).
  const rua = (primeiro.address?.road ?? "").toLowerCase();
  const cidadeRes = (primeiro.address?.city ?? primeiro.address?.town ?? primeiro.address?.village ?? "").toLowerCase();
  const mesmaRua = rua !== "" && j.every((c) => (c.address?.road ?? "").toLowerCase() === rua);
  const mesmaCidade =
    cidadeRes === "" || j.every((c) => (c.address?.city ?? c.address?.town ?? c.address?.village ?? "").toLowerCase() === cidadeRes);
  if (mesmaRua && mesmaCidade) {
    return { estado: "ok", latitude: lat, longitude: lng, precisao: "rua" };
  }
  // Lugar (CEP, município): não é a rua, mas é um ponto honesto do
  // território. Quem chama decide se aceita — a cadeia de rua ignora e
  // segue; só as consultas de emergência param aqui.
  if (BAIRROS_APROXIMADOS.has(primeiro.addresstype ?? "")) {
    return { estado: "ok", latitude: lat, longitude: lng, precisao: "bairro" };
  }
  if (LUGARES_APROXIMADOS.has(primeiro.addresstype ?? "")) {
    return { estado: "ok", latitude: lat, longitude: lng, precisao: "cidade" };
  }
  return { estado: "ambiguo", latitude: null, longitude: null, precisao: null };
}

async function buscar(consulta: string): Promise<ResultadoGeo> {
  await reservarVez();
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 15000);
  try {
    const res = await fetch(
      `${urlDoGeocoder()}?q=${encodeURIComponent(consulta)}&format=json&limit=5&countrycodes=br&addressdetails=1`,
      { headers: { "User-Agent": ua(), Accept: "application/json" }, signal: controle.signal },
    );
    if (!res.ok) return { estado: "erro", latitude: null, longitude: null, precisao: null };
    return classificarResultado((await res.json()) as CandidatoNominatim[]);
  } catch {
    return { estado: "erro", latitude: null, longitude: null, precisao: null };
  } finally {
    clearTimeout(limite);
  }
}
