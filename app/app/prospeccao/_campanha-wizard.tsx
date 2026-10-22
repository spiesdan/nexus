"use client";
import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusSteps } from "@/components/nexus-ui/forms/NexusSteps";
import { NexusAiBriefing, type NexusInsight } from "@/components/nexus-ui/ai/NexusAi";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { DIAS_SEMANA, DIAS_UTEIS, DiasDaSemana } from "@/components/prospeccao/DiasDaSemana";
import { interpolateTemplate } from "@/lib/inbox/template-vars";
import { useMessageTemplates } from "@/hooks/inbox/useMessageTemplates";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";

/** Quantas caixas de mensagem a tela abre — o mesmo 3 do painel Disparo. */
const MENSAGENS_NA_TELA = 3;
/** O teto da rotação anti-ban (lib/schemas/prospeccao.ts, 1..5). */
const MENSAGENS_MAX = 5;

/** Uma janela do dia, em HH:MM — o mesmo shape de `lib/prospeccao/agendamento`. */
interface Janela {
  inicio: string;
  fim: string;
}

/** `YYYY-MM-DD` de hoje/daqui a N dias no relógio de QUEM OPERA a tela. */
function diaIso(diasAFrente = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return d.toLocaleDateString("en-CA");
}

interface CidadeAlvo {
  cidade: string;
  estado?: string;
}

interface EstimativaCidade {
  rotulo: string;
  empresas: number;
  clientes: number;
  potencial: number;
}

interface ResultadoExecucao {
  buscas: number;
  sem_mapa: string[];
}

function parseCidades(texto: string): CidadeAlvo[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const partes = l.split("/").map((s) => s.trim());
      const cidade = partes[0] ?? "";
      const estado = partes[1];
      return { cidade, ...(estado ? { estado: estado.toUpperCase() } : {}) };
    })
    .filter((c) => c.cidade.length > 0);
}

/**
 * Wizard de campanha (FASE 8): Segmentação → Público → Mensagem → Aprovação →
 * Resultado. Cria e executa a MESMA campanha de descoberta (POST + executar);
 * nada de envio em massa inventado — a mensagem é de abordagem manual, com
 * preview interpolado, e a execução só sai com aprovação explícita.
 */
