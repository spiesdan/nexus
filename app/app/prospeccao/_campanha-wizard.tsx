"use client";

/**
 * NOVA CAMPANHA — três passos: Público → Mensagens e agenda → Revisão.
 *
 * ═══ O DEFEITO MEDIDO ═════════════════════════════════════════════════════
 *
 * O assistente antigo tinha cinco passos e pedia as cidades num textarea
 * ("uma por linha, Cidade/UF"). Quem não lembrasse a grafia exata da planilha
 * criava uma campanha sem público; o passo "Público" mostrava uma estimativa
 * de MERCADO, não as empresas da base; e o resultado era um card efêmero que
 * sumia ao fechar a tela.
 *
 * ═══ A REGRA NOVA ════════════════════════════════════════════════════════
 *
 *   - a fonte padrão é a BASE (sem gastar API); Google é opção secundária;
 *   - cidade é SELECIONADA da lista real, com a contagem de empresas;
 *   - a prévia roda a MESMA função do disparo e mostra as empresas antes de
 *     criar — não reserva nada;
 *   - ao criar, o operador vai para o CONTROLE da campanha (/campanhas/[id]),
 *     onde vê a fila e agenda o envio.
 *
 * O que este assistente NÃO faz: disparar. Criar e enviar eram dois atos
 * confundidos no desenho antigo; separá-los é o que permite revisar o público
 * e escolher entre "agora" e "agendar" sem refazer a campanha.
 */
import * as React from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusSteps } from "@/components/nexus-ui/forms/NexusSteps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DIAS_UTEIS, DiasDaSemana, resumoDosDias } from "@/components/prospeccao/DiasDaSemana";
import { useT } from "@/hooks/i18n/useT";
import { useMessageTemplates } from "@/hooks/inbox/useMessageTemplates";
import { apiClient } from "@/lib/api/client";
import { renderTemplateBody } from "@/lib/channels/meta/render-template";
import { interpolateTemplate } from "@/lib/inbox/template-vars";
import { interpolarValoresDoTemplate } from "@/lib/prospeccao/mensagem-da-campanha";
import type { MacroCategoria } from "@/lib/prospeccao/categorias";
import {
  presetsDaSelecao,
  presetSugerido,
  type PresetDeMensagens,
} from "@/lib/prospeccao/mensagens-por-categoria";

/** Quantas caixas a tela abre — o mesmo 3 do painel Disparo. */
const MENSAGENS_NA_TELA = 3;
/** O teto da rotação anti-ban (lib/schemas/prospeccao.ts, 1..5). */
const MENSAGENS_MAX = 5;

const PASSOS = ["Público", "Mensagens e agenda", "Revisão"];

interface CidadeAlvo {
  cidade: string;
  estado?: string;
}

interface CidadeOpcao {
  cidade: string;
  estado: string | null;
  total: number;
}

interface PreviaLinha {
  id: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  categoria: string | null;
  categoria_original: string | null;
}

interface PreviaResposta {
  base: boolean;
  total: number;
  linhas: PreviaLinha[];
  resumo: string;
  limite: number;
  ja_clientes: Array<{ nome: string }>;
  duplicadas: number;
  para_revisar: Array<{ nome: string }>;
  em_campanha: number;
  categoria_a_revisar: number;
  varridas: number;
  completa: boolean;
}

interface Janela {
  inicio: string;
  fim: string;
}

/**
 * O modelo como a TELA precisa: a chave composta do slot e o motivo da recusa.
 * Vem de `/api/v1/prospecting/campaigns/canais`, que lê o mesmo espelho do
 * motor — não há segunda derivação de contrato no cliente.
 */
interface ModeloDoCanal {
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
  parameterFormat: string;
  contractHash: string;
  syncedAt: string;
  slots: Array<{
    slotKey: string;
    key: string;
    expects: string;
    onde: string;
    contexto: string;
  }>;
  previews: Array<{ onde: string; text: string }>;
  components: unknown[];
  aceito: boolean;
  motivo: string | null;
}

interface CanaisDaCampanha {
  pode_texto: boolean;
  pode_template: boolean;
  oficial_conectado: boolean;
  templates: ModeloDoCanal[];
}

const chaveDoModelo = (m: Pick<ModeloDoCanal, "name" | "language">) => `${m.name}|${m.language}`;

function diaIso(diasAFrente = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + diasAFrente);
  return d.toLocaleDateString("en-CA");
}

function chaveDaCidade(c: CidadeAlvo): string {
  return `${c.cidade.trim().toLowerCase()}|${(c.estado ?? "").trim().toLowerCase()}`;
}

function rotuloDaCidade(c: CidadeAlvo): string {
  return c.estado ? `${c.cidade}/${c.estado}` : c.cidade;
}

function linhasDeMensagem(iniciais: readonly string[]): string[] {
  const preenchidas = iniciais.map((m) => (typeof m === "string" ? m : ""));
  const total = Math.min(MENSAGENS_MAX, Math.max(MENSAGENS_NA_TELA, preenchidas.length));
  return Array.from({ length: total }, (_, i) => preenchidas[i] ?? "");
}

