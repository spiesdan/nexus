"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useConfirmar } from "@/components/nexus-ui/forms/ConfirmacaoProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";
import {
  MOTIVOS_DEVOLUCAO,
  numeroDaCarga,
  ROTULO_DA_CARGA,
  ROTULO_MOTIVO_DEVOLUCAO,
  ROTULO_NA_CARGA,
  type MotivoDevolucao,
  type PedidoNaCarga,
  type StatusDaCarga,
  type StatusNaCarga,
} from "@/lib/schemas/expedicao";
import { chaveDoDia } from "@/lib/tempo/dia";
import {
  ArrowRight,
  CaretDown,
  CaretLeft,
  CheckCircle,
  FileText,
  MapPin,
  Receipt,
  Trash,
  Truck,
  UploadSimple,
  Warning,
  X,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { FechamentoCarga } from "./_fechamento";
import { ModoMotorista } from "./_motorista";
import { Roteirizador } from "./_roteirizador";

interface Textos {
  voltar: string;
  /** Rótulo curto da subtela — o título longo vive dentro dela. */
  rota: string;
  romaneio: string;
  totalMercadorias: string;
  aCobrar: string;
  paradasConcluidas: string;
  sairRota: string;
  concluir: string;
  entregue: string;
  devolvido: string;
  semEndereco: string;
  verComprovante: string;
  escolherFoto: string;
  excluirCarga: string;
  confirmarExcluir: string;
  tirarDaCarga: string;
  modoMotorista: string;
  cheguei: string;
  motivo: string;
  confirmar: string;
  cancelar: string;
}

interface Detalhe {
  carga: {
    id: string;
    numero: number;
    placa: string | null;
    veiculo_tipo: string | null;
    motorista_nome: string | null;
    status: StatusDaCarga;
    created_at?: string;
  };
  itens: (PedidoNaCarga & { tem_comprovante: boolean; pago_cents: number })[];
}

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>["variant"]>;

const VARIANTE_NA_CARGA: Record<StatusNaCarga, BadgeVariant> = {
  na_carga: "neutral",
  em_rota: "info",
  em_atendimento: "warning",
  entregue: "success",
  devolvido: "error",
};

const VARIANTE_DA_CARGA: Record<StatusDaCarga, BadgeVariant> = {
  montando: "warning",
  em_rota: "info",
  concluida: "success",
  cancelada: "error",
};

/** `2026-10-26` → `26/10/2026`; string torta → `—`. */
function dataCurta(iso: string | undefined): string {
  if (!iso) return "—";
  const chave = chaveDoDia(new Date(iso));
  if (!chave) return "—";
  return `${chave.slice(8, 10)}/${chave.slice(5, 7)}/${chave.slice(0, 4)}`;
}

function linkDoMapa(endereco: string | null): string | null {
  if (!endereco) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}

/**
 * A FICHA DA CARGA — quatro telas, um cabeçalho.
 *
 * Empilhar paradas, rota e fechamento na mesma página deixava as três
 * espremidas; esconder atrás de abas deixava duas invisíveis. A saída é a do
 * trabalho real: cada tarefa tem ENDEREÇO PRÓPRIO (`/paradas`, `/rota`,
 * `/fechamento`, `/motorista`) e o cabeçalho — número, status, veículo e as
 * ações de ciclo — acompanha todas.
 *
 *   - paradas: a faixa de instrumentos e o próximo passo em uma frase; as
 *     paradas são um acordeão, uma em foco por vez, com "Entregue" ali dentro;
 *   - rota: mapa e ordem de entrega, sem a lista de paradas em volta;
 *   - fechamento: a conferência do caixa, sozinha na folha;
 *   - motorista: a cabine, imersiva, porque lá o operador não é o usuário.
 *
 * Links antigos (`?aba=rota`, `?aba=fechamento`, `?aba=motorista`) são
 * redirecionados no servidor; `#rota` e `#fechamento` caem aqui e são
 * redirecionados no cliente, antes de a pessoa rolar uma tela que não existe.
 */
export function CargaClient({
  cargaId,
  secao,
  podeOperar,
  podeExcluir,
  podeFechar,
  textos,
}: {
  cargaId: string;
  /** Qual das quatro telas da carga esta rota renderiza. */
  secao: "paradas" | "rota" | "fechamento" | "motorista";
  podeOperar: boolean;
  podeExcluir: boolean;
  /** Fechar caixa é mexer em dinheiro: o mesmo nível do PUT, `manager`+. */
  podeFechar: boolean;
  textos: Textos;
}) {
  const t = useT();
  const confirmar = useConfirmar();
  const router = useRouter();
  const [detalhe, setDetalhe] = React.useState<Detalhe | null>(null);
  const [falhou, setFalhou] = React.useState(false);
  const [motivoPara, setMotivoPara] = React.useState<string | null>(null);
  const [motivo, setMotivo] = React.useState<MotivoDevolucao>("cliente_ausente");

  /** `null` = foco automático na próxima pendente; `""` = todas fechadas. */
  const [abertaId, setAbertaId] = React.useState<string | null>(null);
  const [concluidasAbertas, setConcluidasAbertas] = React.useState(false);

  const recarregar = React.useCallback(async () => {
    setFalhou(false);
    try {
      const corpo = await apiClient.get<{ data: Detalhe }>(`/api/v1/shipments/${cargaId}`);
      const d = corpo?.data;
      if (d && Array.isArray(d.itens)) {
        setDetalhe({ ...d, itens: d.itens });
      } else {
        setDetalhe(null);
        setFalhou(true);
        showApiError(new Error(t("Resposta inesperada do servidor.")));
      }
    } catch (e) {
      setFalhou(true);
      showApiError(e);
    }
  }, [cargaId, t]);

  // Carregar o detalhe ao montar é sincronização com o servidor (fetch),
  // não estado derivado — o caso de uso que a regra manda para useEffect.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  // Hash antigo (`/expedicao/<id>#rota`): não há seção para rolar, então o
  // link vira navegação para a subtela. O `replace` evita deixar o hash morto
  // no histórico.
  React.useEffect(() => {
    if (secao !== "paradas") return;
    const alvo = window.location.hash.replace("#", "");
    if (alvo === "rota" || alvo === "fechamento") {
      router.replace(`/app/expedicao/${cargaId}/${alvo}`);
    }
  }, [secao, cargaId, router]);

  async function mudarStatus(status: string) {
    // Sair/concluir passam pela rota (carimba início/fim); o resto, direto.
    const rota = status === "em_rota" ? "iniciar" : status === "concluida" ? "finalizar" : null;
    try {
      if (rota) await apiClient.post(`/api/v1/shipments/${cargaId}/rota/${rota}`, {});
      else await apiClient.patch(`/api/v1/shipments/${cargaId}`, { status });
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  async function desfecho(
    orderId: string,
    status: "em_atendimento" | "entregue" | "devolvido",
    motivoDev?: MotivoDevolucao,
  ) {
    try {
      // Na entrega, carimba onde o aparelho está (best-effort: sem GPS, vale igual).
      let geo: { latitude?: number; longitude?: number } = {};
      if (status === "entregue" && "geolocation" in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((ok, falha) =>
            navigator.geolocation.getCurrentPosition(ok, falha, { timeout: 8000 }),
          );
          geo = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch {
          // Sem GPS, a entrega vale igual — só sem coordenada.
        }
      }
      await apiClient.patch(`/api/v1/shipments/${cargaId}/orders/${orderId}`, {
        status,
        ...(status === "devolvido" ? { motivo: motivoDev ?? motivo } : {}),
        ...geo,
      });
      setMotivoPara(null);
      // Parada com desfecho sai do foco: o próximo passo passa a ser a próxima.
      if (status !== "em_atendimento") setAbertaId(null);
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  async function tirarDaCarga(orderId: string) {
    try {
      await apiClient.delete(`/api/v1/shipments/${cargaId}/orders/${orderId}`);
      toast.success(t("Pedido de volta na fila de embarque."));
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  // Separação e conferência (0240): marca por item, só com a carga montando.
  async function separar(orderId: string, marcar: boolean) {
    try {
      await apiClient.patch(`/api/v1/shipments/${cargaId}/orders/${orderId}`, {
        separado: marcar,
      });
      await recarregar();
    } catch (e) {
      showApiError(e);
    }
  }

  async function excluirCarga() {
    const ok = await confirmar({
      title: textos.confirmarExcluir,
      confirmLabel: textos.confirmar,
      cancelLabel: textos.cancelar,
    });
    if (!ok) return;
    try {
      const res = await apiClient.delete<{ data: { id: string; pedidos_devolvidos?: number } }>(
        `/api/v1/shipments/${cargaId}`,
      );
      const devolvidos = res?.data?.pedidos_devolvidos ?? 0;
      // O texto do confirm diz que os pedidos voltam; dizer QUANTOS voltaram é
      // o que prova que voltaram.
      toast.success(
        devolvidos > 0
          ? `${devolvidos} ${
              devolvidos === 1
                ? t("pedido de volta na fila de embarque.")
                : t("pedidos de volta na fila de embarque.")
            }`
          : t("Romaneio excluído."),
      );
      router.push("/app/expedicao");
    } catch (e) {
      showApiError(e);
    }
  }

  async function anexarFoto(orderId: string, arquivo: File | undefined) {
    if (!arquivo) {
      toast.error(t("Escolha a foto primeiro."));
      return;
    }
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch(`/api/v1/shipments/${cargaId}/orders/${orderId}/proof`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        toast.error(corpo?.error?.message ?? t("Não consegui enviar a foto."));
        return;
      }
      toast.success(t("Comprovante anexado"));
      await recarregar();
    } catch {
      toast.error(t("Não consegui enviar a foto."));
    }
  }

  function focarParada(id: string) {
    setAbertaId(id);
    document.getElementById(`parada-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (!detalhe) {
    return (
      <div className="space-y-3 p-6">
        {falhou ? (
          <NexusErrorState
            description={t("Não foi possível carregar esta carga.")}
            onRetry={() => void recarregar()}
          />
        ) : (
          <>
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        )}
      </div>
    );
  }

  const { carga, itens } = detalhe;
  // em_atendimento é pendência: chegou ≠ entregue.
  const pendentes = itens.filter((i) =>
    ["na_carga", "em_rota", "em_atendimento"].includes(i.status),
  );
  const concluidas = itens.filter((i) => ["entregue", "devolvido"].includes(i.status));
  // Conferência §49: quantos itens na carga ainda não foram separados.
  const naoSeparados = itens.filter((i) => i.status === "na_carga" && i.separado_em == null);
  const separados = itens.filter((i) => i.separado_em != null);
  const totalMercadorias = itens.reduce((s, i) => s + (i.pedido.total_cents || 0), 0);
  const totalPago = itens.reduce((s, i) => s + (i.pago_cents || 0), 0);
  const aCobrar = itens
    .filter((i) => i.status !== "devolvido")
    .reduce((s, i) => s + Math.max(0, (i.pedido.total_cents || 0) - (i.pago_cents || 0)), 0);
  const proxima = pendentes[0] ?? null;
  const proximaNaoSeparada = naoSeparados[0] ?? null;
  const mostrarConcluidas = concluidasAbertas || (pendentes.length === 0 && concluidas.length > 0);

  const veiculoETripulacao = [carga.placa, carga.veiculo_tipo, carga.motorista_nome]
    .filter(Boolean)
    .join(" · ");
  // O e2e contrata "Montando · ABC1D23": status e placa no MESMO texto, e só
  // aqui. Repetir esta linha em outro bloco criaria dois matches do getByText.
  const linhaDaCarga = [ROTULO_DA_CARGA[carga.status] ?? carga.status, veiculoETripulacao]
    .filter(Boolean)
    .join(" · ");
  const aberta = abertaId === "" ? null : (abertaId ?? proxima?.id ?? null);
  const pctConcluido = itens.length > 0 ? Math.round((concluidas.length / itens.length) * 100) : 0;

  const passo = (() => {
    if (carga.status === "cancelada") {
      return {
        tom: "neutro" as const,
        titulo: t("Carga cancelada"),
        detalhe: t("Os pedidos voltaram para a fila de embarque."),
        acao: null,
      };
    }
    if (carga.status === "concluida") {
      return {
        tom: "sucesso" as const,
        titulo: t("Carga concluída"),
        detalhe:
          concluidas.length === 1
            ? t("1 parada com desfecho. O romaneio e o fechamento ficam registrados.")
            : `${concluidas.length} ${t("paradas com desfecho. O romaneio e o fechamento ficam registrados.")}`,
        acao: null,
      };
    }
    if (carga.status === "em_rota") {
      if (pendentes.length === 0) {
        return {
          tom: "sucesso" as const,
          titulo: t("Pronta para concluir"),
          detalhe: t("Todas as paradas têm desfecho. Falta fechar a carga."),
          acao: podeOperar ? (
            <Button className="w-full" size="sm" onClick={() => void mudarStatus("concluida")}>
              {t("Fechar a carga")}
            </Button>
          ) : null,
        };
      }
      return {
        tom: "info" as const,
        titulo:
          pendentes.length === 1
            ? t("1 parada em aberto")
            : `${pendentes.length} ${t("paradas em aberto")}`,
        detalhe: proxima
          ? `${t("Próxima")}: ${proxima.pedido.cliente_nome}. ${t("A carga só conclui com todas entregues ou devolvidas.")}`
          : t("A carga só conclui com todas entregues ou devolvidas."),
        acao: podeOperar ? (
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={() => proxima && focarParada(proxima.id)}
          >
            {t("Abrir próxima parada")}
          </Button>
        ) : null,
      };
    }
    // montando
    if (itens.length === 0) {
      return {
        tom: "aviso" as const,
        titulo: t("Carga sem pedidos"),
        detalhe: t("Inclua pedidos para liberar a saída desta carga."),
        acao: null,
      };
    }
    if (naoSeparados.length > 0) {
      return {
        tom: "aviso" as const,
        // O número no TÍTULO, não só no detalhe: é a régua que trava a saída
        // e o texto que a operação procura na tela.
        titulo:
          naoSeparados.length === 1
            ? t("Faltam separar 1 pedido")
            : `${naoSeparados.length} ${t("pedidos faltam separar")}`,
        detalhe: t("A rota só sai com tudo conferido."),
        acao: (
          <Button
            className="w-full"
            size="sm"
            variant="outline"
            onClick={() => proximaNaoSeparada && focarParada(proximaNaoSeparada.id)}
          >
            {t("Abrir para conferir")}
          </Button>
        ),
      };
    }
    return {
      tom: "sucesso" as const,
      titulo: t("Pronta para sair"),
      detalhe: t("Tudo conferido. A rota pode começar."),
      acao: podeOperar ? (
        <Button className="w-full" size="sm" onClick={() => void mudarStatus("em_rota")}>
          {t("Iniciar rota")}
        </Button>
      ) : null,
    };
  })();

  if (secao === "motorista") {
    return (
      <div className="-mx-6 -mt-6 min-h-full">
        <div className="border-b border-border bg-surface px-4 py-2.5 sm:px-6">
          <div className="mx-auto max-w-2xl">
            <Link
              href={`/app/expedicao/${cargaId}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-text"
            >
              <CaretLeft className="h-3.5 w-3.5" aria-hidden />
              {t("Painel da carga")}
            </Link>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2">
              <p className="text-sm font-medium text-text">{numeroDaCarga(carga.numero)}</p>
              <p className="min-w-0 truncate text-[11px] text-muted-foreground">{linhaDaCarga}</p>
            </div>
          </div>
        </div>
        <div className="px-4 py-4 sm:px-6">
          <ModoMotorista cargaId={cargaId} podeOperar={podeOperar} aoMudar={() => void recarregar()} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho fixo: na ficha longa, número e ações acompanham a rolagem
        em vez de sumirem para cima.
        A ficha NÃO declara padding próprio: quem inseta é o `main` do AppShell
        (`p-6`, `pb-24` no mobile). Antes havia um `p-6` aqui também e a tela
        perdia 48px de largura dos dois lados — o suficiente para a tabela do
        fechamento não caber.
        `sticky -top-6` (NÃO `top-14`): o scroll é do `main` (AppShell), e a
        TopBar é irmã dele, fora da área rolável — então `top-14` flutuava o
        banner 80px abaixo do topo visível, por cima da lista (medido em
        14/10/2026). O `-top-6` compensa o `p-6` do `main` e encosta o banner
        flush logo abaixo da TopBar; `-mx-6 -mt-6` levam o banner de ponta a
        ponta da área rolável. Fundo SÓLIDO (`bg-background`, sem /95):
        translúcido deixava as linhas da lista vazarem por trás ao rolar. */}
      <div className="sticky -top-6 z-10 -mx-6 -mt-6 border-b bg-background">
        <div className="px-4 pt-3 pb-2 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/app/expedicao"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-text"
            >
              <CaretLeft className="h-3.5 w-3.5" aria-hidden />
              {textos.voltar}
            </Link>
            <p className="text-xs text-text-subtle">
              {t("Criada em")} {dataCurta(carga.created_at)}
            </p>
          </div>

          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-medium tracking-tight text-text">
                  {numeroDaCarga(carga.numero)}
                </h1>
                <Badge variant={VARIANTE_DA_CARGA[carga.status] ?? "neutral"}>
                  {ROTULO_DA_CARGA[carga.status] ?? carga.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{linhaDaCarga}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {podeOperar && carga.status === "montando" && (
                <Button
                  size="sm"
                  onClick={() => void mudarStatus("em_rota")}
                  disabled={naoSeparados.length > 0}
                  title={
                    naoSeparados.length > 0
                      ? `${naoSeparados.length} ${
                          naoSeparados.length === 1
                            ? t("pedido ainda não separado")
                            : t("pedidos ainda não separados")
                        }`
                      : undefined
                  }
                >
                  {textos.sairRota}
                </Button>
              )}
              {podeOperar && carga.status === "em_rota" && (
                <Button
                  size="sm"
                  onClick={() => void mudarStatus("concluida")}
                  disabled={pendentes.length > 0}
                  title={
                    pendentes.length > 0
                      ? `${pendentes.length} ${
                          pendentes.length === 1
                            ? t("parada ainda sem desfecho")
                            : t("paradas ainda sem desfecho")
                        }`
                      : undefined
                  }
                >
                  {textos.concluir}
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/api/v1/shipments/${carga.id}/romaneio`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  {textos.romaneio}
                </Link>
              </Button>
              {podeExcluir && (carga.status === "montando" || carga.status === "em_rota") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-error-fg hover:bg-error-bg hover:text-error-fg"
                  onClick={() => void excluirCarga()}
                  aria-label={textos.excluirCarga}
                  title={textos.excluirCarga}
                >
                  <Trash size={15} aria-hidden />
                  <span className="hidden sm:inline">{textos.excluirCarga}</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Cada tarefa tem endereço: o clique NAVEGA, não rola. A aba ativa
            é marcada por `aria-current`, que também é o que o leitor de tela
            anuncia — cor sozinha não diz onde a pessoa está. */}
        <nav
          aria-label={t("Seções da carga")}
          className="flex items-center gap-0.5 overflow-x-auto border-t border-border px-3 sm:px-5"
        >
          {(
            [
              ["paradas", t("Paradas"), itens.length],
              ["rota", textos.rota, null],
              ["fechamento", t("Fechamento"), null],
            ] as const
          ).map(([chave, rotulo, contagem]) => {
            const ativa = secao === chave;
            return (
              <Link
                key={chave}
                href={`/app/expedicao/${cargaId}${chave === "paradas" ? "" : `/${chave}`}`}
                aria-current={ativa ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex shrink-0 items-center border-b-2 px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm",
                  ativa
                    ? "border-accent text-text"
                    : "border-transparent text-muted-foreground hover:border-accent/40 hover:text-text",
                )}
              >
                {rotulo}
                {contagem != null && (
                  <span className="ml-1.5 text-[11px] text-text-subtle tabular-nums">
                    {contagem}
                  </span>
                )}
              </Link>
            );
          })}
          <Link
            href={`/app/expedicao/${cargaId}/motorista`}
            aria-label={textos.modoMotorista}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            <Truck size={14} aria-hidden />
            {/* No celular o rótulo sai: com ele a barra passava da largura e
                "Motorista" aparecia cortado em "M". O nome acessível continua
                inteiro pelo aria-label. */}
            <span className="hidden sm:inline">{textos.modoMotorista}</span>
            <ArrowRight size={12} aria-hidden />
          </Link>
        </nav>
      </div>

      {secao === "paradas" && (
        <>
      {/* O que a carga significa em trabalho e em dinheiro — uma faixa de
          instrumentos, não quatro cartões iguais. */}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-xs sm:grid-cols-4">
        <div className="border-r border-b border-border px-3.5 py-3 sm:border-b-0">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {textos.paradasConcluidas}
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-text tabular-nums whitespace-nowrap sm:text-2xl">
              {concluidas.length}/{itens.length}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {pendentes.length}{" "}
              {pendentes.length === 1 ? t("em aberto") : t("em aberto")}
            </span>
          </div>
          <span
            aria-hidden
            className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span className="h-full bg-success" style={{ width: `${pctConcluido}%` }} />
          </span>
        </div>

        <div className="border-b border-border px-3.5 py-3 sm:border-r sm:border-b-0">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t("A separar")}
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span
              className={cn(
                "text-lg font-semibold tabular-nums whitespace-nowrap sm:text-2xl",
                naoSeparados.length > 0 ? "text-warning-fg" : "text-text",
              )}
            >
              {naoSeparados.length}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {separados.length} de {itens.length} {t("conferidos")}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-text-subtle">
            {naoSeparados.length > 0
              ? t("a rota só sai com tudo conferido")
              : t("tudo conferido")}
          </p>
        </div>

        <div className="border-r border-border px-3.5 py-3">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {textos.aCobrar}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-text tabular-nums whitespace-nowrap sm:text-2xl">
            {comoMoeda(aCobrar, "BRL")}
          </p>
          <p className="mt-2 text-[11px] text-text-subtle">
            {totalPago > 0 ? `${t("já recebido")} ${comoMoeda(totalPago, "BRL")}` : t("nada recebido ainda")}
          </p>
        </div>

        <div className="px-3.5 py-3">
          <p className="min-h-7 text-[10px] leading-tight font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {textos.totalMercadorias}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-text tabular-nums whitespace-nowrap sm:text-2xl">
            {comoMoeda(totalMercadorias, "BRL")}
          </p>
          <p className="mt-2 text-[11px] text-text-subtle">
            {itens.length} {itens.length === 1 ? t("pedido embarcado") : t("pedidos embarcados")}
          </p>
        </div>
      </div>
        </>
      )}

      {secao === "paradas" && (
        <div className="min-w-0 space-y-3">
          {/* O próximo passo em uma faixa, não em um cartão ao lado: é a
              primeira frase que a operação precisa ler, e não um painel. */}
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5",
              passo.tom === "aviso" && "border-warning/40 bg-warning-bg",
              passo.tom === "sucesso" && "border-success/40 bg-success-bg",
              passo.tom === "info" && "border-info/40 bg-info-bg",
              passo.tom === "neutro" && "border-border bg-surface",
            )}
          >
            {passo.tom === "sucesso" ? (
              <CheckCircle size={16} className="shrink-0 text-success-fg" aria-hidden />
            ) : passo.tom === "aviso" ? (
              <Warning size={16} className="shrink-0 text-warning-fg" aria-hidden />
            ) : passo.tom === "info" ? (
              <MapPin size={16} className="shrink-0 text-info-fg" aria-hidden />
            ) : (
              <Receipt size={16} className="shrink-0 text-muted-foreground" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {t("Próximo passo")}
              </p>
              <p className="text-sm font-semibold text-text">{passo.titulo}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{passo.detalhe}</p>
            </div>
            {passo.acao && <div className="w-full shrink-0 sm:w-auto">{passo.acao}</div>}
          </div>

        {/* ── O trabalho: paradas, rota e caixa ───────────────────────────── */}
          <section id="paradas" className="scroll-mt-44 space-y-3" aria-labelledby="titulo-paradas">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="titulo-paradas" className="text-base font-medium text-text">
                  {t("Paradas")}{" "}
                  <span className="text-sm font-normal text-muted-foreground tabular-nums">
                    ({itens.length})
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("Cheguei marca a presença; Entregue dá baixa na parada.")}
                </p>
              </div>
              <Badge variant={pendentes.length > 0 ? "info" : "success"}>
                {pendentes.length > 0
                  ? `${pendentes.length} ${pendentes.length === 1 ? t("em aberto") : t("em aberto")}`
                  : t("tudo com desfecho")}
              </Badge>
            </div>

            {itens.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                {t("Nenhum pedido embarcado.")}
              </Card>
            ) : (
              <div className="space-y-4">
                {pendentes.length > 0 && (
                  <ul className="space-y-2">
                    {pendentes.map((i) => {
                      const ehProxima = proxima?.id === i.id;
                      const estaAberta = aberta === i.id;
                      const separado = i.separado_em != null;
                      const mapa = linkDoMapa(i.pedido.endereco_entrega);
                      return (
                        <li
                          key={i.id}
                          id={`parada-${i.id}`}
                          className={cn(
                            "scroll-mt-44 overflow-hidden rounded-xl border border-border bg-surface transition-colors",
                            ehProxima && "border-accent/40",
                            estaAberta && "ring-1 ring-accent/20",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setAbertaId(estaAberta ? "" : i.id)}
                            aria-expanded={estaAberta}
                            className="flex w-full items-start gap-3 p-3 text-left"
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                                ehProxima
                                  ? "bg-accent text-accent-foreground"
                                  : "bg-muted text-muted-foreground",
                              )}
                              aria-label={`${t("Parada")} ${i.sequencia}`}
                            >
                              {i.sequencia}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="min-w-0 truncate text-sm font-medium text-text">
                                  {i.pedido.cliente_nome}
                                </span>
                                <Badge variant={VARIANTE_NA_CARGA[i.status as StatusNaCarga]}>
                                  {ROTULO_NA_CARGA[i.status as StatusNaCarga] ?? i.status}
                                </Badge>
                                {ehProxima && <Badge variant="info">{t("Próxima")}</Badge>}
                                {!separado && carga.status === "montando" && (
                                  <Badge variant="warning">{t("A separar")}</Badge>
                                )}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span className="font-medium tabular-nums">
                                  {numeroDoPedido(i.pedido.numero)}
                                </span>
                                <span className="font-medium text-text tabular-nums">
                                  {comoMoeda(i.pedido.total_cents, "BRL")}
                                </span>
                                <span className="min-w-0 truncate">
                                  {i.pedido.endereco_entrega ?? textos.semEndereco}
                                </span>
                              </span>
                            </span>
                            <CaretDown
                              size={16}
                              aria-hidden
                              className={cn(
                                "mt-1 shrink-0 text-text-subtle transition-transform",
                                estaAberta && "rotate-180",
                              )}
                            />
                          </button>

                          {estaAberta && (
                            <div className="space-y-3 border-t border-border px-3 pt-2.5 pb-3">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                {mapa ? (
                                  <a
                                    href={mapa}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-4"
                                  >
                                    <MapPin size={13} aria-hidden />
                                    {t("Abrir no mapa")}
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-warning-fg">
                                    <MapPin size={13} aria-hidden />
                                    {textos.semEndereco}
                                  </span>
                                )}
                                {i.pago_cents > 0 && (
                                  <span className="text-muted-foreground">
                                    {t("Pago")}: {comoMoeda(i.pago_cents, "BRL")}
                                  </span>
                                )}
                                {i.pedido.endereco_entrega && (
                                  <span className="min-w-0 truncate text-muted-foreground">
                                    {i.pedido.endereco_entrega}
                                  </span>
                                )}
                              </div>

                              {podeOperar &&
                                carga.status === "montando" &&
                                i.status === "na_carga" && (
                                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-stage-2 px-2 py-1 text-xs text-muted-foreground">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-accent"
                                      checked={separado}
                                      onChange={(e) => void separar(i.order_id, e.target.checked)}
                                      aria-label={`${t("Separado")}: ${numeroDoPedido(i.pedido.numero)}`}
                                    />
                                    {t("Separado")}
                                  </label>
                                )}

                              {podeOperar && (
                                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void desfecho(i.order_id, "em_atendimento")}
                                  >
                                    {textos.cheguei}
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => void desfecho(i.order_id, "entregue")}
                                  >
                                    {textos.entregue}
                                  </Button>
                                  {motivoPara === i.order_id ? (
                                    <>
                                      <select
                                        className="h-8 rounded-lg border border-input bg-surface px-2 text-sm"
                                        value={motivo}
                                        onChange={(e) => setMotivo(e.target.value as MotivoDevolucao)}
                                        aria-label={textos.motivo}
                                      >
                                        {MOTIVOS_DEVOLUCAO.map((m) => (
                                          <option key={m} value={m}>
                                            {ROTULO_MOTIVO_DEVOLUCAO[m]}
                                          </option>
                                        ))}
                                      </select>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => void desfecho(i.order_id, "devolvido")}
                                      >
                                        {textos.confirmar}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setMotivoPara(null)}
                                      >
                                        {textos.cancelar}
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setMotivoPara(i.order_id)}
                                    >
                                      {textos.devolvido}
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="ml-auto text-muted-foreground"
                                    onClick={() => void tirarDaCarga(i.order_id)}
                                  >
                                    <X size={14} aria-hidden />
                                    {textos.tirarDaCarga}
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {concluidas.length > 0 && (
                  <section aria-labelledby="titulo-concluidas">
                    <button
                      type="button"
                      onClick={() => setConcluidasAbertas((v) => !v)}
                      aria-expanded={mostrarConcluidas}
                      className="flex w-full items-center gap-2 py-1 text-left text-xs font-medium text-muted-foreground hover:text-text"
                    >
                      <CaretDown
                        size={14}
                        aria-hidden
                        className={cn("transition-transform", !mostrarConcluidas && "-rotate-90")}
                      />
                      {t("Concluídas")}{" "}
                      <span className="tabular-nums">({concluidas.length})</span>
                      <span className="font-normal text-text-subtle">
                        {t("comprovante e valor pago ficam no histórico da parada")}
                      </span>
                    </button>

                    {mostrarConcluidas && (
                      <ul className="mt-1 space-y-2">
                        {concluidas.map((i) => (
                          <li
                            key={i.id}
                            id={`parada-${i.id}`}
                            className="scroll-mt-44 overflow-hidden rounded-xl border border-border bg-surface"
                          >
                            <div className="flex items-start gap-3 p-3">
                              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
                                {i.sequencia}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="min-w-0 truncate text-sm font-medium text-text">
                                    {i.pedido.cliente_nome}
                                  </p>
                                  <Badge variant={VARIANTE_NA_CARGA[i.status as StatusNaCarga]}>
                                    {ROTULO_NA_CARGA[i.status as StatusNaCarga] ?? i.status}
                                  </Badge>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  <span className="font-medium tabular-nums">
                                    {numeroDoPedido(i.pedido.numero)}
                                  </span>
                                  <span className="font-medium text-text tabular-nums">
                                    {comoMoeda(i.pedido.total_cents, "BRL")}
                                  </span>
                                  {i.pago_cents > 0 && (
                                    <span>
                                      {t("Pago")}: {comoMoeda(i.pago_cents, "BRL")}
                                    </span>
                                  )}
                                  <span className="min-w-0 truncate">
                                    {i.pedido.endereco_entrega ?? textos.semEndereco}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {i.status === "entregue" && (
                              <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
                                {i.tem_comprovante ? (
                                  <Link
                                    href={`/api/v1/shipments/${carga.id}/orders/${i.order_id}/proof`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent underline underline-offset-4"
                                  >
                                    <FileText className="h-3.5 w-3.5" aria-hidden />
                                    {textos.verComprovante}
                                  </Link>
                                ) : podeOperar ? (
                                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text hover:bg-muted">
                                    <UploadSimple className="h-3.5 w-3.5" aria-hidden />
                                    {textos.escolherFoto}
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      className="sr-only"
                                      aria-label={textos.escolherFoto}
                                      onChange={(e) =>
                                        void anexarFoto(i.order_id, e.target.files?.[0])
                                      }
                                    />
                                  </label>
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {t("Sem comprovante anexado.")}
                                  </span>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {secao === "rota" && (
        <Roteirizador cargaId={cargaId} podeOperar={podeOperar} aoMudar={() => void recarregar()} />
      )}

      {secao === "fechamento" && (
        <FechamentoCarga cargaId={cargaId} podeFechar={podeFechar} />
      )}
    </div>
  );
}