export function CampanhaWizard({
  categorias,
  aoConcluir,
}: {
  categorias: MacroCategoria[];
  aoConcluir: () => void;
}) {
  const t = useT();
  const PASSOS = [t("Segmentação"), t("Público"), t("Mensagem"), t("Aprovação"), t("Resultado")];

  const [passo, setPasso] = React.useState(0);
  const [alcancado, setAlcancado] = React.useState(0);
  const [nome, setNome] = React.useState("");
  const [marcadas, setMarcadas] = React.useState<string[]>([]);
  /**
   * De onde a campanha tira o público (0271). `busca` é o padrão histórico —
   * fan-out no provedor ativo, gastando API. `base`: só o que já está
   * cadastrado, sem chave e sem gastar nada, que é o caminho de quem tem a
   * lista pronta e não quer pagar Google para ouvir de novo.
   */
  const [fontePublico, setFontePublico] = React.useState<"busca" | "base" | "ambas">("busca");
  const [cidadesTexto, setCidadesTexto] = React.useState("");
  const [recorrencia, setRecorrencia] = React.useState("");
  const [templateId, setTemplateId] = React.useState("__nenhum");
  /**
   * AS MENSAGENS DA CAMPANHA — várias, não uma.
   *
   * A tela abria UM campo e o descartava: o texto não entrava no POST, então
   * quem escrevia a abordagem aqui perdia o texto ao aprovar. O motor de
   * disparo sempre aceitou 1..5 variações em rotação (`mensagens`), e o painel
   * Disparo já mostrava três caixas — só este assistente não. Agora ele abre
   * as mesmas três, grava na campanha e o Disparo nasce com elas preenchidas.
   */
  const [mensagens, setMensagens] = React.useState<string[]>(() =>
    Array.from({ length: MENSAGENS_NA_TELA }, () => ""),
  );
  /**
   * QUANDO A CAMPANHA PODE FALAR — período, dias e horário de funcionamento.
   *
   * Faltava aqui, e a falta não era cosmética: o passo "Mensagem" não tinha
   * data nem janela, então a campanha saía sem saber quando podia mandar. O
   * motor (`lib/prospeccao/agendado.ts`) sempre aceitou `data_inicio`,
   * `data_fim` e `janelas` — só este assistente não perguntava. O Disparo
   * depois abria com os padrões dele, ignorando a intenção do dono.
   */
  const [dataInicio, setDataInicio] = React.useState(() => diaIso());
  const [dataFim, setDataFim] = React.useState(() => diaIso(7));
  const [dias, setDias] = React.useState<number[]>(DIAS_UTEIS);
  const [janelas, setJanelas] = React.useState<Janela[]>([
    { inicio: "07:00", fim: "12:00" },
    { inicio: "13:00", fim: "19:00" },
  ]);
  const [limite, setLimite] = React.useState("50");
  const [aprovado, setAprovado] = React.useState(false);
  const [ocupado, setOcupado] = React.useState(false);
  const [resultado, setResultado] = React.useState<ResultadoExecucao | null>(null);

  const templates = useMessageTemplates();
  const cidades = React.useMemo(() => parseCidades(cidadesTexto), [cidadesTexto]);

  const [estimativas, setEstimativas] = React.useState<{
    chave: string;
    dados: EstimativaCidade[];
  } | null>(null);

  const chaveCidades = cidades.map((c) => `${c.cidade}/${c.estado ?? ""}`).join("|");
  const estimando = passo === 1 && cidades.length > 0 && estimativas?.chave !== chaveCidades;

  // Estimativa de público: mercado real por cidade (empresas, clientes,
  // potencial). FASE 15 (B15): as até 5 cidades viajam num pedido só
  // (`?cidades=…`) — eram 5 requests, uma por cidade.
  // Sem setState no corpo do efeito: a chave identifica o pedido e o loading
  // deriva dela — sem cascata de renders.
  React.useEffect(() => {
    if (passo !== 1 || cidades.length === 0) return;
    const chave = cidades.map((c) => `${c.cidade}/${c.estado ?? ""}`).join("|");
    let vivo = true;
    (async () => {
      try {
        const pedidas = cidades.slice(0, 5);
        const qs = new URLSearchParams();
        for (const c of pedidas) qs.append("cidades", c.cidade);
        const corpo = await apiClient.get<{
          data: { por_cidade?: { cidade: string; empresas: number; clientes: number }[] };
        }>(`/api/v1/prospecting/mercado?${qs.toString()}`);
        const achou = new Map(
          (corpo.data?.por_cidade ?? []).map((x) => [x.cidade, x] as const),
        );
        const partes = pedidas.map((c) => {
          const linha = achou.get(c.cidade);
          const empresas = linha?.empresas ?? 0;
          const clientes = linha?.clientes ?? 0;
          return {
            rotulo: c.estado ? `${c.cidade}/${c.estado}` : c.cidade,
            empresas,
            clientes,
            potencial: Math.max(0, empresas - clientes),
          };
        });
        if (vivo) setEstimativas({ chave, dados: partes });
      } catch {
        if (vivo) setEstimativas({ chave, dados: [] });
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo, chaveCidades]);

  function ir(prox: number) {
    setPasso(prox);
    setAlcancado((a) => Math.max(a, prox));
  }

  function continuar() {
    if (passo === 0) {
      if (nome.trim().length < 2 || marcadas.length === 0 || cidades.length === 0) {
        nexusToast.error(
          t("Nome, ao menos 1 categoria e ao menos 1 cidade (uma por linha, Cidade/UF)."),
        );
        return;
      }
      if (nome.trim().length > 120) {
        nexusToast.error(t("O nome da campanha pode ter no máximo 120 caracteres."));
        return;
      }
      const cidadeInvalida = cidades.find(
        (c) =>
          c.cidade.trim().length < 2 ||
          c.cidade.trim().length > 120 ||
          (c.estado ?? "").length > 10,
      );
      if (cidadeInvalida) {
        nexusToast.error(
          t("Cidade inválida: use Cidade/UF, com até 120 caracteres na cidade e 10 na UF."),
        );
        return;
      }
      if (recorrencia) {
        const dias = Number(recorrencia);
        if (!Number.isFinite(dias) || dias < 7 || dias > 365) {
          nexusToast.error(t("A recorrência precisa ficar entre 7 e 365 dias."));
          return;
        }
      }
    }
    if (passo === 2) {
      if (!periodoValido) {
        nexusToast.error(t("A data final não pode ser anterior à inicial."));
        return;
      }
      if (!janelasValidas) {
        nexusToast.error(t("Cada janela precisa de um início antes do fim."));
        return;
      }
      if (dias.length === 0) {
        nexusToast.error(t("Escolha ao menos um dia da semana para enviar."));
        return;
      }
    }
    ir(Math.min(PASSOS.length - 1, passo + 1));
  }

  const preenchidas = mensagens.map((m) => m.trim()).filter((m) => m !== "");
  const mensagemFinal = preenchidas[0] ?? "";
  const preview = mensagemFinal ? interpolateTemplate(mensagemFinal, { name: "Maria Silva" }) : "";

  /** Janela válida = HH:MM com início antes do fim. O motor recusa o resto. */
  const janelasValidas =
    janelas.length > 0 &&
    janelas.every(
      (j) => /^\d{2}:\d{2}$/.test(j.inicio) && /^\d{2}:\d{2}$/.test(j.fim) && j.inicio < j.fim,
    );
  const periodoValido = !dataInicio || !dataFim || dataFim >= dataInicio;

  function trocarMensagem(i: number, valor: string) {
    setMensagens((atual) => atual.map((v, j) => (j === i ? valor : v)));
  }

  /** Escolher um modelo escreve o corpo na PRIMEIRA caixa; as outras ficam. */
  function escolherModelo(id: string) {
    setTemplateId(id);
    const corpo = (templates.data ?? []).find((x) => x.id === id)?.body;
    if (corpo) trocarMensagem(0, corpo);
  }

  const dadosEstimativa = estimativas?.chave === chaveCidades ? estimativas.dados : null;

  const insights = React.useMemo<NexusInsight[]>(() => {
    if (!dadosEstimativa || dadosEstimativa.length === 0) return [];
    const top = [...dadosEstimativa].sort((a, b) => b.potencial - a.potencial)[0]!;
    if (top.potencial === 0) return [];
    return [
      {
        id: "potencial",
        text: `${top.rotulo} ${t("concentra o maior potencial")}: ${top.potencial} ${t("empresas ainda não clientes.")}`,
      },
    ];
  }, [dadosEstimativa, t]);

  async function criarEExecutar() {
    if (!aprovado) {
      nexusToast.error(t("Marque a aprovação para executar."));
      return;
    }
    // A navegação por clique nos passos (`NexusSteps`) não passa por
    // `continuar()`. Validar aqui é o que impede o 422 genérico de "Dados
    // inválidos." sem dizer QUAL campo o servidor recusou.
    if (nome.trim().length < 2 || nome.trim().length > 120) {
      nexusToast.error(t("O nome da campanha precisa ter entre 2 e 120 caracteres."));
      return;
    }
    if (marcadas.length === 0) {
      nexusToast.error(t("Escolha ao menos 1 categoria para a campanha."));
      return;
    }
    if (cidades.length === 0) {
      nexusToast.error(t("Informe ao menos 1 cidade (Cidade/UF, uma por linha)."));
      return;
    }
    const cidadeInvalida = cidades.find(
      (c) =>
        c.cidade.trim().length < 2 ||
        c.cidade.trim().length > 120 ||
        (c.estado ?? "").length > 10,
    );
    if (cidadeInvalida) {
      nexusToast.error(
        t("Cidade inválida: use Cidade/UF, com até 120 caracteres na cidade e 10 na UF."),
      );
      return;
    }
    if (recorrencia) {
      const dias = Number(recorrencia);
      if (!Number.isFinite(dias) || dias < 7 || dias > 365) {
        nexusToast.error(t("A recorrência precisa ficar entre 7 e 365 dias."));
        return;
      }
    }
    if (!periodoValido) {
      nexusToast.error(t("A data final não pode ser anterior à inicial."));
      return;
    }
    if (!janelasValidas || dias.length === 0) {
      nexusToast.error(t("Confira as janelas e escolha ao menos um dia da semana."));
      return;
    }
    const mensagemLonga = preenchidas.find((m) => [...m].length > 4000);
    if (mensagemLonga) {
      nexusToast.error(t("Cada mensagem pode ter no máximo 4000 caracteres."));
      return;
    }
    setOcupado(true);
    try {
      const criada = await apiClient.post<{ data: { id: string } }>(
        "/api/v1/prospecting/campaigns",
        {
          nome: nome.trim(),
          categorias: marcadas,
          cidades,
          fonte_publico: fontePublico,
          ...(preenchidas.length > 0 ? { mensagens: preenchidas } : {}),
          ...(recorrencia ? { recorrencia_dias: Number(recorrencia) } : {}),
          // O "quando": período, janelas (com os dias) e cota do dia. Sem
          // isso o Disparo abria com os padrões dele, ignorando a intenção.
          ...(dataInicio ? { data_inicio: dataInicio } : {}),
          ...(dataFim ? { data_fim: dataFim } : {}),
          janelas: janelas.map((j) => ({ ...j, dias })),
          limite_diario: Math.min(500, Math.max(1, Number(limite) || 50)),
          // 60s entre duas mensagens — o mesmo default da coluna e o piso do
          // anti-ban (ESPACO_ANTIBAN_MS). Vai explícito para a campanha não
          // depender do default de uma migration futura.
          espaco_ms: 60_000,
        },
      );
      const corpo = await apiClient.post<{ data: { buscas: number; sem_mapa: string[] } | null }>(
        `/api/v1/prospecting/campaigns/${criada.data.id}/executar`,
        {},
      );
      const r = corpo?.data ?? { buscas: 0, sem_mapa: [] as string[] };
      setResultado({ buscas: r.buscas, sem_mapa: r.sem_mapa ?? [] });
      nexusToast.success(`${r.buscas} ${t("buscas criadas")}`);
      aoConcluir();
      ir(4);
    } catch (e) {
      showApiError(e);
    } finally {
      setOcupado(false);
    }
  }

  function recomeçar() {
    setPasso(0);
    setAlcancado(0);
    setNome("");
    setMarcadas([]);
    setCidadesTexto("");
    setRecorrencia("");
    setTemplateId("__nenhum");
    setMensagens(Array.from({ length: MENSAGENS_NA_TELA }, () => ""));
    setDataInicio(diaIso());
    setDataFim(diaIso(7));
    setDias(DIAS_UTEIS);
    setJanelas([
      { inicio: "07:00", fim: "12:00" },
      { inicio: "13:00", fim: "19:00" },
    ]);
    setLimite("50");
    setAprovado(false);
    setResultado(null);
  }

  const opcoes = categorias.flatMap((m) =>
    m.subcategorias.map((s) => ({ ...s, chave: `${m.macro}:${s.busca}` })),
  );

  return (
    <Card className="hover-raise space-y-4 p-4">
      <NexusSteps steps={PASSOS} current={passo} reached={alcancado} onGo={setPasso} />

      {passo === 0 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wiz-nome">{t("Nome da campanha")}</Label>
            <Input
              id="wiz-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Oficinas — Norte SC"
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">{t("Categorias")}</p>
            <div className="flex flex-wrap gap-2">
              {opcoes.map((s) => (
                <label
                  key={s.chave}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                    marcadas.includes(s.busca)
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={marcadas.includes(s.busca)}
                    onChange={() =>
                      setMarcadas((mm) =>
                        mm.includes(s.busca) ? mm.filter((x) => x !== s.busca) : [...mm, s.busca],
                      )
                    }
                  />
                  {s.rotulo}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wiz-cidades">{t("Cidades (uma por linha, Cidade/UF)")}</Label>
              <textarea
                id="wiz-cidades"
                className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={cidadesTexto}
                onChange={(e) => setCidadesTexto(e.target.value)}
                placeholder={t("Exemplo de cidades") + ": Canoinhas/SC, Mafra/SC"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-fonte">{t("De onde sai o público")}</Label>
              <select
                id="wiz-fonte"
                className="h-9 w-full rounded-lg border bg-background px-3 text-sm"
                value={fontePublico}
                onChange={(e) => setFontePublico(e.target.value as typeof fontePublico)}
              >
                <option value="busca">
                  {t("Buscar empresas agora (usa API do Google)")}
                </option>
                <option value="base">{t("Usar o que já está cadastrado (sem API)")}</option>
                <option value="ambas">{t("Os dois")}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {fontePublico === "busca"
                  ? t(
                      "A campanha procura empresas novas na região. Gastou API do Google e precisa de chave ativa.",
                    )
                  : t(
                      "A campanha usa só as empresas que você já tem cadastradas, nas mesmas cidades e categorias. Empresas duplicadas e clientes que a loja já atende saem da fila.",
                    )}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-rec">{t("Repetir a cada (dias, opcional)")}</Label>
              <Input
                id="wiz-rec"
                type="number"
                min={7}
                max={365}
                value={recorrencia}
                onChange={(e) => setRecorrencia(e.target.value)}
                placeholder="90"
              />
              <p className="text-xs text-muted-foreground">
                {t("Só registra a intenção — o agendador automático é fase futura.")}
              </p>
            </div>
          </div>
        </div>
      )}

      {passo === 1 && (
        <div className="space-y-3">
          {cidades.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("Volte e informe ao menos 1 cidade.")}
            </p>
          ) : estimando || dadosEstimativa === null ? (
            <Skeleton className="h-32 w-full" />
          ) : dadosEstimativa.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("Não foi possível estimar agora — dá para seguir mesmo assim.")}
            </p>
          ) : (
            <>
              <ul className="divide-y rounded-lg border">
                {dadosEstimativa.map((e) => (
                  <li
                    key={e.rotulo}
                    className="flex items-center justify-between gap-2 p-3 text-sm"
                  >
                    <span className="font-medium">{e.rotulo}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {e.empresas} {t("empresas")} · {e.clientes} {t("clientes")} ·{" "}
                      <strong className="text-text">
                        {e.potencial} {t("potenciais")}
                      </strong>
                    </span>
                  </li>
                ))}
              </ul>
              <NexusAiBriefing
                title={t("Leitura do potencial")}
                insights={insights}
                emptyText={t("Sem destaque de potencial nestas cidades.")}
              />
            </>
          )}
        </div>
      )}

      {passo === 2 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="wiz-template">{t("Modelo de abordagem (opcional)")}</Label>
            <Select value={templateId} onValueChange={escolherModelo}>
              <SelectTrigger id="wiz-template" className="w-full">
                <SelectValue placeholder={t("Escrever na mão")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum">{t("Escrever na mão")}</SelectItem>
                {(templates.data ?? []).map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("Mensagens (giram nesta ordem, uma por envio)")}</Label>            {mensagens.map((m, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`wiz-msg-${i}`} className="text-xs font-normal text-muted-foreground">
                    {i === 0 ? t("Mensagem 1 (sai primeiro)") : t(`Mensagem ${i + 1} (opcional)`)}
                  </Label>
                  {mensagens.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setMensagens((atual) => atual.filter((_, j) => j !== i))}
                    >
                      {t("Remover")}
                    </Button>
                  )}
                </div>
                <textarea
                  id={`wiz-msg-${i}`}
                  className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  value={m}
                  maxLength={4000}
                  onChange={(e) => {
                    trocarMensagem(i, e.target.value);
                    if (templateId !== "__nenhum") setTemplateId("__nenhum");
                  }}
                  placeholder={i === 0 ? t("Olá {{primeiro_nome}}! Aqui é da …") : t("Outra forma de dizer a mesma coisa")}
                />
              </div>
            ))}
            {mensagens.length < MENSAGENS_MAX && (
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
                    `As ${preenchidas.length} mensagens se alternam: a 1ª no primeiro envio, a 2ª no segundo, e assim por diante, voltando à 1ª. Cada empresa recebe UMA.`,
                  )
                : t("A mesma mensagem para todas. Quem responde entra na conversa no Inbox.")}
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">{t("Quando enviar")}</p>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Período, dias da semana e horário de funcionamento. A campanha guarda isso; o Disparo usa quando você escolher as empresas.",
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-inicio">{t("Começa em")}</Label>
                <Input
                  id="wiz-inicio"
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-fim">{t("Termina em")}</Label>
                <Input
                  id="wiz-fim"
                  type="date"
                  value={dataFim}
                  min={dataInicio || undefined}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
            {!periodoValido && (
              <p className="text-xs text-destructive">
                {t("A data final não pode ser anterior à inicial.")}
              </p>
            )}

            <DiasDaSemana dias={dias} onChange={setDias} idPrefixo="wizard" />

            <div className="space-y-2">
              <Label>{t("Horário de funcionamento (janelas de envio)")}</Label>
              {janelas.map((j, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label={t(`Início da janela ${i + 1}`)}
                    className="w-32"
                    value={j.inicio}
                    onChange={(e) =>
                      setJanelas((atual) =>
                        atual.map((v, k) => (k === i ? { ...v, inicio: e.target.value } : v)),
                      )
                    }
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    aria-label={t(`Fim da janela ${i + 1}`)}
                    className="w-32"
                    value={j.fim}
                    onChange={(e) =>
                      setJanelas((atual) =>
                        atual.map((v, k) => (k === i ? { ...v, fim: e.target.value } : v)),
                      )
                    }
                  />
                  {janelas.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setJanelas((atual) => atual.filter((_, k) => k !== i))}
                    >
                      {t("Remover")}
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setJanelas((atual) => [...atual, { inicio: "08:00", fim: "18:00" }])}
              >
                {t("+ Janela")}
              </Button>
              {!janelasValidas && (
                <p className="text-xs text-destructive">
                  {t("Cada janela precisa de um início antes do fim.")}
                </p>
              )}
            </div>

            <div className="w-32 space-y-1.5">
              <Label htmlFor="wiz-limite">{t("Máx. por dia")}</Label>
              <Input
                id="wiz-limite"
                type="number"
                min={1}
                max={500}
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {t(
                "Ritmo: 1 mensagem por minuto (60s) por número — o teto anti-ban. O envio também respeita o aquecimento do WhatsApp e a cota do dia.",
              )}
            </p>
          </div>

          {preview ? (
            <div className="hover-raise rounded-lg border border-border bg-surface-elevated p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">
                {t("Pré-visualização")}
              </p>
              <p className="text-sm">{preview}</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("Abordagem manual por empresa — nunca disparo automático sem consentimento.")}
          </p>
        </div>
      )}

      {passo === 3 && (
        <div className="space-y-3 text-sm">
          <dl className="space-y-1 rounded-lg border p-3">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("Campanha")}</dt>
              <dd className="font-medium">{nome.trim() || "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("Público")}</dt>
              <dd className="text-right tabular-nums">
                {marcadas.length} {t("categoria(s)")} · {cidades.length} {t("cidade(s)")}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("Mensagem")}</dt>
              <dd className="text-right">
                {preenchidas.length === 0
                  ? t("sem mensagem")
                  : preenchidas.length === 1
                    ? t("1 mensagem")
                    : `${preenchidas.length} ${t("mensagens em rotação")}`}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("Período")}</dt>
              <dd className="text-right tabular-nums">
                {dataInicio || "—"} {t("a")} {dataFim || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("Horário")}</dt>
              <dd className="text-right tabular-nums">
                {janelas.map((j) => `${j.inicio}–${j.fim}`).join(" · ")}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{t("Dias")}</dt>
              <dd className="text-right">
                {dias.length === 7
                  ? t("todos os dias")
                  : dias
                      .map((d) => t(DIAS_SEMANA.find((x) => x.valor === d)?.curto ?? ""))
                      .join(", ")}
              </dd>
            </div>
          </dl>
          <label className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={aprovado}
              onChange={(e) => setAprovado(e.target.checked)}
            />
            <span>
              {t("Aprovo a execução desta campanha de descoberta.")}
              <span className="block text-xs text-muted-foreground">
                {t("Cria a busca por cidade. As mensagens ficam salvas na campanha e já vêm preenchidas no Disparo quando você escolher as empresas.")}
              </span>
            </span>
          </label>
          <Button disabled={ocupado || !aprovado} onClick={criarEExecutar}>
            {ocupado ? t("Executando…") : t("Aprovar e executar")}
          </Button>
        </div>
      )}

      {passo === 4 && (
        <div className="space-y-3 text-sm">
          {resultado ? (
            <>
              <p className="text-base font-medium">{`${resultado.buscas} ${t("buscas criadas")}`}</p>
              {resultado.sem_mapa.length > 0 && (
                <p className="text-muted-foreground">
                  {t("Sem mapa")}: {resultado.sem_mapa.join(", ")}
                </p>
              )}
              <p className="text-muted-foreground">
                {t("Acompanhe o progresso na aba Pesquisas.")}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">{t("Nenhuma execução ainda.")}</p>
          )}
          <Button variant="outline" onClick={recomeçar}>
            {t("Nova campanha")}
          </Button>
        </div>
      )}

      {passo < 4 && (
        <div className="flex items-center justify-between gap-3">
          {passo > 0 ? (
            <Button variant="outline" onClick={() => setPasso((p) => Math.max(0, p - 1))}>
              {t("Voltar")}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={continuar}>{t("Continuar")}</Button>
        </div>
      )}
    </Card>
  );
}
