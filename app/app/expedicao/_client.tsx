"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Truck } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import {
  numeroDaCarga,
  ROTULO_DA_CARGA,
  type Carga,
  type StatusDaCarga,
} from "@/lib/schemas/expedicao";
import { type PedidoComercial } from "@/lib/schemas/pedidos";
import { filtrarEmbarcaveis } from "@/lib/expedicao/buscar-embarcavel";
import { comoMoeda, numeroDoPedido } from "@/lib/format/moeda";

interface Textos {
  titulo: string;
  subtitulo: string;
  nova: string;
  cargas: string;
  vazias: string;
  embarcaveis: string;
  nenhumEmbarcavel: string;
  buscarPedido: string;
  buscaSemResultado: string;
  selecionados: string;
  /** Contagem do filtro. `{a}` e `{de}` são substituídos — o i18n não interpola. */
  mostrando: string;
  placa: string;
  veiculo: string;
  motorista: string;
  criar: string;
  verRomaneio: string;
}

const VARIANTE_CARGA: Record<
  StatusDaCarga,
  NonNullable<React.ComponentProps<typeof Badge>["variant"]>
> = {
  montando: "warning",
  em_rota: "info",
  concluida: "success",
  cancelada: "error",
};

export function ExpedicaoClient({
  inicial,
  embarcaveis,
  podeCriar,
  textos,
}: {
  inicial: Carga[];
  embarcaveis: PedidoComercial[];
  podeCriar: boolean;
  textos: Textos;
}) {
  const t = useT();
  const router = useRouter();
  const [placa, setPlaca] = React.useState("");
  const [veiculo, setVeiculo] = React.useState("");
  const [motorista, setMotorista] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [selecionados, setSelecionados] = React.useState<string[]>([]);
  const [enviando, setEnviando] = React.useState(false);

  const filtrando = busca.trim() !== "";
  /**
   * Os ESCOLHIDOS saem do filtro de propósito.
   *
   * Sem isto, quem marca três pedidos, digita o número do quarto e não acha o
   * quarto percebe que os três sumiram da tela — e a carga é montada no escuro:
   * a pessoa acredita que marcou, clica em criar, e o servidor leva o que
   * estava marcado. A seleção é o que vira carga, então ela é sempre visível,
   * no bloco de cima; o filtro é só uma forma de achar mais rápido o que ainda
   * FALTA marcar.
   *
   * Por isso eles saem da lista de baixo também, e não aparecem duas vezes: sem
   * esta exclusão, um selecionado que casasse com a busca reapareceria ali com
   * a caixa DESMARCADA — marcar de novo não faria nada e desmarcar tiraria da
   * carga, sem nenhum dos dois fazer o que a caixa diz.
   */
  const jaSelecionados = React.useMemo(
    () => embarcaveis.filter((p) => selecionados.includes(p.id)),
    [embarcaveis, selecionados],
  );
  const filtrados = React.useMemo(
    () => filtrarEmbarcaveis(embarcaveis, busca).filter((p) => !selecionados.includes(p.id)),
    [embarcaveis, busca, selecionados],
  );

  function alternar(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function criar() {
    if (selecionados.length === 0) {
      nexusToast.error(t("Selecione ao menos 1 pedido para embarcar."));
      return;
    }
    setEnviando(true);
    try {
      const corpo = await apiClient.post<{ data: { id: string; numero: number } | null }>(
        `/api/v1/shipments`,
        {
          ...(placa.trim() ? { placa: placa.trim() } : {}),
          ...(veiculo.trim() ? { veiculo_tipo: veiculo.trim() } : {}),
          ...(motorista.trim() ? { motorista_nome: motorista.trim() } : {}),
          order_ids: selecionados,
        },
      );
      const carga = corpo?.data;
      if (!carga) throw new Error(t("A carga foi criada mas o servidor não devolveu o resumo."));
      nexusToast.success(`${t("Carga criada")}: ${numeroDaCarga(carga.numero)}`);
      router.push(`/app/expedicao/${carga.id}`);
    } catch (e) {
      showApiError(e);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <NexusPageHeader title={textos.titulo} subtitle={textos.subtitulo} />

      <div>
        <h2 className="mb-2 text-base font-medium text-text">{textos.cargas}</h2>
        {inicial.length === 0 ? (
          <NexusEmptyState icon={Truck} headline={textos.vazias} />
        ) : (
          <ul className="divide-y rounded-lg border">
            {inicial.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                <Link
                  href={`/app/expedicao/${c.id}`}
                  className="font-medium underline underline-offset-4"
                >
                  {numeroDaCarga(c.numero)}
                </Link>
                <Badge variant={VARIANTE_CARGA[c.status as StatusDaCarga] ?? "neutral"}>
                  {ROTULO_DA_CARGA[c.status as StatusDaCarga] ?? c.status}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {[c.placa, c.veiculo_tipo, c.motorista_nome].filter(Boolean).join(" · ")}
                </span>
                <span className="flex gap-3">
                  <Link
                    href={`/api/v1/shipments/${c.id}/romaneio`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {textos.verRomaneio}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {podeCriar && (
        <div>
          <h2 className="mb-2 text-base font-medium text-text">{textos.nova}</h2>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="placa">{textos.placa}</Label>
                <Input
                  id="placa"
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value)}
                  placeholder="ABC1D23"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="veiculo">{textos.veiculo}</Label>
                <Input
                  id="veiculo"
                  value={veiculo}
                  onChange={(e) => setVeiculo(e.target.value)}
                  placeholder="Ex.: HR"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="motorista">{textos.motorista}</Label>
                <Input
                  id="motorista"
                  value={motorista}
                  onChange={(e) => setMotorista(e.target.value)}
                />
              </div>
            </div>
            <div>
              {/* Escolhidos primeiro: é o que vira carga, e precisa estar visível
                  mesmo com a busca apertada. */}
              {jaSelecionados.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-sm font-medium">
                    {textos.selecionados} ({jaSelecionados.length})
                  </p>
                  <ul className="space-y-1" data-testid="carga-selecionados">
                    {jaSelecionados.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-primary px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked
                            onChange={() => alternar(p.id)}
                            data-testid={`carga-selecionado-${p.numero}`}
                          />
                          <span className="font-medium">{numeroDoPedido(p.numero)}</span>
                          <span className="min-w-0 flex-1 truncate">{p.cliente_nome}</span>
                          <span className="font-medium">{comoMoeda(p.total_cents, p.moeda)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mb-2 text-sm font-medium">{textos.embarcaveis}</p>

              {/* A busca só aparece quando há o que buscar. Um campo de filtro
                  sobre lista vazia é um campo que nada faz. */}
              {embarcaveis.length > 0 && (
                <div className="mb-2">
                  <Input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder={textos.buscarPedido}
                    aria-label={textos.buscarPedido}
                    data-testid="carga-busca"
                  />
                  {filtrando && (
                    <p
                      className="mt-1 text-xs text-muted-foreground"
                      data-testid="carga-busca-conta"
                    >
                      {textos.mostrando
                        .replace("{a}", String(filtrados.length))
                        .replace("{de}", String(embarcaveis.length))}
                    </p>
                  )}
                </div>
              )}

              {/* Busca sem resultado é "não achei", e é diferente de "não há
                  pedidos": a pessoa precisa saber se o pedido não existe ou se
                  digitou diferente. */}
              {embarcaveis.length === 0 ? (
                <p className="text-sm text-muted-foreground">{textos.nenhumEmbarcavel}</p>
              ) : filtrados.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="carga-busca-vazia">
                  {textos.buscaSemResultado}
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto" data-testid="carga-embarcaveis">
                  {filtrados.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm hover:bg-muted/50">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => alternar(p.id)}
                          data-testid={`carga-pedido-${p.numero}`}
                        />
                        <span className="font-medium">{numeroDoPedido(p.numero)}</span>
                        <span className="min-w-0 flex-1 truncate">{p.cliente_nome}</span>
                        <span className="font-medium">{comoMoeda(p.total_cents, p.moeda)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button disabled={enviando} onClick={criar}>
              {selecionados.length > 0 ? `${textos.criar} (${selecionados.length})` : textos.criar}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
