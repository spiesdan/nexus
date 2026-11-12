"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import type { ItemDoPedido, PedidoComercial, StatusDoPedido } from "@/lib/schemas/pedidos";

import { PillDoStatus } from "../_pills";
import { FotosDoProduto } from "../../products/_fotos";
import { EditorDeItens } from "./_editar-itens";

export interface ContatoDoPedido {
  id: string;
  nome: string;
  documento: string | null;
  fone: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  /** Endereço em linha para sugerir como entrega (só sugere, nunca impõe). */
  endereco: string | null;
}

/** Avanço permitido direto da ficha (mesma ordem da lista). */
const PROXIMO_STATUS: Partial<Record<StatusDoPedido, StatusDoPedido>> = {
  rascunho: "aprovado",
  em_analise: "aprovado",
  aprovado: "faturado",
  concluido: "expedido",
  faturado: "expedido",
  expedido: "entregue",
};

const ROTULO_ACAO_AVANCAR: Partial<Record<StatusDoPedido, string>> = {
  rascunho: "Aprovar pedido",
  em_analise: "Aprovar pedido",
  aprovado: "Faturar pedido",
  concluido: "Expedir pedido",
  faturado: "Expedir pedido",
  expedido: "Marcar entregue",
};

/** 0297: como cada campo da revisão do Mercos aparece para quem lê a ficha. */
const ROTULO_DA_MUDANCA: Record<string, string> = {
  cliente_nome: "Cliente",
  cliente_documento: "Documento",
  condicao_pagamento: "Condição de pagamento",
  frete_cents: "Frete",
  subtotal_cents: "Subtotal",
  total_cents: "Total",
  itens: "Quantidade total",
  cidade: "Cidade/UF",
};

/** Campos que a revisão devolve em centavos — sem isto, "66237" na tela. */
const MUDANCA_EM_DINHEIRO = new Set(["frete_cents", "subtotal_cents", "total_cents"]);

interface ExecucaoMercosNaTela {
  id: string;
  status: "queued" | "running" | "success" | "partial" | "error";
  summary: Record<string, unknown> | null;
}

interface RevisaoDoPedido {
  numero: number;
  status: string;
  motivo?: string | null;
  mudancas?: unknown[];
}

/**
 * O resultado da revisão para ESTE pedido, lido do `summary` da execução.
 *
 * A execução pode revisar vários números (janela recente) ou nenhum (quando
 * outra já estava rodando). Sem este recorte, o toast diria "sincronizado"
 * mesmo quando o pedido aberto não foi tocado.
 */
function revisaoDoPedido(summary: Record<string, unknown> | null | undefined, numero: number) {
  const lista = summary?.revisao;
  if (!Array.isArray(lista)) return null;
  return (
    (lista as RevisaoDoPedido[]).find((r) => Number(r?.numero) === numero) ?? null
  );
}

/**
 * Acompanha a execução enfileirada até ela sair de `queued`/`running`.
 *
 * O scrape abre um navegador de verdade e pode levar minutos. A tela espera
 * por ~3 minutos e então devolve o controle: um spinner infinito é pior que
 * um aviso honesto de "ainda está rodando", porque o worker termina sozinho e
 * o dado aparece no próximo carregamento.
 */
