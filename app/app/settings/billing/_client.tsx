"use client";

import * as React from "react";
import Link from "next/link";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { ArrowsClockwise, CheckCircle, Wallet, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * BILLING DO TENANT — tudo vem de GET /api/v1/billing/subscription.
 * Nenhum plano, preço ou "pagamento confirmado" é escrito aqui: a confirmação
 * é do webhook no servidor. A tela diz o estado que o servidor devolveu.
 */

type Estado = "sem_assinatura" | "ativa" | "pendente" | "falha" | "sem_stripe" | "suspensa";

interface Aviso {
  etapa: number;
  canal: string | null;
  enviado_em: string | null;
  resultado: string;
  detalhe: string | null;
}

interface Assinatura {
  fonte: string;
  status: string;
  valor_cents: number | null;
  moeda: string | null;
  vencimento: string | null;
  cancela_no_fim: boolean;
  id: string | null;
  avisos: Aviso[];
  proximos: number[];
}

const ESTADOS_QUE_PAGAM = new Set(["past_due", "unpaid", "incomplete", "incomplete_expired", "canceled"]);

export function estadoDaAssinatura(dados: Assinatura | null, suspensa: boolean): Estado {
  if (suspensa || dados?.status === "suspenso" || dados?.status === "suspended") return "suspensa";
  if (!dados) return "sem_stripe";
  if (dados.fonte === "local_cache") return "sem_stripe";
  if (dados.status === "sem_assinatura") return "sem_assinatura";
  if (dados.status === "active" || dados.status === "trialing") return "ativa";
  if (ESTADOS_QUE_PAGAM.has(dados.status)) return "pendente";
  return "falha";
}

export function BillingClient({
  suporte,
  suspensa,
}: {
  suporte: string | null;
  suspensa: boolean;
}) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const [dados, setDados] = React.useState<Assinatura | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState(false);
  const [acao, setAcao] = React.useState<"checkout" | "portal" | null>(null);

  const carregar = React.useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const resposta = await apiClient.get<{ data: Assinatura }>("/api/v1/billing/subscription");
      setDados(resposta?.data ?? null);
    } catch {
      setErro(true);
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const estado = estadoDaAssinatura(dados, suspensa);
  const podePagar = estado !== "ativa"; // suspensa também paga — é o que a destrava

  async function pagar(tipo: "checkout" | "portal") {
    setAcao(tipo);
    try {
      const rota = tipo === "checkout" ? "/api/v1/billing/checkout" : "/api/v1/billing/portal";
      const resposta = await apiClient.post<{ data: { url: string } }>(rota, {});
      if (resposta?.data?.url) window.location.assign(resposta.data.url);
      else throw new Error("sem url");
    } catch (e) {
      if (e instanceof ApiError) showApiError(e);
      else toast.error(t("Não foi possível abrir o pagamento. Tente novamente."));
      setAcao(null);
    }
  }

  const rotuloEstado: Record<Estado, string> = {
    sem_assinatura: t("Sem assinatura"),
    ativa: t("Assinatura ativa"),
    pendente: t("Pagamento pendente"),
    falha: t("Assinatura em situação irregular"),
    sem_stripe: t("Sem conexão com o Stripe"),
    suspensa: t("Conta suspensa por cobrança"),
  };
  const tom: Record<Estado, "neutral" | "success" | "warning" | "error" | "info"> = {
    sem_assinatura: "neutral",
    ativa: "success",
    pendente: "warning",
    falha: "error",
    sem_stripe: "info",
    suspensa: "error",
  };

  const valor =
    dados?.valor_cents != null && dados.moeda
      ? `${(dados.valor_cents / 100).toLocaleString(tagIdioma, { style: "currency", currency: dados.moeda })}`
      : t("plano não configurado");
  const vencimento = dados?.vencimento
    ? new Date(dados.vencimento).toLocaleDateString(tagIdioma, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : t("sem vencimento informado");

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-text">{t("Status da assinatura")}</h2>
          <Badge variant={tom[estado]}>{rotuloEstado[estado]}</Badge>
        </div>

        {carregando ? (
          <p className="text-sm text-muted-foreground" role="status">{t("Carregando assinatura…")}</p>
        ) : (
          <>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">{t("Plano")}</dt>
                <dd className="font-medium text-text">{valor}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Vencimento")}</dt>
                <dd className="font-medium text-text tabular-nums">{vencimento}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Situação no provedor")}</dt>
                <dd className="font-medium text-text">{dados?.status ?? t("não informada")}</dd>
              </div>
            </dl>

            {valor === t("plano não configurado") && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text">
                <Wallet size={16} aria-hidden className="shrink-0" />
                <p className="min-w-0 flex-1">
                  {t("Não configuramos um plano para esta instalação.")}{" "}
                  {suporte ? (
                    <>
                      {t("Fale com")}{" "}
                      <a className="underline" href={`mailto:${suporte}`}>{suporte}</a>.
                    </>
                  ) : (
                    t("Fale com quem administra este sistema.")
                  )}
                </p>
              </div>
            )}

            {estado === "suspensa" && (
              <div role="alert" className="rounded-lg border border-error/40 bg-error-bg px-3 py-2.5 text-sm text-error-fg">
                <p className="font-medium">{t("Esta conta foi suspensa por cobrança.")}</p>
                <p className="mt-0.5">
                  {t("Regularize o pagamento para voltar. Detalhes em")}{" "}
                  <Link className="underline" href="/account-suspended">
                    /account-suspended
                  </Link>
                  .
                </p>
              </div>
            )}

            {(estado === "sem_stripe" || erro) && (
              <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-info/40 bg-info-bg px-3 py-2.5 text-sm text-info-fg">
                <Warning size={16} aria-hidden className="shrink-0" />
                <p className="min-w-0 flex-1">
                  {t("Não conseguimos consultar o Stripe agora. O estado acima é o último conhecido — nunca afirmamos pagamento confirmado.")}
                </p>
                <Button size="sm" variant="outline" className="min-h-11" onClick={() => void carregar()}>
                  <ArrowsClockwise size={14} aria-hidden /> {t("Tentar novamente")}
                </Button>
              </div>
            )}

            {/* UMA ação principal por estado, no mesmo lugar. */}
            <div className="flex flex-wrap items-center gap-2">
              {podePagar ? (
                <Button
                  onClick={() => void pagar("checkout")}
                  disabled={acao !== null}
                  className="min-h-11"
                >
                  {acao === "checkout" ? t("Abrindo pagamento…") : t("Pagar / regularizar")}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => void pagar("portal")}
                    disabled={acao !== null}
                    className="min-h-11"
                  >
                    {acao === "portal" ? t("Abrindo portal…") : t("Gerenciar forma de pagamento")}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {t("Se o portal não estiver disponível, use o checkout.")}
                  </span>
                </>
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-text">{t("Avisos de vencimento")}</h2>
        {dados?.proximos && dados.proximos.length > 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("Ainda vão avisos em")} {dados.proximos.map((d) => `D-${d}`).join(", ")}.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Nenhum aviso futuro nesta data.")}</p>
        )}
        {dados?.avisos && dados.avisos.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {dados.avisos.map((aviso, i) => (
              <li key={`${aviso.etapa}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <Badge variant={aviso.resultado === "enviado" ? "success" : "warning"}>
                  D-{aviso.etapa}
                </Badge>
                <span className="text-muted-foreground">{aviso.canal ?? t("canal não informado")}</span>
                <span className={cn("min-w-0 flex-1", aviso.resultado === "enviado" ? "text-text" : "text-warning-fg")}>
                  {aviso.resultado}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {aviso.enviado_em
                    ? new Date(aviso.enviado_em).toLocaleString(tagIdioma)
                    : t("não enviado")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("Nenhum aviso enviado até agora.")}</p>
        )}
        {!carregando && !erro && (dados?.avisos?.length ?? 0) === 0 && (dados?.proximos?.length ?? 0) === 0 && (
          <p className="flex items-center gap-1.5 text-sm text-success-fg" role="status">
            <CheckCircle size={15} aria-hidden /> {t("Sem pendência de aviso.")}
          </p>
        )}
      </Card>
    </div>
  );
}
