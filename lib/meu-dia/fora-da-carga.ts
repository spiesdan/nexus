/**
 * PEDIDO QUE FICOU DE FORA DA CARGA DA MESMA CIDADE.
 *
 * ─── O que este arquivo é ─────────────────────────────────────────────────────
 *
 * Uma carga foi montada para atender uma cidade e um pedido da MESMA cidade não
 * entrou. O aviso aparece no dia seguinte.
 *
 * ─── O que a cidade em comum é, e o que não é ─────────────────────────────────
 *
 * A regra do pedido original é explícita: "a cidade em comum deve funcionar como
 * um sinal para identificar possíveis esquecimentos, não como prova definitiva
 * de que dois pedidos deveriam obrigatoriamente estar na mesma carga".
 *
 * Então isto NÃO é uma regra de roteamento. Nenhuma carga é criada, nenhuma
 * programação muda, e o aviso diz que é um sinal. Se a pessoa descobre que o
 * outro pedido estava agendado para outra data, ela trata o alerta e ele some —
 * e `tratar` aqui é um `cancelar`/`resolver`, não uma ação automática.
 *
 * ─── Os falsos positivos que a regra pede para evitar ─────────────────────────
 *
 *   - cancelado
 *   - entregue
 *   - já expedido (está em alguma carga, só não nesta)
 *   - explicitamente agendado para outra data
 *
 * Os três últimos dependem de dados que este arquivo recebe prontos, para que a
 * decisão seja testável sem banco. O filtro é aqui e não na rota.
 */

/** O que a rota sabe sobre a carga, e o que ela já leu dos pedidos. */
export interface CargaMontada {
  id: string;
  numero: number;
  placa: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  /** A rota leu os pedidos da carga; aqui só interessa a CIDADE. */
  pedidosDaCarga: { id: string; cidade: string | null }[];
}

/** O pedido que pode ter ficado de fora. */
export interface PedidoElegivel {
  id: string;
  numero: number;
  cliente_nome: string;
  status: string;
  created_at: string;
  /** `YYYY-MM-DD`. Não é entregável nesta data se tiver. */
  previsao_entrega?: string | null;
  /** `YYYY-MM-DD`. */
  dataDaCarga: string;
}

export interface AchadoDeForaDaCarga {
  pedido: PedidoElegivel;
  carga: { id: string; numero: number; placa: string | null };
  /** Por que este pedido é um sinal — para o alerta mostrar o motivo. */
  motivo: string;
}

/** Status em que o pedido ainda espera expedição. */
const AINDA_NAO_EXPEDIDO = new Set(["aprovado", "faturado", "em_analise", "rascunho"]);

/** Status em que o pedido não é mais candidato a nenhuma carga. */
const NAO_ELEGIVEL = new Set(["cancelado", "entregue", "expedido", "devolvido"]);

export function chaveDoAlerta(pedidoId: string): string {
  return `fora_da_carga:${pedidoId}`;
}

/** O pedido é candidato a entrar numa carga? */
export function elegivelParaCarga(p: {
  status: string;
  previsao_entrega?: string | null;
  dataDaCarga: string;
}): boolean {
  if (NAO_ELEGIVEL.has(p.status)) return false;
  if (!AINDA_NAO_EXPEDIDO.has(p.status)) return false;
  // Agendado para OUTRA data não é esquecimento: é programação. Comparar com a
  // data da carga e não com "hoje" é o que faz o teste ser estável — a regra
  // muda se comparar com hoje, e a regra não muda.
  if (p.previsao_entrega && p.previsao_entrega !== p.dataDaCarga) return false;
  return true;
}

/**
 * A comparação, carga a carga.
 *
 * `pedidosDoDia` são os pedidos elegíveis NAQUELE DIA que não estão em nenhuma
 * carga. `cidadesAtendidas` são as cidades que a carga trouxe.
 */
export function foraDaCargaDe(
  carga: CargaMontada,
  pedidosDoDia: PedidoElegivel[],
  pedidosEmOutraCarga: Set<string>,
): AchadoDeForaDaCarga[] {
  const cidades = new Set(
    carga.pedidosDaCarga.map((p) => normalizaCidade(p.cidade)).filter((c): c is string => !!c),
  );
  if (cidades.size === 0) return [];

  const dataDaCarga = carga.created_at.slice(0, 10);
  const achados: AchadoDeForaDaCarga[] = [];

  for (const p of pedidosDoDia) {
    if (pedidosEmOutraCarga.has(p.id)) continue;
    if (!elegivelParaCarga({ ...p, dataDaCarga })) continue;
    const cidade = normalizaCidade(
      (p as unknown as { cidade_entrega?: string | null }).cidade_entrega ?? null,
    );
    if (!cidade || !cidades.has(cidade)) continue;

    achados.push({
      pedido: p,
      carga: { id: carga.id, numero: carga.numero, placa: carga.placa },
      motivo: `A carga ${carga.numero} atendeu ${cidade} e este pedido, da mesma cidade, não entrou.`,
    });
  }
  return achados;
}

