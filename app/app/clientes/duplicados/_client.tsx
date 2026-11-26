"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
import { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
import { NexusCardsSkeleton } from "@/components/nexus-ui/feedback/NexusSkeleton";
import { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
import { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { ROLE_RANK } from "@/lib/auth/types";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import {
  totaisParaFundir,
  type DuplicadosMeta,
  type FichaDuplicada,
  type GrupoDuplicado,
  type ResultadoFusao,
} from "@/lib/contacts/duplicados";
import {
  CheckCircle,
  Envelope,
  MapPin,
  Phone,
  UsersThree,
  Warning,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Clientes duplicados — a tela onde um humano decide.
 *
 * ─── Regra de ouro ─────────────────────────────────────────────────────────
 *
 * A tela NUNCA funde nada sozinha. Nenhum "sugerir e aplicar": o humano
 * escolhe uma ficha vencedora, lê quantos pedidos/conversas vão passar e
 * confirma. "Não é a mesma pessoa" registra a decisão e tira o grupo da fila.
 *
 * ─── Por que as fichas ficam lado a lado ───────────────────────────────────
 *
 * A decisão é comparativa: telefone, e-mail, endereço, número de pedidos,
 * última compra e data de criação precisam ser lidos em paralelo. Uma lista
 * vertical faria o operador rolar e memorizar o que viu — e a única coisa que
 * decide é a diferença entre as fichas.
 */

type Resposta = {
  data: GrupoDuplicado[];
  meta: DuplicadosMeta & { aviso?: string | null };
};

type Confirmacao = { grupo: GrupoDuplicado; vencedor: FichaDuplicada };
type Descarte = { grupo: GrupoDuplicado };

function formatarData(iso: string | null, tagDoIdioma: string): string {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleDateString(tagDoIdioma, { day: "2-digit", month: "2-digit", year: "numeric" });
}

function enderecoDaFicha(f: FichaDuplicada): string | null {
  const partes = [f.bairro, f.cidade && f.uf ? `${f.cidade}/${f.uf}` : (f.cidade ?? f.uf), f.cep];
  const texto = partes.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
  return texto === "" ? null : texto;
}

export function DuplicadosClient() {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { user, activeOrg } = useAuth();
  const podeDecidir = Boolean(
    user.is_platform_admin ||
      (activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager),
  );

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [grupos, setGrupos] = useState<GrupoDuplicado[]>([]);
  const [meta, setMeta] = useState<Resposta["meta"] | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [descarte, setDescarte] = useState<Descarte | null>(null);
  const [motivoDescarte, setMotivoDescarte] = useState("");
  const [enviando, setEnviando] = useState(false);

  const numero = useMemo(
    () => (n: number) => new Intl.NumberFormat(tagDoIdioma).format(n),
    [tagDoIdioma],
  );

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    try {
      const resp = await apiClient.get<Resposta>("/api/v1/contacts/duplicados");
      setGrupos(resp.data ?? []);
      setMeta(resp.meta ?? null);
    } catch {
      // Erro NÃO vira "vazio": lista vazia é uma afirmação sobre o mundo, e
      // aqui o mundo não foi lido.
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function decidirLocalmente(chave: string, fichasRemovidas: number) {
    setGrupos((atuais) => atuais.filter((g) => g.chave !== chave));
    setEscolhas((atuais) => {
      const proximo = { ...atuais };
      delete proximo[chave];
      return proximo;
    });
    setMeta((atual) =>
      atual
        ? {
            ...atual,
            total_grupos: Math.max(0, atual.total_grupos - 1),
            total_fichas: Math.max(0, atual.total_fichas - fichasRemovidas),
          }
        : atual,
    );
  }

  async function fundir() {
    if (!confirmacao) return;
    setEnviando(true);
    try {
      const perdedores = confirmacao.grupo.fichas
        .filter((f) => f.id !== confirmacao.vencedor.id)
        .map((f) => f.id);
      const resp = await apiClient.post<{ data: ResultadoFusao }>(
        "/api/v1/contacts/duplicados/fundir",
        {
          vencedor_id: confirmacao.vencedor.id,
          perdedores_ids: perdedores,
          motivo: t("Mesma pessoa confirmada na revisão de duplicados"),
        },
      );
      const r = resp.data;
      nexusToast.success(
        r.aplicado
          ? t("{n} ficha(s) fundida(s) em {nome}.")
              .replace("{n}", String(r.contatos_mesclados))
              .replace("{nome}", confirmacao.vencedor.nome)
          : t("Estas fichas já estavam fundidas."),
      );
      decidirLocalmente(confirmacao.grupo.chave, confirmacao.grupo.total_fichas);
      setConfirmacao(null);
      // Rebusca: com `truncado`, decidir os exibidos precisa trazer os
      // próximos — senão a tela diria "nada exige decisão" com fila sobrando.
      await carregar();
    } catch (erroApi) {
      showApiError(erroApi);
    } finally {
      setEnviando(false);
    }
  }

  async function descartar() {
    if (!descarte) return;
    const motivo = motivoDescarte.trim();
    if (motivo.length < 3) return;
    setEnviando(true);
    try {
      await apiClient.post("/api/v1/contacts/duplicados/descartar", {
        chave: descarte.grupo.chave,
        motivo,
      });
      nexusToast.success(t("Grupo descartado. Ele não volta nesta fila."));
      decidirLocalmente(descarte.grupo.chave, descarte.grupo.total_fichas);
      setDescarte(null);
      setMotivoDescarte("");
      await carregar();
    } catch (erroApi) {
      showApiError(erroApi);
    } finally {
      setEnviando(false);
    }
  }

  const totais = confirmacao
    ? totaisParaFundir(confirmacao.grupo, confirmacao.vencedor.id)
    : null;

  return (
    <div className="space-y-6">
      <NexusPageHeader
        title={t("Clientes duplicados")}
        subtitle={
          meta ? (
            <>
              <span className="font-medium text-text">
                {t("{grupos} grupos · {fichas} fichas").replace(
                  "{grupos}",
                  numero(meta.total_grupos),
                ).replace("{fichas}", numero(meta.total_fichas))}
              </span>
              {" — "}
              {t(
                "mesmo nome e cidade, sem CNPJ, com histórico. Duas pessoas podem ter o mesmo nome: quem decide se é a mesma pessoa é você.",
              )}
            </>
          ) : (
            t("Carregando a fila de revisão…")
          )
        }
      />

      {meta?.aviso ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-text"
        >
          <Warning size={18} weight="bold" className="mt-0.5 shrink-0 text-warning-fg" aria-hidden />
          <span>{t(meta.aviso)}</span>
        </div>
      ) : null}

      {carregando ? (
        <NexusCardsSkeleton count={3} />
      ) : erro ? (
        <NexusErrorState
          title={t("Não foi possível carregar os duplicados")}
          description={t(
            "A fila não pôde ser lida agora. Isto não significa que ela esteja vazia — tente de novo.",
          )}
          onRetry={() => void carregar()}
        />
      ) : grupos.length === 0 ? (
        <NexusEmptyState
          icon={CheckCircle}
          headline={t("Nada exige decisão agora")}
          subcopy={t(
            "Nenhum grupo de mesmo nome e cidade, sem CNPJ e com histórico, espera revisão. Quando aparecer, ele entra aqui.",
          )}
        />
      ) : (
        <div className="space-y-5">
          {grupos.map((grupo) => {
            const vencedorId = escolhas[grupo.chave];
            const vencedor = grupo.fichas.find((f) => f.id === vencedorId);
            const local = grupo.cidade
              ? grupo.uf
                ? `${grupo.cidade}/${grupo.uf}`
                : grupo.cidade
              : null;

            return (
              <Card key={grupo.chave} data-testid="grupo-duplicado">
                <CardHeader className="flex flex-col gap-2 space-y-0 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-medium text-text">{grupo.nome}</h2>
                    <p className="text-sm text-muted-foreground">
                      {local ?? t("Cidade não informada")} ·{" "}
                      {t("{n} fichas").replace("{n}", String(grupo.total_fichas))}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline">
                      {t("{n} pedidos").replace("{n}", String(grupo.pedidos))}
                    </Badge>
                    <Badge variant="outline">
                      {t("{n} conversas").replace("{n}", String(grupo.conversas))}
                    </Badge>
                    <Badge variant="outline">
                      {t("{n} leads").replace("{n}", String(grupo.leads))}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    {t("Escolha a ficha que fica. As outras serão fundidas nela.")}
                  </p>

                  <div
                    role="radiogroup"
                    aria-label={t("Ficha vencedora de {nome}").replace("{nome}", grupo.nome)}
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
                  >
                    {grupo.fichas.map((ficha) => {
                      const selecionada = ficha.id === vencedorId;
                      const endereco = enderecoDaFicha(ficha);
                      return (
                        <label
                          key={ficha.id}
                          className={cn(
                            "relative flex min-h-11 cursor-pointer flex-col gap-3 rounded-xl border p-4 transition-colors",
                            "focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2",
                            selecionada
                              ? "border-accent bg-accent/5 ring-1 ring-accent"
                              : "border-border bg-surface hover:border-accent/60",
                          )}
                        >
                          <input
                            type="radio"
                            name={`vencedor-${grupo.chave}`}
                            value={ficha.id}
                            checked={selecionada}
                            onChange={() =>
                              setEscolhas((atuais) => ({ ...atuais, [grupo.chave]: ficha.id }))
                            }
                            className="sr-only"
                          />
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text">{ficha.nome}</p>
                              <p className="text-xs text-muted-foreground">
                                {ficha.cidade
                                  ? `${ficha.cidade}${ficha.uf ? `/${ficha.uf}` : ""}`
                                  : t("Sem cidade")}
                              </p>
                            </div>
                            {selecionada ? (
                              <Badge className="shrink-0">{t("Vencedora")}</Badge>
                            ) : null}
                          </div>

                          <dl className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <dt className="text-muted-foreground">{t("Pedidos")}</dt>
                              <dd className="text-sm font-medium text-text">
                                {numero(ficha.pedidos)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">{t("Última compra")}</dt>
                              <dd className="text-sm text-text">
                                {formatarData(ficha.ultima_compra, tagDoIdioma)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">{t("Conversas")}</dt>
                              <dd className="text-sm text-text">{numero(ficha.conversas)}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">{t("Criado em")}</dt>
                              <dd className="text-sm text-text">
                                {formatarData(ficha.criado_em, tagDoIdioma)}
                              </dd>
                            </div>
                          </dl>

                          <ul className="space-y-1 text-xs text-muted-foreground">
                            <li className="flex items-center gap-1.5">
                              <Phone size={14} aria-hidden className="shrink-0" />
                              <span className="truncate">
                                {ficha.telefone
                                  ? phoneForDisplay(ficha.telefone) || ficha.telefone
                                  : t("Sem telefone")}
                              </span>
                            </li>
                            <li className="flex items-center gap-1.5">
                              <Envelope size={14} aria-hidden className="shrink-0" />
                              <span className="truncate">{ficha.email ?? t("Sem e-mail")}</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <MapPin size={14} aria-hidden className="mt-0.5 shrink-0" />
                              <span>{endereco ?? t("Sem endereço")}</span>
                            </li>
                          </ul>
                        </label>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-muted-foreground">
                      {vencedor
                        ? t("Vencedora escolhida: {nome}.").replace("{nome}", vencedor.nome)
                        : t("Escolha uma ficha para liberar a fusão.")}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={!podeDecidir || enviando}
                        onClick={() => {
                          setMotivoDescarte("");
                          setDescarte({ grupo });
                        }}
                      >
                        {t("Não é a mesma pessoa")}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="min-h-11"
                        disabled={!podeDecidir || !vencedor || enviando}
                        onClick={() => {
                          if (vencedor) setConfirmacao({ grupo, vencedor });
                        }}
                      >
                        {t("Fundir nesta ficha")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={confirmacao !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !enviando) setConfirmacao(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {(totais?.fichas ?? 0) === 1
                ? t("Fundir 1 ficha em {nome}?").replace(
                    "{nome}",
                    confirmacao?.vencedor.nome ?? "",
                  )
                : t("Fundir {n} fichas em {nome}?")
                    .replace("{n}", String(totais?.fichas ?? 0))
                    .replace("{nome}", confirmacao?.vencedor.nome ?? "")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Isto não desfaz sozinho. As fichas perdedoras ficam marcadas como mescladas e saem desta lista.",
              )}
            </DialogDescription>
          </DialogHeader>

          {totais ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium text-text">
                {t("Vão passar para esta ficha:")}
              </p>
              <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                <li>{t("{n} pedidos").replace("{n}", String(totais.pedidos))}</li>
                <li>{t("{n} conversas").replace("{n}", String(totais.conversas))}</li>
                <li>{t("{n} leads").replace("{n}", String(totais.leads))}</li>
              </ul>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Pedidos e conversas repontados não voltam sozinhos; a marca de mesclagem é reversível, o vínculo não.",
                )}
              </p>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={enviando}
              onClick={() => setConfirmacao(null)}
            >
              {t("Cancelar")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={enviando}
              onClick={() => void fundir()}
            >
              {enviando ? t("Fundindo…") : t("Confirmar fusão")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={descarte !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !enviando) {
            setDescarte(null);
            setMotivoDescarte("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("Não é a mesma pessoa?")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "O grupo sai da fila e não volta na próxima varredura. Escreva o porquê — é o que permite reconstruir a decisão depois.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="motivo-descarte">{t("Por que não são a mesma pessoa?")}</Label>
            <Textarea
              id="motivo-descarte"
              value={motivoDescarte}
              onChange={(evento) => setMotivoDescarte(evento.target.value)}
              placeholder={t("Ex.: mesma cidade, mas telefones e endereços diferentes.")}
              maxLength={500}
              rows={3}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={enviando}
              onClick={() => {
                setDescarte(null);
                setMotivoDescarte("");
              }}
            >
              {t("Cancelar")}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={enviando || motivoDescarte.trim().length < 3}
              onClick={() => void descartar()}
            >
              {enviando ? t("Salvando…") : t("Descartar grupo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!podeDecidir ? (
        <p className="text-xs text-muted-foreground">
          <UsersThree size={14} className="mr-1 inline" aria-hidden />
          {t("Você pode consultar a fila; fundir e descartar exigem gestor.")}
        </p>
      ) : null}
    </div>
  );
}
