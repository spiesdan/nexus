"use client";

/**
 * DISPARO EM LOTE — até 3 variações de mensagem, alternadas 1→2→3→1, com
 * ritmo anti-ban (60s entre um envio e outro).
 *
 * ═══ POR QUE TRÊS MENSAGENS, E NÃO UMA ═══════════════════════════════════
 *
 * Mensagem idêntica 50 vezes seguidas para números que nunca falaram com a
 * gente é o padrão exato que o WhatsApp reconhece como spam — o dano não
 * aparece como erro, aparece como número banido semanas depois. Alternar três
 * textos quebra essa assinatura sem mudar o que o cliente recebe.
 *
 * Os campos são três OPÇÕES, não três envios: quem recebe recebe UMA. O 1º
 * pega a 1ª, o 2º a 2ª, o 3º a 3ª, e o 4º volta para a 1ª. Só a primeira é
 * obrigatória — quem quer mandar um texto único continua preenchendo um campo.
 *
 * ═══ POR QUE A SIMULAÇÃO VEM ANTES DO BOTÃO DE ENVIAR ═══════════════════
 *
 * Não é etapa de confirmação, é o que segura a tela. Enviar mensagem de
 * WhatsApp é das poucas coisas em que o erro não aparece como erro: o número
 * é banido e o dano só se vê semanas depois. Então o botão de enviar só
 * EXISTE depois que a simulação voltou, e vem com os números da simulação
 * escritos nele — "Enviar para 312 empresas" — porque um botão que promete
 * uma quantidade genérica é um botão que o operador clica sem ler.
 *
 * E a simulação é o que responde se dá para mandar AGORA: com o número de
 * WhatsApp desconectado, o resultado é "312 prontos, mas não há sessão
 * conectada" — e o botão fica desabilitado, com o motivo escrito embaixo.
 * Sem isso o operador descobre que mandou 300 mensagens para lugar nenhum
 * depois.
 *
 * A simulação também mostra a ROTAÇÃO (`rotacao`): qual das opções cada um
 * dos primeiros recebe. Três caixas de texto sem isso são uma promessa que o
 * operador não tem como conferir.
 */
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { DIAS_UTEIS, DiasDaSemana, resumoDosDias } from "@/components/prospeccao/DiasDaSemana";
import { ESPACO_ANTIBAN_MS, MENSAGENS_POR_DISPARO_MAX } from "@/lib/prospeccao/disparo";
import { useT } from "@/hooks/i18n/useT";

/** Uma janela do dia, em HH:MM — o mesmo shape de `lib/prospeccao/agendamento`. */
interface Janela {
  inicio: string;
  fim: string;
}

/** `YYYY-MM-DD` de hoje/daqui a N dias no relógio de QUEM OPERA a tela. */
function diaLocal(diasAFrente = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return d.toLocaleDateString("en-CA");
}