export function CampanhaWizard({
  categorias,
  aoConcluir,
}: {
  categorias: MacroCategoria[];
  aoConcluir: (id: string) => void;
}) {
  const t = useT();
  const templates = useMessageTemplates();

  const [passo, setPasso] = React.useState(0);
  const [alcancado, setAlcancado] = React.useState(0);
  const [nome, setNome] = React.useState("");
  const [fonte, setFonte] = React.useState<"base" | "busca" | "ambas">("base");

  // ── Cidades ──────────────────────────────────────────────────────────────
  const [opcoes, setOpcoes] = React.useState<CidadeOpcao[] | null>(null);
  const [carregandoOpcoes, setCarregandoOpcoes] = React.useState(true);
  const [erroOpcoes, setErroOpcoes] = React.useState<string | null>(null);
  const [buscaCidade, setBuscaCidade] = React.useState("");
  const [cidadesSelecionadas, setCidadesSelecionadas] = React.useState<CidadeAlvo[]>([]);
  const [cidadeManual, setCidadeManual] = React.useState("");
  const [ufManual, setUfManual] = React.useState("");

  // ── Categorias ───────────────────────────────────────────────────────────
  const [buscaCategoria, setBuscaCategoria] = React.useState("");
  const [categoriasMarcadas, setCategoriasMarcadas] = React.useState<string[]>([]);

  // ── Prévia ───────────────────────────────────────────────────────────────
  const [previa, setPrevia] = React.useState<PreviaResposta | null>(null);
  const [previaChave, setPreviaChave] = React.useState<string | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = React.useState(false);

  // ── Mensagens e agenda ───────────────────────────────────────────────────
  const [mensagens, setMensagens] = React.useState<string[]>(() => linhasDeMensagem([""]));
  const [templateId, setTemplateId] = React.useState("__nenhum");

  // ── Canal oficial e modelo aprovado (0284) ───────────────────────────────
  // `texto` é o caminho anti-ban por QR; `template` é o único que a API
  // oficial entrega fora da janela de 24h. A tela pergunta à API quais os
  // canais disponíveis em vez de decidir por nome de provider.
  const [canais, setCanais] = React.useState<CanaisDaCampanha | null>(null);
  const [canaisErro, setCanaisErro] = React.useState<string | null>(null);
  const [tipoMensagem, setTipoMensagem] = React.useState<"texto" | "template">("texto");
  const [modeloChave, setModeloChave] = React.useState("");
  const [valoresModelo, setValoresModelo] = React.useState<Record<string, string>>({});
  // Padrões salvos em Configuração › Mensagens por categoria.
  const [presets, setPresets] = React.useState<PresetDeMensagens[]>([]);
  const [presetsErro, setPresetsErro] = React.useState(false);
  // De qual categoria vieram as caixas de agora. null = texto do operador.
  const [presetAplicado, setPresetAplicado] = React.useState<string | null>(null);
  const [dataInicio, setDataInicio] = React.useState(() => diaIso());
  const [dataFim, setDataFim] = React.useState(() => diaIso(7));
  const [dias, setDias] = React.useState<number[]>(DIAS_UTEIS);
  const [janelas, setJanelas] = React.useState<Janela[]>([
    { inicio: "07:00", fim: "12:00" },
    { inicio: "13:00", fim: "19:00" },
  ]);
  const [limite, setLimite] = React.useState("50");
  const [recorrencia, setRecorrencia] = React.useState("");
  const [criando, setCriando] = React.useState(false);

  const carregarOpcoes = React.useCallback(async () => {
    setCarregandoOpcoes(true);
    setErroOpcoes(null);
    try {
      const resposta = await apiClient.get<{ data?: { cidades?: CidadeOpcao[] } }>(
        "/api/v1/prospecting/campaigns/opcoes",
      );
      const lista = resposta?.data?.cidades;
      setOpcoes(Array.isArray(lista) ? lista : []);
    } catch (e) {
      setOpcoes([]);
      setErroOpcoes(e instanceof Error ? e.message : t("Não foi possível carregar as cidades."));
      showApiError(e);
    } finally {
      setCarregandoOpcoes(false);
    }
  }, [t]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregarOpcoes();
  }, [carregarOpcoes]);

  React.useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const resposta = await apiClient.get<{ data?: PresetDeMensagens[] }>(
          "/api/v1/prospecting/mensagens-por-categoria",
        );
        if (!cancelado) {
          setPresets(Array.isArray(resposta?.data) ? resposta.data : []);
          setPresetsErro(false);
        }
      } catch {
        // O padrão é conveniência, não pré-requisito: falhar aqui não pode
        // impedir a campanha. O operador escreve o texto como antes — e a tela
        // DIZ que não conseguiu carregar, em vez de fingir que não há padrão.
        if (!cancelado) {
          setPresets([]);
          setPresetsErro(true);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const resposta = await apiClient.get<{ data?: CanaisDaCampanha }>(
          "/api/v1/prospecting/campaigns/canais",
        );
        if (cancelado) return;
        const dados = resposta?.data ?? null;
        setCanais(dados);
        setCanaisErro(null);
        // Sem canal de texto e com oficial de pé, o único caminho que ENTREGA
        // é o modelo. Escolher por omissão aqui evita uma campanha de texto que
        // a API aceita e a Meta recusa na entrega (131047).
        if (dados && !dados.pode_texto && dados.pode_template) {
          setTipoMensagem("template");
        }
      } catch (e) {
        if (!cancelado) {
          setCanais(null);
          setCanaisErro(
            e instanceof Error ? e.message : t("Não foi possível carregar os canais."),
          );
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [t]);

  const chaveSelecao = React.useMemo(
    () =>
      JSON.stringify({
        fonte,
        cidades: cidadesSelecionadas.map(chaveDaCidade).sort(),
        categorias: [...categoriasMarcadas].sort(),
      }),
    [fonte, cidadesSelecionadas, categoriasMarcadas],
  );
  const previaValida = previa !== null && previaChave === chaveSelecao;

  const cidadesFiltradas = React.useMemo(() => {
    const termo = buscaCidade.trim().toLowerCase();
    const selecionadas = new Set(cidadesSelecionadas.map(chaveDaCidade));
    return (opcoes ?? [])
      .filter((c) => {
        if (!termo) return true;
        const alvo = `${c.cidade} ${c.estado ?? ""}`.toLowerCase();
        return alvo.includes(termo);
      })
      .sort((a, b) => {
        const sa = selecionadas.has(
          chaveDaCidade({ cidade: a.cidade, estado: a.estado ?? undefined }),
        );
        const sb = selecionadas.has(
          chaveDaCidade({ cidade: b.cidade, estado: b.estado ?? undefined }),
        );
        if (sa !== sb) return sa ? -1 : 1;
        return b.total - a.total || a.cidade.localeCompare(b.cidade, "pt-BR");
      });
  }, [opcoes, buscaCidade, cidadesSelecionadas]);

  const gruposDeCategoria = React.useMemo(() => {
    const termo = buscaCategoria.trim().toLowerCase();
    return categorias
      .map((macro) => {
        const macroCasa = macro.macro.toLowerCase().includes(termo);
        const subs = macro.subcategorias.filter(
          (s) =>
            !termo ||
            macroCasa ||
            s.rotulo.toLowerCase().includes(termo) ||
            s.busca.toLowerCase().includes(termo),
        );
        return { macro: macro.macro, subs };
      })
      .filter((g) => g.subs.length > 0);
  }, [categorias, buscaCategoria]);

  const rotulosSelecionados = React.useMemo(() => {
    const mapa = new Map<string, string>();
    for (const macro of categorias) {
      for (const sub of macro.subcategorias) {
        if (!mapa.has(sub.busca)) mapa.set(sub.busca, sub.rotulo);
      }
    }
    return categoriasMarcadas.map((busca) => ({ busca, rotulo: mapa.get(busca) ?? busca }));
  }, [categorias, categoriasMarcadas]);

  const presetsDisponiveis = React.useMemo(
    () => presetsDaSelecao(presets, categoriasMarcadas),
    [presets, categoriasMarcadas],
  );

  const rotuloDaCategoria = React.useCallback(
    (busca: string) => rotulosSelecionados.find((c) => c.busca === busca)?.rotulo ?? busca,
    [rotulosSelecionados],
  );

  // O padrão aplicado pode deixar de existir se o operador voltar e tirar a
  // categoria da seleção. Nesse caso o texto continua na tela (é dele), mas o
  // seletor não pode fingir que ainda aponta para uma opção inexistente.
  const presetEmUso =
    presetAplicado !== null && presetsDisponiveis.some((p) => p.categoria === presetAplicado)
      ? presetAplicado
      : null;

  const preenchidas = mensagens.map((m) => m.trim()).filter((m) => m !== "");
  const primeiraMensagem = preenchidas[0] ?? "";
  const previewMensagem = primeiraMensagem
    ? interpolateTemplate(primeiraMensagem, { name: "Maria Silva" })
    : "";

  const modelos = canais?.templates ?? [];
  const modeloSelecionado =
    modelos.find((m) => chaveDoModelo(m) === modeloChave && m.aceito) ?? null;
  const valoresComExemplo = interpolarValoresDoTemplate(valoresModelo, {
    nome: "Maria Silva",
    cidade: "Belo Horizonte",
    categoria: "Oficina mecânica",
  });
  const previewModelo = modeloSelecionado
    ? renderTemplateBody(modeloSelecionado.components, valoresComExemplo, {
        name: modeloSelecionado.name,
        language: modeloSelecionado.language,
        parameterFormat: modeloSelecionado.parameterFormat,
      })
    : "";
  const podeTexto = canais?.pode_texto ?? false;
  const podeTemplate = canais?.pode_template ?? false;

  const janelasValidas = janelas.filter(
    (j) => /^\d{2}:\d{2}$/.test(j.inicio) && /^\d{2}:\d{2}$/.test(j.fim) && j.inicio < j.fim,
  );
  const periodoValido = !dataInicio || !dataFim || dataFim >= dataInicio;
  const limiteNumero = Number(limite) || 50;

  function alternarCidade(c: CidadeOpcao) {
    const alvo: CidadeAlvo = { cidade: c.cidade, ...(c.estado ? { estado: c.estado } : {}) };
    const chave = chaveDaCidade(alvo);
    setCidadesSelecionadas((atuais) => {
      if (atuais.some((x) => chaveDaCidade(x) === chave)) {
        return atuais.filter((x) => chaveDaCidade(x) !== chave);
      }
      if (atuais.length >= 50) {
        toast.error(t("Uma campanha pode ter no máximo 50 cidades."));
        return atuais;
      }
      return [...atuais, alvo];
    });
  }

  function removerCidade(alvo: CidadeAlvo) {
    const chave = chaveDaCidade(alvo);
    setCidadesSelecionadas((atuais) => atuais.filter((x) => chaveDaCidade(x) !== chave));
  }

  function adicionarCidadeManual() {
    const cidade = cidadeManual.trim();
    const estado = ufManual.trim().toUpperCase();
    if (cidade.length < 2) {
      toast.error(t("Digite o nome da cidade."));
      return;
    }
    if (estado.length > 10) {
      toast.error(t("A UF deve ter no máximo 10 caracteres."));
      return;
    }
    const alvo: CidadeAlvo = { cidade, ...(estado ? { estado } : {}) };
    const chave = chaveDaCidade(alvo);
    if (cidadesSelecionadas.some((x) => chaveDaCidade(x) === chave)) {
      toast.error(t("Essa cidade já está selecionada."));
      return;
    }
    if (cidadesSelecionadas.length >= 50) {
      toast.error(t("Uma campanha pode ter no máximo 50 cidades."));
      return;
    }
    setCidadesSelecionadas((atuais) => [...atuais, alvo]);
    setCidadeManual("");
    setUfManual("");
  }

  function alternarCategoria(busca: string) {
    setCategoriasMarcadas((atuais) =>
      atuais.includes(busca) ? atuais.filter((b) => b !== busca) : [...atuais, busca],
    );
  }

  async function verPrevia() {
    if (fonte === "busca") {
      toast.error(t("A prévia da base não se aplica a uma campanha só de busca."));
      return;
    }
    if (cidadesSelecionadas.length === 0) {
      toast.error(t("Escolha ao menos uma cidade."));
      return;
    }
    if (categoriasMarcadas.length === 0) {
      toast.error(t("Escolha ao menos uma categoria."));
      return;
    }
    setCarregandoPrevia(true);
    try {
      const resposta = await apiClient.post<{ data?: PreviaResposta }>(
        "/api/v1/prospecting/campaigns/preview",
        {
          cidades: cidadesSelecionadas,
          categorias: categoriasMarcadas,
        },
      );
      const corpo = resposta?.data;
      if (!corpo) throw new Error(t("A prévia voltou vazia."));
      setPrevia(corpo);
      setPreviaChave(chaveSelecao);
    } catch (e) {
      showApiError(e);
    } finally {
      setCarregandoPrevia(false);
    }
  }

  function validarPublico(): boolean {
    if (nome.trim().length < 2 || nome.trim().length > 120) {
      toast.error(t("O nome da campanha precisa ter entre 2 e 120 caracteres."));
      return false;
    }
    if (cidadesSelecionadas.length === 0) {
      toast.error(t("Escolha ao menos uma cidade da lista."));
      return false;
    }
    if (categoriasMarcadas.length === 0) {
      toast.error(t("Escolha ao menos uma categoria."));
      return false;
    }
    if (fonte === "base" && (!previaValida || (previa?.total ?? 0) === 0)) {
      toast.error(t("Veja as empresas encontradas antes de continuar."));
      return false;
    }
    if (fonte === "ambas" && !previaValida) {
      toast.error(t("Veja as empresas encontradas antes de continuar."));
      return false;
    }
    return true;
  }

  function validarMensagens(): boolean {
    if (tipoMensagem === "template") {
      if (!modeloSelecionado) {
        toast.error(t("Escolha um modelo aprovado para a campanha."));
        return false;
      }
      const faltando = modeloSelecionado.slots.filter(
        (s) => !(valoresModelo[s.slotKey] ?? "").trim(),
      );
      if (faltando.length > 0) {
        toast.error(
          t(`Preencha os parâmetros: ${faltando.map((s) => `{{${s.key}}}`).join(", ")}.`),
        );
        return false;
      }
    } else if (preenchidas.length === 0) {
      toast.error(t("Escreva ao menos uma mensagem."));
      return false;
    } else if (preenchidas.some((m) => [...m].length > 4000)) {
      toast.error(t("Cada mensagem pode ter no máximo 4000 caracteres."));
      return false;
    }
    if (!periodoValido) {
      toast.error(t("A data final não pode ser anterior à inicial."));
      return false;
    }
    if (dias.length === 0) {
      toast.error(t("Escolha ao menos um dia da semana."));
      return false;
    }
    if (janelas.length === 0 || janelasValidas.length !== janelas.length) {
      toast.error(t("Confira as janelas de horário."));
      return false;
    }
    if (!Number.isFinite(limiteNumero) || limiteNumero < 1 || limiteNumero > 500) {
      toast.error(t("O limite diário precisa ficar entre 1 e 500."));
      return false;
    }
    if (recorrencia) {
      const valor = Number(recorrencia);
      if (!Number.isFinite(valor) || valor < 7 || valor > 365) {
        toast.error(t("A recorrência precisa ficar entre 7 e 365 dias."));
        return false;
      }
    }
    return true;
  }

  /**
   * Troca as caixas pelo padrão de uma categoria. Sobrescreve de propósito: o
   * operador escolheu o padrão agora, e o texto anterior já não é o que ele
   * quer. `null` = voltar a escrever do zero, sem apagar o que está na tela.
   */
  function aplicarPreset(preset: PresetDeMensagens | null) {
    if (!preset) {
      setPresetAplicado(null);
      return;
    }
    setMensagens(linhasDeMensagem(preset.mensagens));
    setTemplateId("__nenhum");
    setPresetAplicado(preset.categoria);
    toast.success(`${rotuloDaCategoria(preset.categoria)} · ${t("mensagens aplicadas.")}`);
  }

  function continuar() {
    if (passo === 0) {
      if (!validarPublico()) return;
      // Primeira entrada no passo 2: nasce com o padrão da categoria, se ele
      // existir. Só quando o operador ainda não escreveu nada — texto digitado
      // nunca é sobrescrito por padrão.
      if (preenchidas.length === 0 && presetAplicado === null) {
        const sugerido = presetSugerido(presets, categoriasMarcadas);
        if (sugerido) {
          setMensagens(linhasDeMensagem(sugerido.mensagens));
          setPresetAplicado(sugerido.categoria);
        }
      }
      setAlcancado((a) => Math.max(a, 1));
      setPasso(1);
      return;
    }
    if (passo === 1) {
      if (!validarMensagens()) return;
      setAlcancado((a) => Math.max(a, 2));
      setPasso(2);
    }
  }

  function voltar() {
    setPasso((p) => Math.max(0, p - 1));
  }

  function trocarMensagem(i: number, valor: string) {
    setMensagens((atuais) => atuais.map((m, j) => (j === i ? valor : m)));
    if (templateId !== "__nenhum") setTemplateId("__nenhum");
    setPresetAplicado(null);
  }

  function escolherModelo(id: string) {
    setTemplateId(id);
    setPresetAplicado(null);
    if (id === "__nenhum") return;
    const corpo = (templates.data ?? []).find((x) => x.id === id)?.body;
    if (corpo) {
      setMensagens((atuais) => atuais.map((m, j) => (j === 0 ? corpo : m)));
    }
  }

  function escolherModeloOficial(chave: string) {
    setModeloChave(chave);
    // Modelo novo, valores novos. Manter os valores do anterior preencheria o
    // slot 1 com o texto que era do slot 3 — e ninguém revisaria isso.
    setValoresModelo({});
  }

  function trocarValorDoModelo(slotKey: string, valor: string) {
    setValoresModelo((atuais) => ({ ...atuais, [slotKey]: valor }));
  }

  function trocarJanela(i: number, campo: "inicio" | "fim", valor: string) {
    setJanelas((atuais) => atuais.map((j, k) => (k === i ? { ...j, [campo]: valor } : j)));
  }

  async function criar() {
    if (!validarPublico()) {
      setPasso(0);
      return;
    }
    if (!validarMensagens()) {
      setPasso(1);
      return;
    }
    if (tipoMensagem === "template" && !modeloSelecionado) {
      setPasso(1);
      return;
    }
    setCriando(true);
    try {
      const criada = await apiClient.post<{ data?: { id?: string } }>(
        "/api/v1/prospecting/campaigns",
        {
          nome: nome.trim(),
          categorias: categoriasMarcadas,
          cidades: cidadesSelecionadas,
          fonte_publico: fonte,
          ...(tipoMensagem === "template" && modeloSelecionado
            ? {
                mensagem_tipo: "template",
                template_name: modeloSelecionado.name,
                template_language: modeloSelecionado.language,
                template_contract_hash: modeloSelecionado.contractHash,
                template_values: valoresModelo,
              }
            : {
                mensagem_tipo: "texto",
                mensagens: preenchidas,
              }),
          data_inicio: dataInicio,
          data_fim: dataFim,
          janelas: janelas.map((j) => ({ ...j, dias })),
          limite_diario: Math.min(500, Math.max(1, limiteNumero)),
          espaco_ms: 60_000,
          ...(recorrencia ? { recorrencia_dias: Number(recorrencia) } : {}),
        },
      );
      const id = criada?.data?.id;
      if (!id) throw new Error(t("A campanha foi criada sem id."));

      // A campanha de busca precisa do fan-out para produzir resultados. A
      // de base não: o controle calcula o público na hora e só reserva quando
      // o operador agenda. Nunca disparamos mensagem aqui.
      if (fonte !== "base") {
        try {
          const execucao = await apiClient.post<{
            data?: { buscas?: number; sem_mapa?: string[] };
          }>(`/api/v1/prospecting/campaigns/${id}/executar`, {});
          const buscas = execucao?.data?.buscas ?? 0;
          if (buscas > 0) toast.success(t(`${buscas} buscas criadas`));
          const semMapa = execucao?.data?.sem_mapa ?? [];
          if (semMapa.length > 0) toast.warning(t(`Sem mapa: ${semMapa.join(", ")}`));
        } catch (e) {
          showApiError(e);
          toast.warning(t("A campanha foi criada. Inicie a busca pela aba Pesquisas."));
        }
      }

      toast.success(t("Campanha criada. Agora confira o público e agende o envio."));
      aoConcluir(id);
    } catch (e) {
      showApiError(e);
    } finally {
      setCriando(false);
    }
  }

  const passosTraduzidos = PASSOS.map((p) => t(p));

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <NexusSteps
          steps={passosTraduzidos}
          current={passo}
          reached={alcancado}
          onGo={(i) => {
            // Só volta. Avançar pelo indicador pularia a validação que o
            // "Continuar" faz — e o 422 genérico já custou tempo demais.
            if (i < passo) setPasso(i);
          }}
        />

        {passo === 0 && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("De onde vem o público?")}</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <FonteCard
                    ativo={fonte === "base"}
                    titulo={t("Minha base")}
                    descricao={t("Recomendado: empresas já cadastradas, sem gastar busca.")}
                    onClick={() => setFonte("base")}
                  />
                  <FonteCard
                    ativo={fonte === "busca"}
                    titulo={t("Google")}
                    descricao={t("Busca empresas novas nas cidades escolhidas.")}
                    onClick={() => setFonte("busca")}
                  />
                  <FonteCard
                    ativo={fonte === "ambas"}
                    titulo={t("As duas")}
                    descricao={t("Usa a base e também busca empresas novas.")}
                    onClick={() => setFonte("ambas")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wiz-nome">{t("Nome da campanha")}</Label>
                <Input
                  id="wiz-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={120}
                  placeholder={t("Oficinas — Norte SC")}
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>{t("Cidades")}</Label>
                  {cidadesSelecionadas.length > 0 && (
                    <Badge variant="neutral">
                      {cidadesSelecionadas.length} {t("selecionadas")}
                    </Badge>
                  )}
                </div>
                {cidadesSelecionadas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cidadesSelecionadas.map((c) => (
                      <button
                        key={chaveDaCidade(c)}
                        type="button"
                        onClick={() => removerCidade(c)}
                        className="inline-flex items-center gap-1 rounded-full border bg-accent-soft px-2.5 py-1 text-xs text-accent"
                        title={t("Remover cidade")}
                      >
                        {rotuloDaCidade(c)}
                        <span aria-hidden>×</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="rounded-lg border">
                  <div className="border-b p-2">
                    <Input
                      value={buscaCidade}
                      onChange={(e) => setBuscaCidade(e.target.value)}
                      placeholder={t("Filtrar cidades da base…")}
                      aria-label={t("Filtrar cidades")}
                    />
                  </div>
                  {carregandoOpcoes ? (
                    <div className="space-y-2 p-3">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : erroOpcoes ? (
                    <div className="flex items-center justify-between gap-2 p-3 text-sm text-muted-foreground">
                      <span>{t("Não foi possível carregar as cidades.")}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void carregarOpcoes()}
                      >
                        {t("Tentar de novo")}
                      </Button>
                    </div>
                  ) : cidadesFiltradas.length === 0 ? (
                    <div className="space-y-2 p-3 text-sm text-muted-foreground">
                      <p>
                        {buscaCidade
                          ? t("Nenhuma cidade da base com esse nome.")
                          : t("Sua base ainda não tem cidades com empresas de WhatsApp.")}
                      </p>
                      <Button type="button" size="sm" variant="outline" asChild>
                        <Link href="/app/prospeccao?aba=buscar">{t("Buscar empresas novas")}</Link>
                      </Button>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto p-2">
                      <div className="grid gap-1 sm:grid-cols-2">
                        {cidadesFiltradas.map((c) => {
                          const alvo = {
                            cidade: c.cidade,
                            ...(c.estado ? { estado: c.estado } : {}),
                          };
                          const ativa = cidadesSelecionadas.some(
                            (x) => chaveDaCidade(x) === chaveDaCidade(alvo),
                          );
                          return (
                            <button
                              key={`${c.cidade}-${c.estado ?? ""}`}
                              type="button"
                              aria-pressed={ativa}
                              onClick={() => alternarCidade(c)}
                              className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-sm ${
                                ativa ? "border-primary bg-accent-soft" : "hover:bg-muted"
                              }`}
                            >
                              <span className="truncate">{rotuloDaCidade(alvo)}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {c.total}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {(fonte === "busca" || fonte === "ambas") && (
                  <details className="rounded-lg border p-3 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      {t("Não achou a cidade? Adicionar outra")}
                    </summary>
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="min-w-40 flex-1 space-y-1">
                        <Label htmlFor="wiz-cidade-manual">{t("Cidade")}</Label>
                        <Input
                          id="wiz-cidade-manual"
                          value={cidadeManual}
                          onChange={(e) => setCidadeManual(e.target.value)}
                          placeholder={t("Ex.: Canoinhas")}
                        />
                      </div>
                      <div className="w-20 space-y-1">
                        <Label htmlFor="wiz-uf-manual">{t("UF")}</Label>
                        <Input
                          id="wiz-uf-manual"
                          value={ufManual}
                          onChange={(e) => setUfManual(e.target.value)}
                          maxLength={10}
                          placeholder="SC"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={adicionarCidadeManual}
                      >
                        {t("Adicionar")}
                      </Button>
                    </div>
                  </details>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>{t("Categorias")}</Label>
                  {categoriasMarcadas.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => setCategoriasMarcadas([])}
                    >
                      {t("Limpar seleção")}
                    </button>
                  )}
                </div>
                {rotulosSelecionados.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {rotulosSelecionados.map((c) => (
                      <button
                        key={c.busca}
                        type="button"
                        onClick={() => alternarCategoria(c.busca)}
                        className="inline-flex items-center gap-1 rounded-full border bg-accent-soft px-2.5 py-1 text-xs text-accent"
                        title={t("Remover categoria")}
                      >
                        {c.rotulo}
                        <span aria-hidden>×</span>
                      </button>
                    ))}
                  </div>
                )}
                <Input
                  value={buscaCategoria}
                  onChange={(e) => setBuscaCategoria(e.target.value)}
                  placeholder={t("Filtrar categorias…")}
                  aria-label={t("Filtrar categorias")}
                />
                <div className="max-h-72 overflow-y-auto rounded-lg border p-2">
                  {gruposDeCategoria.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">
                      {t("Nenhuma categoria com esse nome.")}
                    </p>
                  ) : (
                    gruposDeCategoria.map((grupo) => (
                      <div key={grupo.macro} className="mb-3 last:mb-0">
                        <p className="mb-1 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                          {grupo.macro}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {grupo.subs.map((s) => {
                            const ativa = categoriasMarcadas.includes(s.busca);
                            return (
                              <button
                                key={`${grupo.macro}-${s.busca}`}
                                type="button"
                                aria-pressed={ativa}
                                onClick={() => alternarCategoria(s.busca)}
                                className={`rounded-full border px-2.5 py-1 text-xs ${
                                  ativa
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "hover:bg-muted"
                                }`}
                              >
                                {s.rotulo}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t("Empresas que vão receber")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("A prévia não reserva nem envia nada.")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void verPrevia()}
                    disabled={carregandoPrevia || fonte === "busca"}
                  >
                    {carregandoPrevia ? t("Verificando…") : t("Ver empresas")}
                  </Button>
                </div>

                {fonte === "busca" ? (
                  <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {t(
                      "A busca vai rodar no Google para as cidades escolhidas. A prévia da base não se aplica.",
                    )}
                  </div>
                ) : !previa ? (
                  <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    {t("Escolha cidades e categorias e clique em Ver empresas.")}
                  </div>
                ) : !previaValida ? (
                  <div className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg">
                    {t("A seleção mudou. Atualize a prévia para ver o público atual.")}
                  </div>
                ) : previa.total === 0 ? (
                  <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg">
                    <p className="font-medium">
                      {t("Nenhuma empresa encontrada com esse recorte.")}
                    </p>
                    <p>
                      {fonte === "ambas"
                        ? t(
                            "A base não tem empresas com esse recorte; a busca no Google ainda vai rodar.",
                          )
                        : t(
                            "Tente menos filtros, outras cidades, ou use a busca no Google para trazer empresas novas.",
                          )}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-2xl font-semibold tabular-nums">{previa.total}</p>
                      <Badge variant="success">{t("prontas para o disparo")}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{previa.resumo}</p>
                    <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                      {previa.linhas.slice(0, 30).map((linha) => (
                        <li key={linha.id} className="rounded-md border p-2 text-sm">
                          <p className="truncate font-medium">{linha.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[linha.cidade, linha.categoria, linha.telefone]
                              .filter(Boolean)
                              .join(" · ") || t("Sem detalhes")}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {previa.linhas.length > 30 && (
                      <p className="text-xs text-muted-foreground">
                        {t(`Mostrando 30 de ${previa.linhas.length}.`)}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {previa.ja_clientes.length > 0 && (
                        <span>
                          {previa.ja_clientes.length} {t("já clientes")}
                        </span>
                      )}
                      {previa.duplicadas > 0 && (
                        <span>
                          {previa.duplicadas} {t("duplicadas")}
                        </span>
                      )}
                      {previa.em_campanha > 0 && (
                        <span>
                          {previa.em_campanha} {t("em outra campanha")}
                        </span>
                      )}
                      {previa.categoria_a_revisar > 0 && (
                        <span>
                          {previa.categoria_a_revisar} {t("a revisar")}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void verPrevia()}
                      disabled={carregandoPrevia}
                    >
                      {t("Atualizar prévia")}
                    </Button>
                  </>
                )}
                {fonte === "ambas" && (
                  <p className="text-xs text-muted-foreground">
                    {t("Além da base, a campanha também vai buscar empresas novas no Google.")}
                  </p>
                )}
              </Card>
            </aside>
          </div>
        )}

        {passo === 1 && (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("Como a campanha fala")}</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    aria-pressed={tipoMensagem === "texto"}
                    onClick={() => setTipoMensagem("texto")}
                    className={`rounded-lg border p-3 text-left text-sm ${
                      tipoMensagem === "texto" ? "border-primary bg-accent-soft" : "hover:bg-muted"
                    }`}
                  >
                    <span className="block font-medium">{t("Texto livre")}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {podeTexto
                        ? t("Variações em rotação, pelo número conectado por QR.")
                        : t("Nenhum canal WORKING aceita texto livre agora.")}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={tipoMensagem === "template"}
                    onClick={() => setTipoMensagem("template")}
                    className={`rounded-lg border p-3 text-left text-sm ${
                      tipoMensagem === "template" ? "border-primary bg-accent-soft" : "hover:bg-muted"
                    }`}
                  >
                    <span className="block font-medium">{t("Modelo oficial")}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {podeTemplate
                        ? t("Modelo aprovado — único caminho fora da janela de 24h.")
                        : canais?.oficial_conectado
                          ? t("Número oficial conectado, mas nenhum canal WORKING aceita modelo.")
                          : t("Conecte um número oficial em Conexões para usar modelo.")}
                    </span>
                  </button>
                </div>
                {canaisErro && (
                  <p className="rounded-lg border border-warning/40 bg-warning-bg p-2 text-xs text-warning-fg">
                    {t(`Não foi possível ler os canais: ${canaisErro}`)}
                  </p>
                )}
                {!canais && !canaisErro && (
                  <p className="text-xs text-muted-foreground">{t("Lendo canais e modelos…")}</p>
                )}
              </div>

              {tipoMensagem === "texto" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>{t("Mensagens da campanha")}</Label>
                  <select
                    value={templateId}
                    onChange={(e) => escolherModelo(e.target.value)}
                    className="h-9 max-w-56 rounded-md border bg-background px-2 text-sm"
                    aria-label={t("Usar modelo de mensagem")}
                  >
                    <option value="__nenhum">{t("Usar modelo…")}</option>
                    {(templates.data ?? []).map((modelo) => (
                      <option key={modelo.id} value={modelo.id}>
                        {modelo.title}
                      </option>
                    ))}
                  </select>
                </div>
                {presetsErro && (
                  <p className="rounded-lg border border-warning/40 bg-warning-bg p-2 text-xs text-warning-fg">
                    {t(
                      "Não foi possível carregar as mensagens salvas por categoria. Escreva o texto abaixo — a campanha funciona igual.",
                    )}
                  </p>
                )}
                {presetsDisponiveis.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
                    <span className="text-xs font-medium">{t("Mensagens salvas")}</span>
                    <select
                      value={presetEmUso ?? "__nenhum"}
                      onChange={(e) => {
                        const escolhido =
                          presetsDisponiveis.find((p) => p.categoria === e.target.value) ?? null;
                        aplicarPreset(escolhido);
                      }}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                      aria-label={t("Usar as mensagens de uma categoria")}
                    >
                      <option value="__nenhum">{t("Escrever do zero")}</option>
                      {presetsDisponiveis.map((p) => (
                        <option key={p.categoria} value={p.categoria}>
                          {rotuloDaCategoria(p.categoria)} · {p.mensagens.length}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">
                      {presetEmUso
                        ? t("Editar aqui não altera o padrão salvo na categoria.")
                        : t("Trocar substitui as caixas abaixo.")}
                    </span>
                  </div>
                )}
                {presetsDisponiveis.length === 0 &&
                  categoriasMarcadas.length > 0 &&
                  !presetsErro && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "Nenhuma categoria escolhida tem mensagens salvas. Configure uma vez em Configuração › Mensagens por categoria.",
                      )}
                    </p>
                  )}
                <p className="text-xs text-muted-foreground">
                  {t("A primeira é obrigatória. As outras entram na rotação anti-ban.")}
                </p>
                {mensagens.map((m, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`wiz-msg-${i}`}>
                        {t(`Mensagem ${i + 1}`)}
                        {i === 0 ? ` · ${t("obrigatória")}` : ` · ${t("opcional")}`}
                      </Label>
                      {mensagens.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setMensagens((atuais) => atuais.filter((_, j) => j !== i))}
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
                      onChange={(e) => trocarMensagem(i, e.target.value)}
                      placeholder={
                        i === 0
                          ? t("Olá {{primeiro_nome}}! Aqui é da …")
                          : t("Outra forma de dizer a mesma coisa")
                      }
                    />
                  </div>
                ))}
                {mensagens.length < MENSAGENS_MAX && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMensagens((atuais) => [...atuais, ""])}
                  >
                    + {t("Variação")}
                  </Button>
                )}
              </div>
              ) : (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{t("Modelo aprovado")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "Só modelos APROVADOS aparecem aqui. O texto e os parâmetros vêm do espelho local, sincronizado com a Meta.",
                        )}
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link href="/app/connections">{t("Conexões")}</Link>
                    </Button>
                  </div>

                  <select
                    value={modeloChave}
                    onChange={(e) => escolherModeloOficial(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    aria-label={t("Escolher modelo oficial")}
                  >
                    <option value="">{t("Escolher um modelo…")}</option>
                    {modelos.map((modelo) => (
                      <option
                        key={chaveDoModelo(modelo)}
                        value={chaveDoModelo(modelo)}
                        disabled={!modelo.aceito}
                      >
                        {modelo.name} ({modelo.language})
                        {modelo.aceito ? "" : ` — ${modelo.motivo ?? modelo.status}`}
                      </option>
                    ))}
                  </select>

                  {modelos.length === 0 && (
                    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                      {canais?.oficial_conectado
                        ? t(
                            "Nenhum modelo aprovado no espelho. Sincronize os modelos em Conexões.",
                          )
                        : t(
                            "Nenhum modelo disponível. Conecte um número oficial em Conexões para criar e aprovar modelos.",
                          )}
                    </p>
                  )}

                  {modeloSelecionado && (
                    <>
                      {modeloSelecionado.previews.length > 0 && (
                        <div className="space-y-1 rounded-lg border bg-muted/20 p-3 text-sm">
                          {modeloSelecionado.previews.map((p) => (
                            <div key={`${p.onde}-${p.text}`}>
                              <p className="text-xs font-medium text-muted-foreground uppercase">
                                {p.onde}
                              </p>
                              <p className="whitespace-pre-wrap">{p.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "Cada campo aceita texto fixo ou as variáveis {{nome}}, {{primeiro_nome}}, {{cidade}} e {{categoria}} — trocadas por empresa no envio.",
                        )}
                      </p>
                      {modeloSelecionado.slots.map((slot) => (
                        <div key={slot.slotKey} className="space-y-1.5">
                          <Label htmlFor={`wiz-slot-${slot.slotKey}`}>
                            {slot.onde} · {t("parâmetro")} {slot.key}
                          </Label>
                          <Input
                            id={`wiz-slot-${slot.slotKey}`}
                            value={valoresModelo[slot.slotKey] ?? ""}
                            onChange={(e) => trocarValorDoModelo(slot.slotKey, e.target.value)}
                            placeholder={slot.contexto || t("Valor do parâmetro")}
                            maxLength={4000}
                          />
                        </div>
                      ))}
                      <div className="space-y-1 rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          {t("Prévia para uma empresa")}
                        </p>
                        <p className="whitespace-pre-wrap text-sm">
                          {previewModelo ||
                            t("Preencha os parâmetros para ver o texto que o cliente vai ler.")}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-semibold">{t("Agenda do envio")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-inicio">{t("Início")}</Label>
                    <Input
                      id="wiz-inicio"
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-fim">{t("Fim")}</Label>
                    <Input
                      id="wiz-fim"
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                    />
                  </div>
                </div>
                <DiasDaSemana dias={dias} onChange={setDias} idPrefixo="wiz-dias" />
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t("Janelas de horário")}</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setJanelas((atuais) => [...atuais, { inicio: "07:00", fim: "19:00" }])
                      }
                    >
                      + {t("Janela")}
                    </Button>
                  </div>
                  {janelas.map((j, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={j.inicio}
                        onChange={(e) => trocarJanela(i, "inicio", e.target.value)}
                        aria-label={t("Início da janela")}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={j.fim}
                        onChange={(e) => trocarJanela(i, "fim", e.target.value)}
                        aria-label={t("Fim da janela")}
                      />
                      {janelas.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={t("Remover janela")}
                          onClick={() => setJanelas((atuais) => atuais.filter((_, k) => k !== i))}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-limite">{t("Limite por dia")}</Label>
                    <Input
                      id="wiz-limite"
                      type="number"
                      min={1}
                      max={500}
                      value={limite}
                      onChange={(e) => setLimite(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz-recorrencia">{t("Repetir a cada (dias)")}</Label>
                    <Input
                      id="wiz-recorrencia"
                      type="number"
                      min={7}
                      max={365}
                      value={recorrencia}
                      onChange={(e) => setRecorrencia(e.target.value)}
                      placeholder={t("Opcional")}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("O envio é feito uma mensagem por minuto, dentro das janelas e do período.")}
                </p>
              </div>
            </div>

            <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <Card className="space-y-2 p-4">
                <p className="text-sm font-semibold">
                  {tipoMensagem === "template"
                    ? t("Prévia do modelo")
                    : t("Prévia da primeira mensagem")}
                </p>
                <div className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm">
                  {(tipoMensagem === "template" ? previewModelo : previewMensagem) ||
                    (tipoMensagem === "template"
                      ? t("Escolha um modelo e preencha os parâmetros.")
                      : t("A prévia aparece quando você escrever a primeira mensagem."))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {tipoMensagem === "template"
                    ? t("As variáveis são trocadas por empresa no envio.")
                    : t("A variável {{primeiro_nome}} é trocada pelo primeiro nome do contato.")}
                </p>
              </Card>
              <Card className="space-y-2 p-4 text-sm">
                <p className="font-semibold">{t("Resumo da agenda")}</p>
                <p className="text-muted-foreground">
                  {tipoMensagem === "template"
                    ? t(
                        `Modelo ${modeloSelecionado?.name ?? "—"} (${modeloSelecionado?.language ?? "—"})`,
                      )
                    : t(`${preenchidas.length} mensagens em rotação`)}
                </p>
                <p className="text-muted-foreground">
                  {dataInicio && dataFim ? t(`de ${dataInicio} a ${dataFim}`) : t("Período aberto")}
                </p>
                <p className="text-muted-foreground">
                  {t(resumoDosDias(dias))} ·{" "}
                  {janelas.map((j) => `${j.inicio}–${j.fim}`).join(" · ")}
                </p>
                <p className="text-muted-foreground">{t(`até ${limiteNumero} por dia`)}</p>
              </Card>
            </aside>
          </div>
        )}

        {passo === 2 && (
          <div className="space-y-4">
            <Card className="space-y-3 p-4">
              <p className="text-sm font-semibold">{t("Revise antes de criar")}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Nome")}</dt>
                  <dd className="font-medium">{nome.trim()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Fonte do público")}</dt>
                  <dd className="font-medium">
                    {fonte === "base"
                      ? t("Minha base")
                      : fonte === "busca"
                        ? t("Busca no Google")
                        : t("Base + busca")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Cidades")}</dt>
                  <dd>{cidadesSelecionadas.map(rotuloDaCidade).join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Categorias")}</dt>
                  <dd>{rotulosSelecionados.map((c) => c.rotulo).join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Público na prévia")}</dt>
                  <dd>
                    {fonte === "busca"
                      ? t("Definido pela busca")
                      : previa
                        ? `${previa.total} ${t("empresas")}`
                        : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Mensagens")}</dt>
                  <dd>
                    {tipoMensagem === "template"
                      ? `${modeloSelecionado?.name ?? "—"} (${modeloSelecionado?.language ?? "—"})`
                      : t(`${preenchidas.length} em rotação`)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Período")}</dt>
                  <dd>
                    {dataInicio && dataFim ? `${dataInicio} → ${dataFim}` : t("Período aberto")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Dias e horários")}</dt>
                  <dd>
                    {t(resumoDosDias(dias))} ·{" "}
                    {janelas.map((j) => `${j.inicio}–${j.fim}`).join(" · ")}
                  </dd>
                </div>
              </dl>
            </Card>
            <Card className="border-info/40 bg-info-bg p-4 text-sm text-info-fg">
              <p className="font-medium">{t("Criar não envia mensagem.")}</p>
              <p className="mt-1 opacity-90">
                {t(
                  "Na próxima tela você confere as empresas e escolhe entre enviar agora ou agendar. A lista de empresas só é reservada quando você agenda.",
                )}
              </p>
            </Card>
          </div>
        )}
      </Card>

      <div className="sticky bottom-0 z-20 -mx-6 border-t border-border bg-background px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pr-20 md:pr-24">
          <Button type="button" variant="ghost" onClick={voltar} disabled={passo === 0 || criando}>
            {t("Voltar")}
          </Button>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {t(`Passo ${passo + 1} de ${PASSOS.length}`)}
            </span>
            {passo < 2 ? (
              <Button type="button" onClick={continuar} disabled={criando}>
                {t("Continuar")}
              </Button>
            ) : (
              <Button type="button" onClick={() => void criar()} disabled={criando}>
                {criando ? t("Criando…") : t("Criar campanha")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FonteCard({
  ativo,
  titulo,
  descricao,
  onClick,
}: {
  ativo: boolean;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`rounded-lg border p-3 text-left text-sm ${
        ativo ? "border-primary bg-accent-soft" : "hover:bg-muted"
      }`}
    >
      <p className="font-medium">{titulo}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
    </button>
  );
}
