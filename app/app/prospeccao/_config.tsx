"use client";

import * as React from "react";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { METADADOS_PROVIDERS } from "@/lib/prospeccao/providers/registro";

/**
 * Aba CONFIG (§28 do plano) — manager+.
 *
 * A chave NUNCA volta do servidor (só `tem_chave`): o campo de senha nasce
 * vazio sempre, e vazio mantém a atual. Limites, grade e ritmo sem código.
 * FASE 13 (§21/§24): os preços e o teto mensal moram aqui (nunca hardcoded
 * no frontend), e o painel "Consumo de Prospecção" mostra a régua que o
 * budget guard usa — o número da tela é o número que decide.
 */
interface Config {
  configurado: boolean;
  tem_chave?: boolean;
  provider_ativo?: string;
  limite_por_busca?: number;
  limite_diario?: number;
  grid_size_km?: number;
  raio_padrao_km?: number;
  concorrencia?: number;
  retries?: number;
  timeout_ms?: number;
  requisicoes_por_minuto?: number;
  cache_ttl_dias?: number;
  orcamento_mensal_cents?: number | null;
  preco_busca_cents?: number | null;
  preco_detalhe_cents?: number | null;
}

/** GET /api/v1/prospecting/consumo — mesma régua do guard (§21). */
interface Consumo {
  provider_ativo: string;
  hoje: { consultas: number };
  mes: {
    consultas: number;
    hits: number;
    misses: number;
    descobertas: number;
    novas: number;
    enriquecimentos: number;
    custo_cents: number;
  };
  orcamento: {
    limite_cents: number | null;
    gasto_cents: number;
    pct: number;
    estado: string;
    alerta: string | null;
  };
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");
const percentual = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

/** Config em centavos → campo em R$ (""); null/vazio = sem teto ou default. */
function reaisDeCents(cents: number | null | undefined): string {
  return cents == null ? "" : String(cents / 100);
}

/** Campo em R$ (aceita vírgula) → centavos inteiros; vazio = limpar. */
function centsDeReais(valor: string | undefined): number | null {
  const t = (valor ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function ConfigTab() {
  const t = useT();
  const [cfg, setCfg] = React.useState<Config | null>(null);
  const [erro, setErro] = React.useState(false);
  const [chave, setChave] = React.useState("");
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [salvando, setSalvando] = React.useState(false);
  const [consumo, setConsumo] = React.useState<Consumo | null>(null);
  const [consumoErro, setConsumoErro] = React.useState(false);

  const recarregar = React.useCallback(async () => {
    try {
      const [corpo, corpoConsumo] = await Promise.all([
        apiClient.get<{ data: Config | null }>("/api/v1/prospecting/settings"),
        apiClient.get<{ data: Consumo }>("/api/v1/prospecting/consumo").catch(() => null),
      ]);
      const c = corpo?.data;
      if (c && typeof c === "object") {
        setCfg(c);
        setErro(false);
        setForm({
          provider_ativo: String(c.provider_ativo ?? "google_places"),
          limite_por_busca: String(c.limite_por_busca ?? 500),
          limite_diario: String(c.limite_diario ?? 2000),
          grid_size_km: String(c.grid_size_km ?? 5),
          raio_padrao_km: String(c.raio_padrao_km ?? 30),
          concorrencia: String(c.concorrencia ?? 2),
          retries: String(c.retries ?? 3),
          timeout_ms: String(c.timeout_ms ?? 15000),
          requisicoes_por_minuto: String(c.requisicoes_por_minuto ?? 60),
          cache_ttl_dias: String(c.cache_ttl_dias ?? 30),
          orcamento_mensal: reaisDeCents(c.orcamento_mensal_cents),
          preco_busca: reaisDeCents(c.preco_busca_cents),
          preco_detalhe: reaisDeCents(c.preco_detalhe_cents),
        });
      }
      const dados = corpoConsumo?.data;
      if (dados && typeof dados === "object") {
        setConsumo(dados);
        setConsumoErro(false);
      } else {
        setConsumoErro(true);
      }
    } catch (e) {
      setErro(true);
      showApiError(e);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar();
  }, [recarregar]);

  async function salvar() {
    setSalvando(true);
    try {
      await apiClient.put("/api/v1/prospecting/settings", {
        provider_ativo: form.provider_ativo,
        ...(chave.trim() ? { google_api_key: chave.trim() } : {}),
        limite_por_busca: Number(form.limite_por_busca) || 500,
        limite_diario: Number(form.limite_diario) || 2000,
        grid_size_km: Number(form.grid_size_km) || 5,
        raio_padrao_km: Number(form.raio_padrao_km) || 30,
        concorrencia: Number(form.concorrencia) || 2,
        retries: Number(form.retries ?? 3),
        timeout_ms: Number(form.timeout_ms) || 15000,
        requisicoes_por_minuto: Number(form.requisicoes_por_minuto) || 60,
        cache_ttl_dias: Number(form.cache_ttl_dias ?? 30),
        // FASE 13: centavos no banco, R$ no campo. Vazio = limpar (sem teto /
        // voltar ao default do arquivo neutro de custos).
        orcamento_mensal_cents: centsDeReais(form.orcamento_mensal),
        preco_busca_cents: centsDeReais(form.preco_busca),
        preco_detalhe_cents: centsDeReais(form.preco_detalhe),
      });
      toast.success(t("Configuração salva"));
      setChave("");
      await recarregar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  if (!cfg) {
    if (erro) return <NexusErrorState onRetry={() => void recarregar()} />;
    return (
      <div className="space-y-2" aria-live="polite">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const campo = (id: string, rotulo: string, tipo = "text") => (
    <div className="space-y-1.5" key={id}>
      <Label htmlFor={`cfg-${id}`}>{rotulo}</Label>
      <Input
        id={`cfg-${id}`}
        type={tipo}
        value={form[id] ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [id]: e.target.value }))}
      />
    </div>
  );

  const metrica = (rotulo: string, valor: string) => (
    <div className="space-y-0.5" key={rotulo}>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-sm font-medium tabular-nums">{valor}</p>
    </div>
  );

  const rotuloProvider = consumo
    ? METADADOS_PROVIDERS.find((p) => p.nome === consumo.provider_ativo)?.rotulo ?? consumo.provider_ativo
    : "";

  return (
    <div className="space-y-4">
      <Card className="hover-raise space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-provider">{t("Provider ativo")}</Label>
            <select
              id="cfg-provider"
              className="rounded-lg border bg-background px-3 py-2 text-sm"
              value={form.provider_ativo}
              onChange={(e) => setForm((f) => ({ ...f, provider_ativo: e.target.value }))}
            >
              {METADADOS_PROVIDERS.map((p) => (
                <option key={p.nome} value={p.nome}>
                  {p.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cfg-chave">
              {t("Chave do Google")} {cfg.tem_chave ? `(${t("cadastrada")})` : `(${t("ausente")})`}
            </Label>
            <Input
              id="cfg-chave"
              type="password"
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder={t("Vazio = mantém a atual")}
              autoComplete="off"
            />
          </div>
          {campo("limite_por_busca", t("Limite por busca"), "number")}
          {campo("limite_diario", t("Limite diário (requisições)"), "number")}
          {campo("grid_size_km", t("Grade (km por célula)"), "number")}
          {campo("raio_padrao_km", t("Raio padrão (km)"), "number")}
          {campo("requisicoes_por_minuto", t("Requisições por minuto"), "number")}
          {campo("cache_ttl_dias", t("Cache (dias, 0 desliga)"), "number")}
          {campo("orcamento_mensal", t("Orçamento mensal (R$)"), "number")}
          {campo("preco_busca", t("Preço por consulta (R$)"), "number")}
          {campo("preco_detalhe", t("Preço por enriquecimento (R$)"), "number")}
        </div>
        <Button onClick={salvar} disabled={salvando}>
          {t(salvando ? "Salvando…" : "Salvar configuração")}
        </Button>
      </Card>

      <Card className="hover-raise space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("Consumo de Prospecção")}</h2>
          <span className="text-xs text-muted-foreground">{rotuloProvider}</span>
        </div>
        {consumoErro ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{t("Erro ao carregar o consumo")}</p>
            <Button variant="outline" size="sm" onClick={() => void recarregar()}>
              {t("Tentar de novo")}
            </Button>
          </div>
        ) : !consumo ? (
          <div className="space-y-2" aria-live="polite">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {consumo.orcamento.alerta ? (
              <p
                role="status"
                className={
                  consumo.orcamento.estado === "bloqueio"
                    ? "text-sm font-medium text-destructive"
                    : "text-sm text-amber-600"
                }
              >
                {consumo.orcamento.alerta}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {metrica(t("Consultas hoje"), inteiro.format(consumo.hoje.consultas))}
              {metrica(t("Consultas no mês"), inteiro.format(consumo.mes.consultas))}
              {metrica(t("Cache hits"), inteiro.format(consumo.mes.hits))}
              {metrica(t("Cache misses"), inteiro.format(consumo.mes.misses))}
              {metrica(t("Empresas descobertas"), inteiro.format(consumo.mes.descobertas))}
              {metrica(t("Empresas novas"), inteiro.format(consumo.mes.novas))}
              {metrica(t("Enriquecimentos"), inteiro.format(consumo.mes.enriquecimentos))}
              {metrica(t("Estimativa de consumo"), brl.format(consumo.mes.custo_cents / 100))}
              {metrica(
                t("Limite mensal"),
                consumo.orcamento.limite_cents != null
                  ? brl.format(consumo.orcamento.limite_cents / 100)
                  : t("Sem limite"),
              )}
              {metrica(t("Percentual utilizado"), `${percentual.format(consumo.orcamento.pct)}%`)}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