/** `2026-10-19` → `19/10` (é assim que o dono fala: "do dia 19/10 ao 23/10"). */
function diaCurto(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/** O que a rota devolve na simulação. Espelha `resumo` do `route.ts`. */
interface Plano {
  simulacao: boolean;
  /** 0284 — o que a rota vai mandar: texto livre ou modelo aprovado. */
  mensagem_tipo?: "texto" | "template";
  template?: { name: string; language: string } | null;
  pode_enviar: boolean;
  bloqueio: string | null;
  selecionados: number;
  encontrados: number;
  serao_enviados: number;
  serao_recusados: number;
  estouraram_a_cota: number;
  ja_enviados_hoje: number;
  limite: number;
  espaco_ms: number;
  duracao_prevista_ms: number;
  /** Quantas variações estão em rotação (1 = texto único). */
  variacoes: number;
  /** Os primeiros envios, cada um com o número da opção (1, 2, 3…). */
  rotacao: number[];
  por_motivo: Array<{ motivo: string; rotulo: string; total: number }>;
  recusas: Array<{ nome: string; motivo: string }>;
}

/**
 * Quantas caixas de mensagem a tela oferece — o pedido do produto: três
 * opções. É a TELA que limita a três, não a API (que aceita até
 * `MENSAGENS_POR_DISPARO_MAX`): quem usa a tela quer o caso simples e
 * repetível, não uma matriz de textos.
 */
const OPCOES_DE_MENSAGEM = 3;

/** O padrão do campo de intervalo, em segundos — a fonte é o anti-ban. */
const SEGUNDOS_PADRAO = ESPACO_ANTIBAN_MS / 1000;

interface ResultadoDoEnvio {
  enviados: number;
  falhas: number;
  detalhe_falhas: Array<{ nome: string; erro: string }>;
}

/**
 * As caixas de mensagem a partir do que a campanha salvou (1..5, piso de 3).
 *
 * Exportada para o teste e para o efeito de sincronização usarem a MESMA
 * régua: duas contagens diferentes fariam a tela abrir com uma caixa a menos
 * do que a campanha tem.
 */
export function caixasDeMensagem(iniciais: readonly string[]): string[] {
  const jaVem = iniciais.map((m) => (typeof m === "string" ? m : ""));
  const total = Math.min(
    MENSAGENS_POR_DISPARO_MAX,
    Math.max(OPCOES_DE_MENSAGEM, jaVem.length),
  );
  return Array.from({ length: total }, (_, i) => jaVem[i] ?? "");
}

/** As janelas da campanha, ou o padrão de expediente quando ela não trouxe. */
function janelasDe(agenda: { janelas?: Array<{ inicio: string; fim: string }> | null } | null | undefined) {
  const vindas = (agenda?.janelas ?? []).filter(
    (j) => typeof j?.inicio === "string" && typeof j?.fim === "string",
  );
  return vindas.length > 0
    ? vindas.map((j) => ({ inicio: j.inicio, fim: j.fim }))
    : [
        { inicio: "07:00", fim: "12:00" },
        { inicio: "13:00", fim: "19:00" },
      ];
}

/** Os dias da campanha, ou seg–sex quando ela não trouxe. */
function diasDe(agenda: { janelas?: Array<{ dias?: number[] }> | null } | null | undefined) {
  const vindos = (agenda?.janelas ?? []).find((j) => (j?.dias?.length ?? 0) > 0)?.dias;
  return vindos && vindos.length > 0 ? vindos : DIAS_UTEIS;
}

/**
 * O componente NASCE do zero a cada abertura — quem abre passa um `key` novo.
 *
 * Não é detalhe: o plano simulado é de uma SELEÇÃO. Sobreviver para a próxima
 * abertura faria a tela dizer "vão receber 312" sobre uma lista que não
 * está mais marcada, e o número mentiria sem parecer errado.
 *
 * Só o `key` não bastava: na aba Campanhas o diálogo fica MONTADO com
 * `aberto=false` e só recebe a campanha depois do clique em "Ver público".
 * `useState` não reinicializa com props novas, então as caixas abriam com o
 * exemplo do placeholder e o operador digitava de novo o que já estava salvo
 * na campanha. O efeito abaixo sincroniza quando a origem muda — sem apagar o
 * que a pessoa digitou se ela só fechar e reabrir a mesma campanha.
 */
export function DialogoDisparo({
  ids,
  aberto,
  onFechar,
  onConcluido,
  campanhaId = null,
  campanhaPadrao,
  mensagensIniciais = [],
  mensagemTipo = "texto",
  templateNome = null,
  templateIdioma = null,
  templatesPorCategoria = [],
  agendaInicial,
  modoInicial = "agora",
  prospectIdsDaCampanha,
}: {
  ids: string[];
  aberto: boolean;
  onFechar: () => void;
  onConcluido: () => void;
  /**
   * A campanha que recebe a agenda. A lista fechada, as janelas e o período
   * moram NELA (0273) — agendar sem campanha não tem onde guardar o relógio.
   * Quando não vem (tela de Empresas), a confirmação CRIA uma campanha com a
   * `campanhaPadrao` (nome/categorias/cidades do filtro) antes de agendar.
   */
  campanhaId?: string | null;
  campanhaPadrao?: {
    nome: string;
    categorias: string[];
    cidades: Array<{ cidade: string; estado?: string }>;
  };
  /**
   * As mensagens que a campanha já tem (0273). O assistente "Encontrar
   * empresas" grava 1..5 variações nela; sem esta prop, o Disparo abria com
   * as três caixas vazias e o operador digitava tudo de novo — ou pior,
   * mandava o texto genérico sem perceber que o dele tinha ficado para trás.
   */
  mensagensIniciais?: string[];
  /**
   * 0284 — campanha de template NÃO tem caixas de texto: o conteúdo está no
   * modelo aprovado, e a API oficial ignora `mensagens` nesse caminho. Sem esta
   * prop a tela abriria vazia e o botão de simular ficaria desabilitado por
   * "nenhuma mensagem" — escondendo a campanha que está pronta.
   */
  mensagemTipo?: "texto" | "template";
  templateNome?: string | null;
  templateIdioma?: string | null;
  /**
   * 0285 — os modelos por categoria da campanha. A lista é para o operador VER
   * que restaurante sai com outro modelo; a escolha por empresa continua sendo
   * do servidor, pela categoria efetiva do prospect.
   */
  templatesPorCategoria?: Array<{ categoria: string; name: string; language: string }>;
  /**
   * O "quando" que a campanha já tem: período, janelas e cota do dia. Mesma
   * razão das mensagens — o assistente pergunta, e o Disparo não pode abrir
   * com um horário diferente do que o dono escolheu.
   */
  agendaInicial?: {
    data_inicio?: string | null;
    data_fim?: string | null;
    limite_diario?: number | null;
    janelas?: Array<{ inicio: string; fim: string; dias?: number[] }> | null;
  } | null;
  /**
   * Abre direto em "Agendar" quando a tela de controle já sabe que a lista é
   * longa (ou que a campanha já tem relógio). O usuário ainda pode trocar para
   * "Enviar agora" — é preferência inicial, não bloqueio.
   */
  modoInicial?: "agora" | "agendar";
  /**
   * A LISTA FECHADA que o PATCH deve guardar, quando difere de `ids`.
   *
   * No controle de uma campanha parcialmente enviada, `ids` são só os
   * pendentes (o que será disparado agora), mas `prospect_ids` precisa
   * continuar sendo a audiência COMPLETA — senão o reagendamento apaga da
   * campanha quem já recebeu e o painel passa a mentir.
   */
  prospectIdsDaCampanha?: string[];
}) {
  const t = useT();
  // As opções de texto. Só a primeira é obrigatória: campo vazio é opção que
  // não existe, e some da rotação antes de sair daqui.
  //
  // O tamanho nasce do que a campanha trouxe (1..5), com o piso de três
  // caixas: campanha sem mensagem continua abrindo como sempre abriu.
  const [mensagens, setMensagens] = React.useState<string[]>(() =>
    caixasDeMensagem(mensagensIniciais),
  );
  const [limite, setLimite] = React.useState(() =>
    String(agendaInicial?.limite_diario ?? 50),
  );
  // 60s, não 1,2s. O espaçamento curto é o da CONVERSA (a automação responde
  // na hora); disparo frio em massa é outra coisa, e é aqui que o número
  // queima. Quem quiser mais rápido muda o campo — mas o padrão seguro é o
  // que sai da caixa.
  const [espaco, setEspaco] = React.useState(String(SEGUNDOS_PADRAO));
  const [plano, setPlano] = React.useState<Plano | null>(null);
  const [resultado, setResultado] = React.useState<ResultadoDoEnvio | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // ── AGENDAMENTO (0273) ──────────────────────────────────────────────────
  // "Enviar agora" continua sendo o disparo síncrono de sempre. "Agendar"
  // grava o relógio na campanha e quem manda é o cron de 1 minuto.
  const [modo, setModo] = React.useState<"agora" | "agendar">(modoInicial);
  const [dataInicio, setDataInicio] = React.useState(
    () => agendaInicial?.data_inicio || diaLocal(),
  );
  const [dataFim, setDataFim] = React.useState(() => agendaInicial?.data_fim || diaLocal(7));
  // As janelas do pedido do dono: "das 7 às 12, 13 às 19". Se a campanha já
  // trouxe as dela, são elas que abrem — senão o operador ajustaria de novo um
  // horário que já tinha decidido no assistente.
  const [janelas, setJanelas] = React.useState<Janela[]>(() => janelasDe(agendaInicial));
  const [agendado, setAgendado] = React.useState(false);
  // Os dias da semana da campanha (seg–sex por padrão): é o "de segunda a
  // sexta" que o dono pediu, e sem ele "19/10 a 23/10 das 7 às 19" também
  // mandaria no sábado e no domingo se o período os incluísse.
  const [dias, setDias] = React.useState<number[]>(() => diasDe(agendaInicial));

  // ── A CAMPANHA CHEGA DEPOIS DA MONTAGEM ──────────────────────────────────
  // Na aba Campanhas este diálogo vive montado (aberto=false) e recebe
  // `mensagensIniciais`/`agendaInicial` só quando o operador clica em
  // "Ver público". `useState` não reinicializa com props novas — sem esta
  // sincronização, as caixas abriam com o placeholder e o horário padrão,
  // como se a campanha não tivesse nada salvo.
  //
  // A assinatura é o conteúdo, não o objeto: `agendaInicial` é recriado a
  // cada render do pai, e comparar por identidade zeraria o que a pessoa
  // digitasse a cada tecla.
  const assinaturaDaOrigem = JSON.stringify({
    mensagens: mensagensIniciais,
    inicio: agendaInicial?.data_inicio ?? null,
    fim: agendaInicial?.data_fim ?? null,
    limite: agendaInicial?.limite_diario ?? null,
    janelas: agendaInicial?.janelas ?? null,
  });
  const origemSincronizada = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!aberto || origemSincronizada.current === assinaturaDaOrigem) return;
    origemSincronizada.current = assinaturaDaOrigem;
    setMensagens(caixasDeMensagem(mensagensIniciais));
    setLimite(String(agendaInicial?.limite_diario ?? 50));
    setDataInicio(agendaInicial?.data_inicio || diaLocal());
    setDataFim(agendaInicial?.data_fim || diaLocal(7));
    setJanelas(janelasDe(agendaInicial));
    setDias(diasDe(agendaInicial));
    // `mensagensIniciais`/`agendaInicial` entram pela assinatura; não listar o
    // array cru evita o efeito rodar a cada render sem mudar nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, assinaturaDaOrigem]);

  // Cada abertura respeita a preferência da tela de origem; depois disso o
  // operador manda. Não colocamos `modoInicial` no efeito de origem para não
  // resetar o modo enquanto ele digita se o pai re-renderizar.
  React.useEffect(() => {
    if (aberto) setModo(modoInicial);
  }, [aberto, modoInicial]);

  // O que de fato vai como `mensagens`: sem vazios, sem espaço nas pontas.
  const preenchidas = mensagens.map((m) => m.trim()).filter((m) => m !== "");
  // Template não usa as caixas — o conteúdo é o modelo aprovado. A rota lê o
  // tipo da CAMPANHA (não do corpo), então mandar `mensagens` vazio é correto.
  const ehTemplate = mensagemTipo === "template";

  // A tela fala em SEGUNDOS (é assim que se pensa em ritmo); a API, em ms. O
  // campo vazio volta ao padrão seguro em vez de virar 0 — e um 0 digitado de
  // propósito continua valendo, porque é a saída de emergência de quem está
  // testando.
  const segundos = espaco.trim() === "" ? SEGUNDOS_PADRAO : Number(espaco);
  const espacoMs = Number.isFinite(segundos)
    ? Math.min(60000, Math.max(0, Math.round(segundos * 1000)))
    : 60000;

  // O agendamento tem piso de 1s (o CHECK do banco é 1000ms). No "Enviar
  // agora" o 0 continua valendo — é a saída de emergência de quem testa.
  const espacoMsAgendado = Math.min(60000, Math.max(1000, espacoMs));
  const janelasValidas = janelas.filter(
    (j) => /^\d{2}:\d{2}$/.test(j.inicio) && /^\d{2}:\d{2}$/.test(j.fim) && j.inicio < j.fim,
  );
  const periodoValido = !dataInicio || !dataFim || dataFim >= dataInicio;
  // Sem dia escolhido não há quando mandar — e o motor leria a lista vazia
  // como "todos os dias", que é o OPOSTO da intenção de quem desmarcou tudo.
  const diasValidos = dias.length > 0;
  const podeAgendar =
    (ehTemplate || preenchidas.length > 0) &&
    ids.length > 0 &&
    janelasValidas.length === janelas.length &&
    janelas.length > 0 &&
    periodoValido &&
    diasValidos;

  const segundosAgenda = Math.round(espacoMsAgendado / 1000);
  const ritmo =
    segundosAgenda === 60
      ? t("1 por minuto")
      : t(`1 a cada ${segundosAgenda} segundos`);
  const resumoDaAgenda = [
    t(`${ids.length} empresas`),
    ritmo,
    t(resumoDosDias(dias)),
    janelasValidas.length > 0
      ? janelasValidas.map((j) => t(`das ${j.inicio} às ${j.fim}`)).join(` ${t("e")} `)
      : t("sem restrição de horário"),
    dataInicio && dataFim
      ? t(`de ${diaCurto(dataInicio)} a ${diaCurto(dataFim)}`)
      : dataInicio
        ? t(`a partir de ${diaCurto(dataInicio)}`)
        : t("sem data final"),
  ].join(", ");

  function trocarMensagem(i: number, valor: string) {
    setMensagens((atual) => atual.map((m, j) => (j === i ? valor : m)));
  }

  function trocarJanela(i: number, campo: "inicio" | "fim", valor: string) {
    setJanelas((atual) => atual.map((j, k) => (k === i ? { ...j, [campo]: valor } : j)));
  }

  /**
   * A campanha é o LUGAR da reserva (0277) — a empresa que entra nela deixa de
   * aparecer em aberto para outra. Quando a tela não trouxe uma campanha (aba
   * Empresas), cria com o recorte do filtro. NUNCA em simulação: simular não
   * reserva nada.
   */
  async function garantirCampanha(): Promise<string> {
    if (campanhaId) return campanhaId;
    const criada = await apiClient.post<{ data?: { id?: string } }>(
      "/api/v1/prospecting/campaigns",
      {
        nome: campanhaPadrao?.nome ?? `Prospecção ${diaCurto(dataInicio)}`,
        categorias:
          campanhaPadrao && campanhaPadrao.categorias.length > 0
            ? campanhaPadrao.categorias
            : ["empresas"],
        cidades:
          campanhaPadrao && campanhaPadrao.cidades.length > 0
            ? campanhaPadrao.cidades
            : [{ cidade: "Não informada" }],
        fonte_publico: "base",
      },
    );
    const id = criada?.data?.id ?? null;
    if (!id) throw new Error(t("Não foi possível criar a campanha do disparo."));
    return id;
  }

  /**
   * Confirma o agendamento. A campanha é o LUGAR do relógio: quando ela já
   * existe (aba Campanhas), é PATCH; quando não (tela de Empresas), cria uma
   * campanha com o nome/categorias/cidades do filtro e agenda nela.
   */
  async function agendar() {
    setOcupado(true);
    setErro(null);
    try {
      const id = await garantirCampanha();

      await apiClient.patch(`/api/v1/prospecting/campaigns/${id}`, {
        // `ids` é o que será disparado agora (pendentes); a lista da campanha
        // continua sendo a audiência completa. Sem esta separação, reagendar
        // uma campanha parcialmente enviada apagaria os já enviados.
        prospect_ids: prospectIdsDaCampanha ?? ids,
        mensagens: preenchidas,
        janelas: janelas.map((j) => ({ ...j, dias })),
        data_inicio: dataInicio,
        data_fim: dataFim,
        limite_diario: Number(limite) || 50,
        espaco_ms: espacoMsAgendado,
        agendada_em: new Date().toISOString(),
        status: "ativa",
      });
      setAgendado(true);
      onConcluido();
    } catch (e) {
      setErro(e instanceof Error ? e.message : t("Não foi possível agendar o disparo."));
    } finally {
      setOcupado(false);
    }
  }

  async function chamar(dryRun: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      // Só o envio real reserva. A simulação não cria campanha nem grava lista.
      const id = dryRun ? campanhaId : await garantirCampanha();
      const r = (await apiClient.post<{ data?: { plano?: Plano; resultado?: ResultadoDoEnvio } }>(
        "/api/v1/prospecting/prospects/disparar",
        {
          prospect_ids: ids,
          mensagens: preenchidas,
          limite: Number(limite) || 50,
          espaco_ms: espacoMs,
          dry_run: dryRun,
          ...(id ? { campaign_id: id } : {}),
        },
      )) as { data?: { plano?: Plano; resultado?: ResultadoDoEnvio } };
      const p = r?.data?.plano ?? null;
      // A rota devolve 409 com o plano quando não há sessão. O `apiClient`
      // lança nesse caso; aqui o que importa é o que foi lido.
      setPlano(p);
      if (!dryRun) {
        setResultado(r?.data?.resultado ?? null);
        onConcluido();
      }
    } catch (e) {
      // O 409 de "ninguém pode receber" carrega o plano inteiro em `details`.
      // Sem pintar o plano, a tela só dizia "Nenhuma empresa..." e o operador
      // não via se era cota, categoria ou conversa aberta.
      if (e instanceof ApiError) {
        const planoDoErro = e.details?.plano as Plano | undefined;
        if (planoDoErro) setPlano(planoDoErro);
      }
      const msg = e instanceof Error ? e.message : t("Não foi possível montar o disparo.");
      setErro(msg);
    } finally {
      setOcupado(false);
    }
  }

  const minutos = plano ? Math.ceil(plano.duracao_prevista_ms / 60000) : 0;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(`Enviar mensagem para ${ids.length} empresas`)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Enviar agora x Agendar. O "agora" é o POST síncrono de sempre; o
              "agendar" grava o relógio na campanha e o cron manda uma por
              minuto. Não é um substituto: é a mesma mensagem com outro tempo. */}
          <div className="flex gap-2 rounded-lg border p-1">
            <button
              type="button"
              onClick={() => setModo("agora")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
                modo === "agora" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {t("Enviar agora")}
            </button>
            <button
              type="button"
              onClick={() => setModo("agendar")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
                modo === "agendar" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {t("Agendar")}
            </button>
          </div>

          {ehTemplate ? (
            <div className="rounded-lg border border-info/40 bg-info-bg p-3 text-sm text-info-fg">
              <p className="font-medium">
                {t("Esta campanha envia um modelo aprovado — não há texto livre para editar aqui.")}
              </p>
              <p className="mt-1 opacity-90">
                {templatesPorCategoria.length > 0
                  ? t("Cada categoria sai com o próprio modelo:")
                  : templateNome
                    ? t(
                        `Modelo: ${templateNome}${templateIdioma ? ` (${templateIdioma})` : ""}.`,
                      )
                    : t("O modelo e os parâmetros foram definidos no assistente da campanha.")}
              </p>
              {templatesPorCategoria.length > 0 && (
                <ul className="mt-1 space-y-0.5 opacity-90">
                  {templatesPorCategoria.map((m) => (
                    <li key={m.categoria}>
                      <span className="font-medium">{m.categoria}:</span> {m.name}
                      {m.language ? ` (${m.language})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="disparo-mensagem-0">{t("Mensagem 1 (sai primeiro)")}</Label>
              <textarea
                id="disparo-mensagem-0"
                value={mensagens[0] ?? ""}
                onChange={(e) => trocarMensagem(0, e.target.value)}
                rows={4}
                placeholder={t("Ola! Somos do escritório X. Podemos ajudar com o quê?")}
                className="w-full rounded-lg border bg-background p-3 text-sm"
              />
            </div>

            {mensagens.slice(1).map((m, idx) => {
              const i = idx + 1;
              return (
                <div key={i} className="space-y-1.5">
                  <Label htmlFor={`disparo-mensagem-${i}`}>
                    {t(`Mensagem ${i + 1} (opcional)`)}
                  </Label>
                  <textarea
                    id={`disparo-mensagem-${i}`}
                    value={m}
                    onChange={(e) => trocarMensagem(i, e.target.value)}
                    rows={3}
                    placeholder={t("Outra forma de dizer a mesma coisa")}
                    className="w-full rounded-lg border bg-background p-3 text-sm"
                  />
                </div>
              );
            })}

            {mensagens.length < MENSAGENS_POR_DISPARO_MAX && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMensagens((atual) => [...atual, ""])}
              >
                {t("+ Variação")}
              </Button>
            )}

            <p className="text-xs text-muted-foreground">
              {preenchidas.length > 1
                ? t(
                    `As ${preenchidas.length} mensagens se alternam: a 1ª no primeiro envio, a 2ª no segundo, e assim por diante, voltando à 1ª. Cada empresa recebe UMA. Quem responde entra na conversa no Inbox.`,
                  )
                : t("A mesma mensagem para todas. Quem responde entra na conversa no Inbox.")}
            </p>
          </div>
          )}

          <div className="flex flex-wrap gap-3">
            <div className="w-28 space-y-1.5">
              <Label htmlFor="disparo-limite">{t("Máx. por dia")}</Label>
              <Input
                id="disparo-limite"
                type="number"
                min={1}
                max={500}
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
              />
            </div>
            <div className="w-40 space-y-1.5">
              <Label htmlFor="disparo-espaco">{t("Intervalo (s)")}</Label>
              <Input
                id="disparo-espaco"
                type="number"
                min={0}
                max={60}
                value={espaco}
                onChange={(e) => setEspaco(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t(
              "Espera esse tempo entre uma mensagem e a seguinte. 60s é o ritmo que não queima o número — apertar aqui é mais rápido hoje e mais curto amanhã.",
            )}
          </p>

          {modo === "agendar" && (
            <div className="space-y-3 rounded-xl border p-3">
              <p className="text-sm font-medium">{t("Quando ele pode mandar")}</p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "O relógio é o da organização — o mesmo fuso das outras janelas de envio do produto, não o relógio do servidor. O agendamento manda uma mensagem por vez, no intervalo escolhido, e para sozinho quando acaba a lista ou o período.",
                )}
              </p>

              <div className="flex flex-wrap gap-3">
                <div className="w-40 space-y-1.5">
                  <Label htmlFor="agenda-inicio">{t("Data de")}</Label>
                  <Input
                    id="agenda-inicio"
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
                <div className="w-40 space-y-1.5">
                  <Label htmlFor="agenda-fim">{t("Data até")}</Label>
                  <Input
                    id="agenda-fim"
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                  />
                </div>
              </div>
              {!periodoValido && (
                <p className="text-xs text-destructive">
                  {t("A data final não pode ser anterior à inicial.")}
                </p>
              )}

              <DiasDaSemana dias={dias} onChange={setDias} idPrefixo="disparo" />

              <div className="space-y-2">
                <Label>{t("Horários do dia")}</Label>
                {janelas.map((j, i) => {
                  const invalida = j.inicio >= j.fim;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Input
                        aria-label={t("Início")}
                        type="time"
                        value={j.inicio}
                        onChange={(e) => trocarJanela(i, "inicio", e.target.value)}
                        className="w-32"
                      />
                      <span className="text-xs text-muted-foreground">{t("às")}</span>
                      <Input
                        aria-label={t("Fim")}
                        type="time"
                        value={j.fim}
                        onChange={(e) => trocarJanela(i, "fim", e.target.value)}
                        className="w-32"
                      />
                      {invalida && (
                        <span className="text-xs text-destructive">
                          {t("O fim tem de ser depois do início.")}
                        </span>
                      )}
                      {janelas.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setJanelas((atual) => atual.filter((_, k) => k !== i))}
                        >
                          {t("Remover")}
                        </Button>
                      )}
                    </div>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setJanelas((atual) => [...atual, { inicio: "07:00", fim: "12:00" }].slice(0, 10))
                  }
                >
                  {t("Adicionar horário")}
                </Button>
              </div>

              <p className="rounded-lg bg-muted p-2 text-sm">
                <strong>{t("Resumo:")}</strong> {resumoDaAgenda}
              </p>
            </div>
          )}

          {agendado && (
            <div className="rounded-xl border p-3 text-sm">
              <p className="font-medium">{t("Agendamento salvo.")}</p>
              <p className="text-muted-foreground">{resumoDaAgenda}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "Pode acompanhar pelos envios da campanha. Ele para sozinho quando a lista acaba ou o período termina.",
                )}
              </p>
            </div>
          )}

          {!plano && !resultado && modo === "agora" && (
            <Button
              size="sm"
              disabled={(!ehTemplate && preenchidas.length === 0) || ocupado}
              onClick={() => void chamar(true)}
            >
              {t("Simular envio")}
            </Button>
          )}

          {erro && <p className="text-sm text-destructive">{erro}</p>}

          {plano && (
            <div className="space-y-3 rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap gap-4">
                <span>
                  <strong>{plano.serao_enviados}</strong> {t("vão receber")}
                </span>
                <span>
                  <strong>{plano.serao_recusados}</strong> {t("não vão")}
                </span>
                {minutos > 0 && (
                  <span>
                    {t("duração")} <strong>{minutos}</strong> {t("min")}
                  </span>
                )}
              </div>

              {!plano.pode_enviar && (
                <p className="rounded-lg bg-amber-500/15 p-2 text-xs">
                  {plano.bloqueio === "numero_qualidade_red"
                    ? t(
                        "O número oficial está com qualidade RED na Meta. O envio fica bloqueado até a qualidade voltar para GREEN — revise o conteúdo e o público dos últimos envios.",
                      )
                    : t(
                        "Não há número de WhatsApp conectado. Escaneie o QR Code em Conexões para liberar o envio.",
                      )}
                </p>
              )}

              {plano.ja_enviados_hoje > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("Já saíram hoje nesta instalação:")} {plano.ja_enviados_hoje}
                </p>
              )}

              {plano.variacoes > 1 && (
                <div className="text-xs">
                  <p className="mb-1 font-medium">
                    {t(`${plano.variacoes} mensagens alternando`)}
                  </p>
                  <p className="text-muted-foreground">
                    {t("A ordem dos primeiros envios será:")}{" "}
                    <strong>{plano.rotacao.join(" → ")}</strong>
                    {plano.serao_enviados > plano.rotacao.length ? " → …" : ""}
                  </p>
                </div>
              )}

              {plano.por_motivo.length > 0 && (
                <div className="text-xs">
                  <p className="mb-1 font-medium">{t("Por que não vão:")}</p>
                  <ul className="space-y-0.5">
                    {plano.por_motivo.map((m) => (
                      <li key={m.motivo} className="text-muted-foreground">
                        {m.rotulo}: <strong>{m.total}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {resultado && (
            <div className="space-y-1 rounded-xl border p-3 text-sm">
              <p>
                {t("Enviadas")}: <strong>{resultado.enviados}</strong> · {t("Falhas")}:{" "}
                <strong>{resultado.falhas}</strong>
              </p>
              {resultado.detalhe_falhas.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {resultado.detalhe_falhas.slice(0, 5).map((f, i) => (
                    <li key={i}>
                      {f.nome}: {f.erro}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {modo === "agendar" && !agendado && (
            <Button disabled={ocupado || !podeAgendar} onClick={() => void agendar()}>
              {t(`Agendar para ${ids.length} empresas`)}
            </Button>
          )}
          {modo === "agora" && plano?.pode_enviar && !resultado && (
            <Button disabled={ocupado} onClick={() => void chamar(false)}>
              {t(`Enviar para ${plano.serao_enviados} empresas`)}
            </Button>
          )}
          <Button variant="outline" onClick={onFechar}>
            {resultado || agendado ? t("Fechar") : t("Cancelar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