/**
 * A CIDADE DE ENTREGA, lida do endereço.
 *
 * ─── Por que o endereço e não o contato ────────────────────────────────────
 *
 * Medido em produção em 10/10/2026, org `4bc721ce…`:
 *
 *   - `contacts.cidade` preenchida em 3.110 de 12.644 contatos (25%)
 *   - `commercial_orders.endereco_entrega` em 8.848 de 10.786 pedidos (82%)
 *
 * E o endereço é a fonte CORRETA, não a mais disponível por acaso: `contacts.cidade`
 * é o endereço do cliente, e o mesmo cliente pode receber em outro lugar. O que
 * decide em que cidade a carga precisa ir é para onde o pedido ENTRA — e isso
 * está em `endereco_entrega`.
 *
 * A rotina lia só o contato, então em produção a comparação de cidade não tinha o
 * que comparar: zero alertas, sem erro e sem log, porque "não achei cidade" é um
 * resultado legítimo.
 *
 * ─── O formato ──────────────────────────────────────────────────────────────
 *
 * O que as pessoas digitam termina em `CIDADE/UF, CEP`:
 *
 *   RUA JOSÉ PSCHEIDT, 55 — CENTRO, ITAIOPOLIS/SC, 89340000
 *   Rua Caetano Costa, 942723034 — Centro, Canoinhas/SC, 89460098
 *   RODOVIA BR 280 KM 225,5, SN — APARECIDA, CANOINHAS/SC, 89460540
 *
 * O CEP é o âncora: ele vai no fim e é sempre dígitos. O nome da cidade fica
 * logo antes de `/UF`.
 *
 * ─── Por que a vírgula NÃO entra na classe de caracteres ──────────────────
 *
 * Porque `CENTRO, ITAIOPOLIS/SC` precisa devolver `ITAIOPOLIS`, e não
 * `CENTRO, ITAIOPOLIS`. A vírgula é o separador entre o bairro e a cidade, e é
 * o bairro que vem antes dela. Se a vírgula estivesse na classe, a regra pegaria
 * o bairro junto — e o alerta passaria a dizer que uma carga foi para `CENTRO`.
 *
 * ─── Quando NÃO há `/UF` ───────────────────────────────────────────────────
 *
 * Devolve `null`, e o pedido não é candidato. Um palpite sem estado seria pior
 * que ausência: `Rua X, Centro, Canoinhas, 89460098` tem `Centro` (bairro) na
 * posição da cidade, e um alertaErrado treina o operador a ignorar o Meu Dia —
 * que é o custo caro desta regra, não o de perder um.
 */
export function cidadeDoEndereco(endereco: string | null | undefined): string | null {
  if (!endereco) return null;

  // A classe de caracteres NÃO tem vírgula — ver a nota acima.
  //   (?<!...) garante que não pegamos o pedaço errado de um nome com espaço.
  const achado = endereco.match(
    /([A-ZÀ-Üa-zà-ü][A-ZÀ-Üa-zà-ü.\s]{1,40})\/([A-Z]{2})\s*,\s*(\d{5}-?\d{3})\s*$/u,
  );
  if (!achado) return null;

  // O estado é conferido contra a lista real. `/\s*$/` sozinho casaria `xx/QQ`,
  // que não é um estado — e um estado inválido é sinal de que o "endereço" não
  // é um endereço, e aí a resposta honesta é não ter cidade.
  if (!ESTADOS_BRASILEIROS.has(achado[2]!.toUpperCase())) return null;

  return achado[1]!.trim() || null;
}

/** Os 27 estados + Distrito Federal. `null` fora desta lista é endereço ruim. */
const ESTADOS_BRASILEIROS = new Set([
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
]);

/**
 * Normaliza o nome da cidade para comparar.
 *
 * "Canoinhas/SC" e "canoinhas" são a mesma cidade. Sem isso, o sinal — que é
 * uma STRING — nunca casa e a rotina nunca produz nada.
 */
export function normalizaCidade(cidade: string | null | undefined): string | null {
  if (!cidade) return null;
  const semEstado = cidade.split("/")[0]?.trim() ?? "";
  const base = semEstado
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // `toLowerCase()` ANTES do filtro, e não depois: o filtro é `[a-z0-9]`, que
    // é minúscula, e "Canoinhas" com o "C" maiúsculo vira "anoinhas".
    //
    // Medido em 09/10/2026 — e o sintoma era silencioso e caro: a comparação de
    // cidade NUNCA casava, a rotina nunca produzia um aviso, e nenhum teste
    // falhava porque os casos que existiam usavam a cidade toda em minúscula.
    // Uma cidade escrito com inicial maiúscula — que é como todo mundo escreve
    // — simplesmente nunca gerava alerta.
    .toLowerCase();
  const limpo = base.replace(/[^a-z0-9]+/g, " ").trim();
  return limpo === "" ? null : limpo;
}