async function esperarExecucaoDoMercos(id: string): Promise<ExecucaoMercosNaTela | null> {  for (let tentativa = 0; tentativa < 90; tentativa += 1) {
    const corpo = await apiClient.get<{ data: { execucao: ExecucaoMercosNaTela | null } }>(
      `/api/v1/commercial-orders/importar-mercos?id=${encodeURIComponent(id)}`,
    );
    const execucao = corpo.data.execucao;
    if (execucao && execucao.status !== "queued" && execucao.status !== "running") {
      return execucao;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

/** Um valor da revisão como a ficha mostra: dinheiro formatado, resto literal. */
function valorDaMudanca(
  campo: string,
  valor: string | number | null,
  moeda: string,
): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (MUDANCA_EM_DINHEIRO.has(campo)) return comoMoeda(Number(valor), moeda);
  return String(valor);
}


/**
 * Seção FINANCEIRO da ficha do pedido — recebíveis gerados, com ação de
 * gerar e atalho para a central. O vínculo NF aparece quando existir.
 */
function FinanceiroDoPedido({ pedidoId, status }: { pedidoId: string; status: string }) {
  const t = useT();
  const [linhas, setLinhas] = React.useState<{ id: string; parcela_n: number; total_parcelas: number; valor_original_cents: number; vencimento: string; situacao: string; saldo_cents: number }[] | null>(null);
  const [gerando, setGerando] = React.useState(false);

  const recarregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: NonNullable<typeof linhas> }>(
        `/api/v1/financeiro/recebiveis?pedido_id=${pedidoId}&limit=100`,
      );
      setLinhas(corpo.data ?? []);
    } catch {
      setLinhas([]);
    }
    // O `status` viaja nas dependências de propósito: o "Faturar pedido" gera
    // os recebíveis DENTRO do PATCH, e sem este refetch o card continuava
    // dizendo "Sem financeiro gerado" até um F5 — medido pela jornada e2e.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- status é o GATILHO do refetch, não um dado lido aqui
  }, [pedidoId, status]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  async function gerar() {
    setGerando(true);
    try {
      await apiClient.post("/api/v1/financeiro/gerar", { order_id: pedidoId });
      toast.success(t("Financeiro gerado"));
      await recarregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setGerando(false);
    }
  }

  return (
    <Card className="hover-raise space-y-2 p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">{t("FINANCEIRO")}</p>
      {linhas === null ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : linhas.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{t("Sem financeiro gerado para este pedido.")}</p>
          <Button size="sm" variant="outline" onClick={() => void gerar()} disabled={gerando}>
            {gerando ? t("Gerando…") : t("Gerar financeiro")}
          </Button>
        </div>
      ) : (
        <ul className="space-y-1 text-sm">
          {linhas.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums">
                {l.parcela_n}/{l.total_parcelas} · {comoMoeda(l.valor_original_cents, "BRL")}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(`${l.vencimento}T12:00:00Z`).toLocaleDateString()} · {l.situacao}
              </span>
              <span className="ml-auto">
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/app/financeiro">{t("Ver financeiro")}</Link>
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Seção FISCAL da ficha do pedido — notas vinculadas, com emitir, XML e
 * DANFE. Pedido sem NF não é erro: a seção mostra o vazio com a ação.
 */
function FiscalDoPedido({ pedidoId }: { pedidoId: string }) {
  const t = useT();
  const [notas, setNotas] = React.useState<
    { id: string; numero: number | null; serie: string; status: string; chave_acesso: string | null; erro: string | null }[] | null
  >(null);
  const [emitindo, setEmitindo] = React.useState(false);

  const recarregar = React.useCallback(async () => {
    try {
      const corpo = await apiClient.get<{ data: NonNullable<typeof notas> }>(
        `/api/v1/invoices?order_id=${pedidoId}`,
      );
      setNotas(corpo.data ?? []);
    } catch {
      setNotas([]);
    }
  }, [pedidoId]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  async function emitir() {
    setEmitindo(true);
    try {
      await apiClient.post("/api/v1/invoices", { order_id: pedidoId });
      toast.success(t("Nota enfileirada para emissão"));
      await recarregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setEmitindo(false);
    }
  }

  return (
    <Card className="hover-raise space-y-2 p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground">{t("FISCAL")}</p>
      {notas === null ? (
        <p className="text-xs text-muted-foreground">…</p>
      ) : notas.length === 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">{t("Pedido sem nota fiscal.")}</p>
          <Button size="sm" variant="outline" onClick={() => void emitir()} disabled={emitindo}>
            {emitindo ? t("Enviando…") : t("Emitir NF-e")}
          </Button>
        </div>
      ) : (
        <ul className="space-y-1 text-sm">
          {notas.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium tabular-nums">
                {n.numero === null ? t("Sem número") : `${n.numero}/${n.serie}`}
              </span>
              <span className="text-xs text-muted-foreground">{n.status}</span>
              {n.erro && <span className="text-xs text-error-fg">{n.erro}</span>}
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" asChild>
                  <a href={`/api/v1/invoices/${n.id}/xml`} target="_blank" rel="noopener noreferrer">
                    XML
                  </a>
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href={`/api/v1/invoices/${n.id}/danfe`} target="_blank" rel="noopener noreferrer">
                    DANFE
                  </a>
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LinhaDetalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-36 shrink-0 text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium">{valor || "—"}</dd>
    </div>
  );
}


/**
 * O número da seção, como no Mercos (1 CLIENTE · 2 REPRESENTADA · 3 PRODUTOS ·
 * 4 DETALHES DO PEDIDO). É âncora de leitura, não passo de formulário: a ficha
 * é uma página só.
 */
function TituloDaSecao({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] text-foreground">
        {numero}
      </span>
      {children}
    </p>
  );
}

export function DetalheDoPedido({
  pedido: inicial,
  itens,
  contato,
  nomeVendedor,
  nomeOrganizacao,
  representada,
  podeEditar,
  podeExcluir,
  podeSincronizarMercos,
}: {
  pedido: PedidoComercial;
  itens: ItemDoPedido[];
  contato: ContatoDoPedido | null;
  nomeVendedor: string | null;
  nomeOrganizacao: string;
  /** Razão social, CNPJ e telefone do emitente — o bloco 2 do Mercos. */
  representada?: {
    razaoSocial?: string | null;
    cnpj?: string | null;
    telefone?: string | null;
  };
  podeEditar: boolean;
  podeExcluir: boolean;
  /** 0297: manager+ — a rota do "Atualizar do Mercos" pede esse nível. */
  podeSincronizarMercos: boolean;
}) {
  const tagIdioma = useTagDeIdioma();
  const t = useT();
  const confirmar = useConfirmar();
  const router = useRouter();
  const [pedido, setPedido] = React.useState(inicial);
  /**
   * OS ITENS QUE A TELA MOSTRA.
   *
   * Eram só prop do Server Component — e por isso a ficha mentia: quando o
   * Mercos reescrevia os itens (0297), `recarregar()` trazia o pedido novo
   * (total, aviso) e a tabela continuava exibindo os produtos ANTIGOS. A nota
   * fiscal sai dos `commercial_order_items` do banco; o que a ficha mostra
   * tem que ser exatamente isso, senão quem confere antes de emitir aprova
   * uma lista que não é a que vai para a SEFAZ.
   */
  const [itensDoPedido, setItensDoPedido] = React.useState(itens);
  const [editando, setEditando] = React.useState(false);
  // Modo SEPARADO do de cima, de propósito: um "Salvar" que grava condição de
  // pagamento e itens ao mesmo tempo mistura dois PATCH de naturezas diferentes —
  // e o de itens é DELETE + INSERT + recálculo, que só faz sentido atômico.
  const [editandoItens, setEditandoItens] = React.useState(false);
  const [condicao, setCondicao] = React.useState(inicial.condicao_pagamento ?? "");
  const [endereco, setEndereco] = React.useState(inicial.endereco_entrega ?? "");
  const [transportadora, setTransportadora] = React.useState(inicial.transportadora_nome ?? "");
  // 0276 — os dois campos do bloco 4 que não existiam.
  const [rastreamento, setRastreamento] = React.useState(inicial.rastreamento ?? "");
  const [contatoNoCliente, setContatoNoCliente] = React.useState(
    inicial.contato_no_cliente ?? "",
  );
  const [obs, setObs] = React.useState(inicial.observacoes ?? "");
  const [timeline, setTimeline] = React.useState<{ acao: string; por: string; em: string }[] | null>(null);
  const [trocando, setTrocando] = React.useState(false);
  const [buscaCliente, setBuscaCliente] = React.useState("");
  const [candidatos, setCandidatos] = React.useState<{ id: string; display_name: string | null; name: string | null }[]>([]);
  // O link de aprovação do orçamento. Fica na tela depois de gerado porque é o
  // que o operador precisa: copiar e colar na conversa que já está aberta. Com o
  // WhatsApp da conexão fora do ar, é o ÚNICO caminho que funciona.
  const [linkDoOrcamento, setLinkDoOrcamento] = React.useState<string | null>(null);
  // O telefone em E.164 que a rota devolve — é o que faz o `wa.me` abrir a
  // conversa com o cliente certo (sem DDI, o link disca para outro país).
  const [telefoneDoCliente, setTelefoneDoCliente] = React.useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = React.useState(false);
  // 0297: uma revisão do Mercos em andamento (o scrape leva minutos).
  const [sincronizandoMercos, setSincronizandoMercos] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: { acao: string; por: string; em: string }[] }>(`/api/v1/commercial-orders/${inicial.id}/timeline`)
      .then((l) => {
        if (vivo) setTimeline(l.data ?? []);
      })
      .catch(() => {
        if (vivo) setTimeline([]);
      });
    return () => {
      vivo = false;
    };
  }, [inicial.id]);

  /**
   * O prop do servidor ainda é a fonte quando ele muda DE VERDADE (primeira
   * renderização e o `router.refresh()` depois de salvar). A assinatura existe
   * porque o array é uma referência nova a cada render: sem ela, o efeito
   * rodaria sempre e desfaria o que o `recarregar()` acabou de aplicar.
   */
  const assinaturaDosItens = itens
    .map((i) => `${i.id}:${i.quantidade}:${i.preco_unit_cents}:${i.desconto_pct}`)
    .join("|");
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- sincroniza com o prop quando o conteúdo muda; a assinatura é a dependência real
    setItensDoPedido(itens);
  }, [assinaturaDosItens]);

  async function recarregar(): Promise<PedidoComercial | null> {
    try {
      const corpo = await apiClient.get<{ data: PedidoComercial & { itens: ItemDoPedido[] } }>(
        `/api/v1/commercial-orders/${inicial.id}`,
      );
      setPedido(corpo.data);
      // Os itens vêm na MESMA resposta (a rota devolve o pedido com `itens`).
      // Sem aplicar aqui, o total mudava e a lista de produtos não — que é
      // exatamente o "puxa os produtos antigos" da ficha do pedido.
      if (corpo.data.itens) setItensDoPedido(corpo.data.itens);
      return corpo.data;
    } catch (e) {
      showApiError(e);
      return null;
    }
  }

  /**
   * "Atualizar do Mercos" — o pedido que o vendedor externo mudou no ERP.
   *
   * A rota só ENFILEIRA (o Chromium e a credencial vivem no worker `mercos`);
   * a tela acompanha a execução até o fim e então recarrega a ficha. O toast
   * diz o que ACONTECEU com ESTE pedido, lido do `summary.revisao` — não um
   * "sincronizado" genérico que esconderia um bloqueio por nota emitida.
   */
  async function atualizarDoMercos() {
    setSincronizandoMercos(true);
    try {
      const enfileirado = await apiClient.post<{
        data: { execucao: { id: string }; jaEstavaRodando: boolean };
      }>(`/api/v1/commercial-orders/${pedido.id}/mercos`, {});

      const execucaoId = enfileirado.data.execucao.id;
      if (enfileirado.data.jaEstavaRodando) {
        toast.info(t("Já havia uma sincronização rodando. Aviso assim que ela terminar."));
      }

      const execucao = await esperarExecucaoDoMercos(execucaoId);
      if (!execucao) {
        toast.info(t("A sincronização ainda está rodando. Confira de novo em alguns minutos."));
        return;
      }

      const revisao = revisaoDoPedido(execucao.summary, pedido.numero);
      await recarregar();
      router.refresh();

      if (revisao?.status === "atualizado") {
        toast.success(t("Pedido atualizado com os dados do Mercos."));
      } else if (revisao?.status === "sem_mudanca") {
        toast.info(t("O Mercos não tem nada diferente deste pedido."));
      } else if (revisao?.status === "bloqueado") {
        toast.error(
          revisao.motivo === "nota_emitida"
            ? t("Este pedido já tem nota emitida — o Mercos não pode reescrever os itens.")
            : t("Pedido encerrado não aceita atualização do Mercos."),
        );
      } else if (execucao.status === "error" || execucao.status === "partial") {
        toast.error(t("A sincronização do Mercos terminou com erro. Veja o histórico da importação."));
      } else {
        toast.info(t("A sincronização terminou sem revisar este pedido. Tente de novo em instantes."));
      }
    } catch (e) {
      showApiError(e);
    } finally {
      setSincronizandoMercos(false);
    }
  }

  async function avancar() {
    const proximo = PROXIMO_STATUS[pedido.status as StatusDoPedido];
    if (!proximo) return;
    try {
      await apiClient.patch(`/api/v1/commercial-orders/${pedido.id}`, { status: proximo });
      toast.success("Status atualizado");
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  async function duplicar() {
    try {
      const corpo = await apiClient.post<{ data: { numero: number } | null }>(
        `/api/v1/commercial-orders/${pedido.id}/duplicar`,
        {},
      );
      const novo = corpo?.data;
      if (!novo) throw new Error(t("O servidor não devolveu o pedido duplicado."));
      toast.success(t(`Duplicado como ${numeroDoPedido(novo.numero)}`));
    } catch (e) {
      showApiError(e);
    }
  }

  async function excluir() {
    const ok = await confirmar({
      title: t("Excluir este pedido? Estoque baixado volta. Com NF ou em carga, é barrado com aviso."),
      confirmLabel: t("Excluir"),
    });
    if (!ok) {
      return;
    }
    try {
      await apiClient.delete(`/api/v1/commercial-orders/${pedido.id}`);
      toast.success(t("Pedido excluído."));
      router.push("/app/pedidos");
    } catch (e) {
      showApiError(e);
    }
  }

  async function salvarDetalhes() {
    try {
      await apiClient.patch(`/api/v1/commercial-orders/${pedido.id}`, {
        condicao_pagamento: condicao.trim() || null,
        endereco_entrega: endereco.trim() || null,
        transportadora_nome: transportadora.trim() || null,
        rastreamento: rastreamento.trim() || null,
        contato_no_cliente: contatoNoCliente.trim() || null,
        observacoes: obs.trim() || null,
      });
      toast.success("Detalhes salvos");
      setEditando(false);
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  async function buscarClientes(termo: string) {
    setBuscaCliente(termo);
    if (termo.trim().length < 2) {
      setCandidatos([]);
      return;
    }
    try {
      const qs = new URLSearchParams({ search: termo.trim(), limit: "6" });
      const corpo = await apiClient.get<{ data: { id: string; display_name: string | null; name: string | null }[] }>(
        `/api/v1/contacts?${qs}`,
      );
      setCandidatos(corpo.data ?? []);
    } catch (e) {
      showApiError(e);
    }
  }

  async function trocarCliente(contactId: string) {
    try {
      await apiClient.patch(`/api/v1/commercial-orders/${pedido.id}`, { contact_id: contactId });
      toast.success("Cliente trocado");
      setTrocando(false);
      setBuscaCliente("");
      setCandidatos([]);
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  async function copiarLink() {
    const url = window.location.href;
    const ok = await copyToClipboard(url);
    if (ok) {
      toast.success(t("Link copiado"));
    } else {
      toast.error(t("Não foi possível copiar"));
    }
  }

  /**
   * Gera o link de aprovação e tenta mandar no WhatsApp do cliente.
   *
   * O toast diz o que ACONTECEU, não o que era para ter acontecido: com a
   * conexão fora do ar (ou cliente sem telefone) o link continua válido na tela
   * para o operador colar à mão — e a mensagem do aviso diz qual dos dois foi.
   */
  async function gerarLinkDoOrcamento() {
    setGerandoLink(true);
    try {
      const corpo = await apiClient.post<{
        data: { url: string; enviado: boolean; motivo: string | null; telefone: string | null };
      }>(`/api/v1/commercial-orders/${pedido.id}/orcamento`, { enviar: true });
      setLinkDoOrcamento(corpo.data.url);
      setTelefoneDoCliente(corpo.data.telefone);

      if (corpo.data.enviado) {
        toast.success(t("Orçamento enviado no WhatsApp do cliente"));
      } else if (corpo.data.motivo === "sem_sessao") {
        toast.info(t("Link gerado. Sem WhatsApp conectado — copie e envie pelo seu aparelho."));
      } else if (corpo.data.motivo === "sem_telefone") {
        toast.info(t("Link gerado. O cliente não tem telefone no cadastro — copie e envie."));
      } else if (corpo.data.motivo === "sem_cliente") {
        toast.info(t("Link gerado. O pedido não tem cliente vinculado — copie e envie."));
      } else {
        toast.error(t("Não foi possível enviar agora. O link continua válido abaixo."));
      }
    } catch (e) {
      showApiError(e);
    } finally {
      setGerandoLink(false);
    }
  }

  async function copiarLinkDoOrcamento() {
    if (!linkDoOrcamento) return;
    const ok = await copyToClipboard(linkDoOrcamento);
    if (ok) {
      toast.success(t("Link copiado"));
    } else {
      toast.error(t("Não foi possível copiar"));
    }
  }

  const resumoWhats = `${numeroDoPedido(pedido.numero)} — ${pedido.cliente_nome} — ${comoMoeda(pedido.total_cents, pedido.moeda)}`;
  // O texto que acompanha o link quando o operador manda pelo próprio aparelho.
  const mensagemDoOrcamento = linkDoOrcamento
    ? `${numeroDoPedido(pedido.numero)} — ${pedido.cliente_nome}\nTotal: ${comoMoeda(pedido.total_cents, pedido.moeda)}\nAprove por aqui: ${linkDoOrcamento}`
    : "";
  const qtdTotal = itensDoPedido.reduce((a, i) => a + i.quantidade, 0);
  const proximo = PROXIMO_STATUS[pedido.status as StatusDoPedido];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      {/* Cabeçalho canônico: número no título, ações no slot (molde de
          compras/[id]). A pill do status fica numa linha própria logo abaixo —
          mesmo arranjo do Mercos (número + pill), sem Card de chroma. */}
      <NexusPageHeader
        title={numeroDoPedido(pedido.numero)}
        navigation={
          <Link href="/app/pedidos" className="underline underline-offset-4 hover:text-text">
            {t("← Pedidos")}
          </Link>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {podeEditar && proximo && (
              <Button size="sm" onClick={() => void avancar()}>
                {t(ROTULO_ACAO_AVANCAR[pedido.status as StatusDoPedido] ?? "Avançar")}
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href={`/api/v1/commercial-orders/${pedido.id}/pdf`} target="_blank" rel="noopener noreferrer">
                {t("Visualizar")}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(resumoWhats)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("Enviar por WhatsApp")}
              </a>
            </Button>
            {podeEditar && (pedido.status === "rascunho" || pedido.status === "em_analise") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void gerarLinkDoOrcamento()}
                disabled={gerandoLink}
              >
                {gerandoLink ? t("Gerando link…") : t("Orçamento com aprovação")}
              </Button>
            )}
            {contato?.email && (
              <Button size="sm" variant="outline" asChild>
                <a href={`mailto:${contato.email}?subject=${encodeURIComponent(resumoWhats)}`}>{t("Enviar por e-mail")}</a>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={copiarLink}>
              {t("Copiar link do pedido no Portal")}
            </Button>
            {/* O "Mais opções" do Mercos: o que se usa de vez em quando sai da
                frente das ações do dia a dia (faturar, visualizar, enviar). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  {t("Mais opções")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/app/pedidos/imprimir?ids=${pedido.id}`}>
                    {t("Imprimir pedido")}
                  </Link>
                </DropdownMenuItem>
                {/* 0297: pedido importado do Mercos que mudou LÁ depois de já
                    estar aqui. A sincronização automática cobre a janela
                    recente; este item existe para o caso pontual e para o
                    pedido antigo, que o corte por número nunca revisita. */}
                {pedido.origem === "mercos" &&
                  podeSincronizarMercos &&
                  pedido.status !== "entregue" &&
                  pedido.status !== "cancelado" && (
                    <DropdownMenuItem
                      disabled={sincronizandoMercos}
                      onSelect={() => void atualizarDoMercos()}
                    >
                      {sincronizandoMercos
                        ? t("Atualizando do Mercos…")
                        : t("Atualizar do Mercos")}
                    </DropdownMenuItem>
                  )}
                {podeEditar && (
                  <DropdownMenuItem onSelect={() => void duplicar()}>
                    {t("Duplicar")}
                  </DropdownMenuItem>
                )}
                {podeExcluir && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onSelect={() => void excluir()}>
                      {t("Excluir pedido")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <PillDoStatus status={pedido.status as StatusDoPedido} />
      </div>

      {/* 0297: o pedido mudou no Mercos DEPOIS de já estar aqui. O aviso é o
          que faz alguém conferir a carga antes de sair: "cliente X→Y, 3→4
          itens" não é curiosidade, é romaneio errado esperando acontecer. */}
      {pedido.origem === "mercos" && pedido.mercos_ultima_mudanca && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">
              {t("Este pedido mudou no Mercos em")}{" "}
              {new Date(pedido.mercos_ultima_mudanca.em).toLocaleString(tagIdioma)}
            </p>
            {pedido.mercos_sincronizado_em && (
              <p className="text-xs text-muted-foreground">
                {t("Revisado em")}{" "}
                {new Date(pedido.mercos_sincronizado_em).toLocaleString(tagIdioma)}
              </p>
            )}
          </div>
          <ul className="mt-2 space-y-1">
            {pedido.mercos_ultima_mudanca.campos.map((m, i) => (
              <li key={`${m.campo}-${i}`} className="text-xs">
                <span className="font-medium">{t(ROTULO_DA_MUDANCA[m.campo] ?? m.campo)}</span>
                {": "}
                {valorDaMudanca(m.campo, m.de, pedido.moeda)}
                {" → "}
                <span className="font-medium">
                  {valorDaMudanca(m.campo, m.para, pedido.moeda)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Se este pedido já estava numa carga, a expedição foi marcada para reconferir — nada saiu da carga sozinho.",
            )}
          </p>
        </div>
      )}

      {/* O LINK DE APROVAÇÃO fica na tela depois de gerado: com o WhatsApp da
          conexão fora do ar, copiar e colar na conversa é o caminho que
          funciona — e é o que o operador faz de verdade. */}
      {linkDoOrcamento && (
        <div className="rounded-xl border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{t("Link de aprovação do orçamento")}</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{linkDoOrcamento}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copiarLinkDoOrcamento()}>
              {t("Copiar link")}
            </Button>
            {telefoneDoCliente && (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={`https://wa.me/${telefoneDoCliente.replace(/\D/g, "")}?text=${encodeURIComponent(mensagemDoOrcamento)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("Abrir conversa do cliente")}
                </a>
              </Button>
            )}
            <Button size="sm" variant="ghost" asChild>
              <a href={linkDoOrcamento} target="_blank" rel="noopener noreferrer">
                {t("Ver como o cliente vê")}
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* CLIENTE */}
      <Card className="hover-raise space-y-2 p-4">
        <TituloDaSecao numero={1}>{t("CLIENTE")}</TituloDaSecao>
        <p className="font-medium">
          {contato ? (
            <Link href={`/app/contacts/${contato.id}`} className="underline underline-offset-4">
              {pedido.cliente_nome}
            </Link>
          ) : (
            pedido.cliente_nome
          )}
          {pedido.cliente_documento && (
            <span className="text-muted-foreground"> — {pedido.cliente_documento}</span>
          )}
        </p>
        {contato?.fone && <p className="text-sm">{contato.fone}</p>}
        {contato?.email && <p className="text-sm">{contato.email}</p>}
        {(contato?.cidade || contato?.uf) && (
          <p className="text-sm text-muted-foreground">
            {[contato.cidade, contato.uf].filter(Boolean).join(", ")}
          </p>
        )}
        {podeEditar &&
          (trocando ? (
            <div className="space-y-2 pt-1">
              <Input
                value={buscaCliente}
                onChange={(e) => void buscarClientes(e.target.value)}
                placeholder={t("Buscar cliente por nome, telefone ou documento…")}
              />
              {candidatos.length > 0 && (
                <ul className="divide-y rounded-2xl border">
                  {candidatos.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => void trocarCliente(c.id)}
                      >
                        {c.display_name ?? c.name ?? "—"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button size="sm" variant="outline" onClick={() => setTrocando(false)}>
                {t("Cancelar")}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setTrocando(true)}>
              {t("Trocar cliente")}
            </Button>
          ))}
      </Card>

      {/* ORGANIZAÇÃO (a "representada" do Mercos). */}
      {nomeOrganizacao && (
        <Card className="hover-raise space-y-1 p-4">
          <TituloDaSecao numero={2}>{t("REPRESENTADA")}</TituloDaSecao>
          <p className="text-sm">
            <span className="font-medium text-accent">{nomeOrganizacao}</span>
            {(() => {
              const linha = [representada?.razaoSocial, representada?.cnpj]
                .filter((v): v is string => Boolean(v && v.trim()))
                .join(" - ");
              return linha ? <span className="text-muted-foreground"> - {linha}</span> : null;
            })()}
          </p>
          {representada?.telefone && (
            <p className="text-sm text-muted-foreground">{representada.telefone}</p>
          )}
        </Card>
      )}

      {/* PRODUTOS */}
      <Card className="hover-raise p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <TituloDaSecao numero={3}>{t("PRODUTOS")}</TituloDaSecao>
          {/* O botão fica aqui, e não no cabeçalho, porque é o que ele
              funciona: a lista de itens. Colocá-lo longe da tabela faria o
              usuário procurar onde mexer nos produtos de um pedido que já está
              pronto — que é exatamente a dúvida que ele tem. */}
          {podeEditar && !editandoItens && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditandoItens(true)}>
              {t("Adicionar produto ao pedido")}
            </Button>
          )}
        </div>
        {itensDoPedido.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Sem itens.")}</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{t("Foto")}</TableHead>
                  <TableHead>{t("Código")}</TableHead>
                  <TableHead>{t("Descrição")}</TableHead>
                  <TableHead className="text-right">{t("Qtde.")}</TableHead>
                  <TableHead className="text-right">{t("Preço Tab.")}</TableHead>
                  <TableHead className="text-right">{t("Desc. Acrés.")}</TableHead>
                  <TableHead className="text-right">{t("Preço Líq.")}</TableHead>
                  <TableHead className="text-right">{t("Subtotal")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensDoPedido.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      {it.product_id ? (
                        <FotosDoProduto productId={it.product_id} podeEditar={false} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{it.produto_codigo || "—"}</TableCell>
                    <TableCell className="font-medium">{it.produto_nome}</TableCell>
                    <TableCell className="text-right tabular-nums">{it.quantidade}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(it.preco_unit_cents, pedido.moeda)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(it.desconto_pct) > 0 ? `${Number(it.desconto_pct)} %` : "—"}
                    </TableCell>
                    {/* Preço Líq. é o unitário JÁ descontado; Subtotal é ele ×
                        quantidade. Sem a coluna, o desconto só aparecia no
                        total, e conferir "quanto ficou a unidade" exigia conta. */}
                    <TableCell className="text-right tabular-nums">
                      {comoMoeda(
                        Math.round(it.preco_unit_cents * (1 - Number(it.desconto_pct) / 100)),
                        pedido.moeda,
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {comoMoeda(it.subtotal_cents, pedido.moeda)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-6 border-t pt-3 text-sm">
          <p>
            <span className="text-muted-foreground">{t("Itens no pedido")}: </span>
            <strong>{itensDoPedido.length}</strong>
          </p>
          <p>
            <span className="text-muted-foreground">{t("Quantidade total")}: </span>
            <strong>{qtdTotal}</strong>
          </p>
          <p className="ml-auto text-base">
            <span className="text-muted-foreground">{t("Valor total")}: </span>
            <strong className="tabular-nums">{comoMoeda(pedido.total_cents, pedido.moeda)}</strong>
          </p>
        </div>
      </Card>

      {editandoItens && podeEditar && (
        <EditorDeItens
          pedido={pedido}
          itens={itensDoPedido}
          aoCancelar={() => setEditandoItens(false)}
          aoSalvar={async () => {
            await recarregar();
            // `recarregar()` já aplica o pedido E os itens na tela; o
            // `refresh` continua aqui pelo que só o servidor sabe (contato,
            // vendedor, fotos). A tabela não depende mais dele.
            router.refresh();
            setEditandoItens(false);
          }}
        />
      )}

      {/* DETALHES DO PEDIDO */}
      <Card className="hover-raise space-y-4 p-4">
        <TituloDaSecao numero={4}>{t("DETALHES DO PEDIDO")}</TituloDaSecao>
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <LinhaDetalhe rotulo={t("Nº do pedido")} valor={numeroDoPedido(pedido.numero)} />
          <LinhaDetalhe
            rotulo={t("Data da emissão")}
            valor={new Date(pedido.created_at).toLocaleDateString(tagIdioma)}
          />
          <LinhaDetalhe rotulo={t("Vendedor")} valor={nomeVendedor ?? (pedido.vendedor_user_id ?? "").slice(0, 8) ?? "—"} />
          <LinhaDetalhe rotulo={t("Cond. de pagamento")} valor={pedido.condicao_pagamento ?? ""} />
          {/* O pedido importado do Mercos não traz endereço próprio: o destino
              É o endereço principal do cliente. A ficha mostrava vazio e
              parecia pedido sem endereço, embora o papel e a carga já
              mostrassem o do cadastro. Mesma precedência dos outros lugares:
              escrito no pedido vence, cadastro cobre a ausência. */}
          <LinhaDetalhe
            rotulo={t("End. de entrega")}
            valor={pedido.endereco_entrega?.trim() || contato?.endereco || ""}
          />
          <LinhaDetalhe rotulo={t("Transportadora")} valor={pedido.transportadora_nome ?? ""} />
          <LinhaDetalhe
            rotulo={t("Valor do frete")}
            valor={pedido.frete_cents > 0 ? comoMoeda(pedido.frete_cents, pedido.moeda) : ""}
          />
          <LinhaDetalhe rotulo={t("Rastreamento")} valor={pedido.rastreamento ?? ""} />
          <LinhaDetalhe
            rotulo={t("Contato no cliente")}
            valor={pedido.contato_no_cliente ?? ""}
          />
          <LinhaDetalhe rotulo={t("Origem")} valor={pedido.origem} />
          <LinhaDetalhe
            rotulo={t("Atualizado em")}
            valor={new Date(pedido.updated_at).toLocaleDateString(tagIdioma)}
          />
          {pedido.origem === "mercos" && (
            <LinhaDetalhe
              rotulo={t("Revisado no Mercos")}
              valor={
                pedido.mercos_sincronizado_em
                  ? new Date(pedido.mercos_sincronizado_em).toLocaleString(tagIdioma)
                  : ""
              }
            />
          )}
          {pedido.origem === "mercos" && pedido.mercos_observacoes && (
            // Texto do ERP, só leitura. Não confundir com "Informações
            // adicionais" do CRM, editável logo abaixo e que vai para a nota.
            <LinhaDetalhe
              rotulo={t("Observações do Mercos")}
              valor={pedido.mercos_observacoes}
            />
          )}
        </dl>
        {(pedido.observacoes || pedido.obs_interna) && (
          <div className="space-y-1 text-sm">
            {pedido.observacoes && (
              <p>
                <span className="text-muted-foreground">{t("Informações adicionais")}: </span>
                {pedido.observacoes}
              </p>
            )}
            {pedido.obs_interna && (
              <p>
                <span className="text-muted-foreground">{t("Interna")}: </span>
                {pedido.obs_interna}
              </p>
            )}
          </div>
        )}
        {podeEditar &&
          (editando ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder={t("Condição de pagamento")} />
              <Input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} placeholder={t("Transportadora")} />
              <Input
                value={rastreamento}
                onChange={(e) => setRastreamento(e.target.value)}
                placeholder={t("Rastreamento")}
              />
              <Input
                value={contatoNoCliente}
                onChange={(e) => setContatoNoCliente(e.target.value)}
                placeholder={t("Contato no cliente")}
              />
              <Input
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder={t("Endereço de entrega")}
                className="sm:col-span-2"
              />
              {!endereco.trim() && contato?.endereco && (
                <div className="sm:col-span-2">
                  <Button size="sm" variant="outline" onClick={() => setEndereco(contato.endereco ?? "")}>
                    {t("Usar endereço do cliente")}
                  </Button>
                </div>
              )}
              <Input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder={t("Informações adicionais")}
                className="sm:col-span-2"
              />
              <div className="flex gap-2 sm:col-span-2">
                <Button size="sm" onClick={() => void salvarDetalhes()}>
                  {t("Salvar")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditando(false)}>
                  {t("Cancelar")}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
              {t("Alterar detalhes do pedido")}
            </Button>
          ))}
      </Card>

      {/* FINANCEIRO */}
      <FinanceiroDoPedido pedidoId={pedido.id} status={pedido.status} />

      {/* FISCAL */}
      <FiscalDoPedido pedidoId={pedido.id} />

      {/* HISTÓRICO */}
      <Card className="hover-raise p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">{t("HISTÓRICO")}</p>
        {timeline === null ? (
          <p className="text-xs text-muted-foreground">…</p>
        ) : timeline.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {timeline.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-medium">{l.acao}</span>
                <span className="text-muted-foreground">
                  {l.por} · {new Date(l.em).toLocaleString(tagIdioma)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
