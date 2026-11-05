"use client";

import * as React from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { Warning } from "@/lib/ui/icons";

/**
 * CORRIGIR NOTA — a edição do documento rejeitado, no lugar onde o erro aparece.
 *
 * ─── O que a tela NÃO é ─────────────────────────────────────────────────────
 *
 * Não é um formulário novo de emissão: número, série e itens do pedido ficam
 * travados. Corrigir nota é desentupir uma nota que já existe — mudar a
 * quantidade aqui seria corrigir o pedido por dentro do documento fiscal.
 *
 * ─── O que ela corrige, e por quê ──────────────────────────────────────────
 *
 * - **Destinatário**: IE, CPF/CNPJ e endereço. São as rejeições que param a
 *   fila na prática (232 = IE ausente; 726 = endereço incompleto).
 * - **Itens**: NCM, CFOP, unidade e descrição. NCM errado é rejeição 778, e o
 *   NCM mora no cadastro do produto — que só manager edita. A correção vai
 *   para a NOTA (e a tela diz isso), para o operador não ficar refém da
 *   permissão de outro.
 * - **Informações complementares**: texto que o Fisco ou o cliente exige.
 *
 * Gravar o destinatário no cadastro do cliente vem marcado: quem preenche a IE
 * de um cliente está consertando o cadastro dele, e a próxima nota não pode
 * voltar a falhar no mesmo campo.
 */

type QuadroDoDestinatario = {
  nome: string;
  documento: string | null;
  ie: string | null;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

type QuadroDoItem = {
  order_item_id: string;
  codigo: string;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number;
  preco_cents: number;
  desconto_pct: number;
  ncm_do_cadastro: string | null;
  ajustado: boolean;
};

type Quadro = {
  id: string;
  serie: string;
  numero: number | null;
  status: string;
  erro: string | null;
  sefaz_cstat: string | null;
  editavel: boolean;
  motivo_da_trava: string | null;
  contact_id: string | null;
  destinatario: { nome: string; faltando: string[] };
  contato: QuadroDoDestinatario;
  itens: QuadroDoItem[];
  adicionais: { informacoes_complementares?: string; informacoes_fisco?: string };
};

type FormularioDoItem = {
  order_item_id: string;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
};

const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Divergência campo a campo — o PATCH leva só o que mudou. */
function camposAlterados(
  antes: Record<string, string | null | undefined>,
  depois: Record<string, string>,
): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(depois)) {
    if ((antes[chave] ?? "") !== valor) saida[chave] = valor;
  }
  return saida;
}

export function CorrigirNota({
  id,
  rotulo,
  aberto,
  aoFechar,
}: {
  id: string;
  rotulo: string;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const t = useT();
  const [quadro, setQuadro] = React.useState<Quadro | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [contato, setContato] = React.useState<QuadroDoDestinatario | null>(null);
  const [itens, setItens] = React.useState<FormularioDoItem[]>([]);
  const [complementares, setComplementares] = React.useState("");
  const [aplicarNoCadastro, setAplicarNoCadastro] = React.useState(true);
  const [salvando, setSalvando] = React.useState<"salvar" | "reenviar" | null>(null);

  React.useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    // O componente só é montado com o diálogo aberto (`GradeNotas`), então o
    // estado já nasce vazio — nada de `setState` síncrono aqui, que dispararia
    // um render em cascata a cada abertura.
    apiClient
      .get<{ data: Quadro }>(`/api/v1/invoices/${id}/ajustes`)
      .then((r) => {
        if (!vivo) return;
        const q = r.data;
        setQuadro(q);
        setContato(q.contato);
        setItens(
          q.itens.map((i) => ({
            order_item_id: i.order_item_id,
            codigo: i.codigo,
            descricao: i.descricao,
            ncm: i.ncm ?? "",
            cfop: i.cfop ?? "",
            unidade: i.unidade ?? "",
          })),
        );
        setComplementares(q.adicionais.informacoes_complementares ?? "");
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setErro(e instanceof Error ? e.message : t("Não consegui ler a nota."));
      });
    return () => {
      vivo = false;
    };
  }, [aberto, id, t]);

  function montarCorpo(reenviar: boolean) {
    if (!quadro || !contato) return null;
    const d = camposAlterados(quadro.contato, {
      ie: contato.ie ?? "",
      documento: soDigitos(contato.documento ?? ""),
      logradouro: contato.logradouro.trim(),
      numero: contato.numero.trim(),
      complemento: contato.complemento.trim(),
      bairro: contato.bairro.trim(),
      cidade: contato.cidade.trim(),
      uf: contato.uf.trim().toUpperCase(),
      cep: soDigitos(contato.cep),
    });

    const itensAlterados = itens
      .map((form, pos) => {
        const original = quadro.itens[pos]!;
        const mudou: Record<string, string> = {};
        if (form.descricao.trim() !== original.descricao) mudou.descricao = form.descricao.trim();
        if (soDigitos(form.ncm) !== (original.ncm ?? "")) mudou.ncm = soDigitos(form.ncm);
        if (soDigitos(form.cfop) !== (original.cfop ?? "")) mudou.cfop = soDigitos(form.cfop);
        if (form.unidade.trim().toUpperCase() !== (original.unidade ?? "").toUpperCase()) {
          mudou.unidade = form.unidade.trim().toUpperCase();
        }
        if (Object.keys(mudou).length === 0) return null;
        // Só o que mudou entra: um item intocado não vira "ajustado" à toa.
        return { order_item_id: form.order_item_id, ...mudou };
      })
      .filter((v): v is { order_item_id: string } & Record<string, string> => v !== null);

    const adicionais =
      complementares.trim() !== (quadro.adicionais.informacoes_complementares ?? "")
        ? { informacoes_complementares: complementares.trim() }
        : undefined;

    const temDestinatario = Object.keys(d).length > 0;
    if (!temDestinatario && itensAlterados.length === 0 && !adicionais) return null;

    return {
      ...(temDestinatario ? { destinatario: d } : {}),
      ...(itensAlterados.length > 0 ? { itens: itensAlterados } : {}),
      ...(adicionais ? { adicionais } : {}),
      aplicar_no_cadastro: aplicarNoCadastro,
      reenviar,
    };
  }

  async function salvar(reenviar: boolean) {
    const corpo = montarCorpo(reenviar);
    if (!corpo) {
      toast.error(t("Nada mudou — ajuste algum campo antes de salvar."));
      return;
    }
    setSalvando(reenviar ? "reenviar" : "salvar");
    try {
      const r = await apiClient.patch<{
        data: { reenviado: boolean; cadastro_atualizado: boolean };
      }>(`/api/v1/invoices/${id}/ajustes`, corpo);
      const d = r.data;
      toast.success(
        reenviar
          ? t("Correção salva — a nota voltou para a fila.")
          : t("Correção salva."),
      );
      if (d.cadastro_atualizado) toast.success(t("Cadastro do cliente atualizado."));
      aoFechar();
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(null);
    }
  }

  const falta = quadro?.destinatario.faltando ?? [];

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) aoFechar();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-text">
            {t("Corrigir nota")} {rotulo}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t(
              "Corrija o que a SEFAZ recusou e devolva a nota para a fila — sem cancelar e emitir outra.",
            )}
          </DialogDescription>
        </DialogHeader>

        {erro && <p className="text-sm text-destructive">{erro}</p>}
        {!quadro && !erro && <Skeleton className="h-48 w-full" />}

        {quadro && !quadro.editavel && (
          <p className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg">
            {quadro.motivo_da_trava}
          </p>
        )}

        {quadro && quadro.editavel && contato && (
          <div className="space-y-5">
            {quadro.erro && (
              <div className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-xs">
                <p className="flex items-center gap-1.5 font-medium text-warning-fg">
                  <Warning size={14} aria-hidden />
                  {t("O que a SEFAZ respondeu")}
                  {quadro.sefaz_cstat ? (
                    <span className="font-mono">({quadro.sefaz_cstat})</span>
                  ) : null}
                </p>
                <p className="mt-1 leading-relaxed text-warning-fg">{quadro.erro}</p>
              </div>
            )}

            {falta.length > 0 && (
              <p className="rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
                <span className="font-medium text-text">{t("Falta para a nota sair")}: </span>
                {falta.join(" · ")}
              </p>
            )}

            <fieldset className="space-y-3">
              <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("Destinatário")}
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ajuste-documento">{t("CPF/CNPJ")}</Label>
                  <Input
                    id="ajuste-documento"
                    value={contato.documento ?? ""}
                    onChange={(e) =>
                      setContato({ ...contato, documento: soDigitos(e.target.value) })
                    }
                    inputMode="numeric"
                    maxLength={14}
                    placeholder="00000000000000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ajuste-ie">{t("Inscrição Estadual")}</Label>
                  <Input
                    id="ajuste-ie"
                    value={contato.ie ?? ""}
                    onChange={(e) => setContato({ ...contato, ie: e.target.value })}
                    placeholder={t("Número da IE ou ISENTO")}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t(
                      "Rejeição 232 é isto: o CNPJ tem IE ativa na UF e o cadastro está sem ela.",
                    )}
                  </p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ajuste-logradouro">{t("Logradouro")}</Label>
                  <Input
                    id="ajuste-logradouro"
                    value={contato.logradouro}
                    onChange={(e) => setContato({ ...contato, logradouro: e.target.value })}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ajuste-numero">{t("Número")}</Label>
                  <Input
                    id="ajuste-numero"
                    value={contato.numero}
                    onChange={(e) => setContato({ ...contato, numero: e.target.value })}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ajuste-complemento">{t("Complemento")}</Label>
                  <Input
                    id="ajuste-complemento"
                    value={contato.complemento}
                    onChange={(e) => setContato({ ...contato, complemento: e.target.value })}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ajuste-bairro">{t("Bairro")}</Label>
                  <Input
                    id="ajuste-bairro"
                    value={contato.bairro}
                    onChange={(e) => setContato({ ...contato, bairro: e.target.value })}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ajuste-cidade">{t("Município")}</Label>
                  <Input
                    id="ajuste-cidade"
                    value={contato.cidade}
                    onChange={(e) => setContato({ ...contato, cidade: e.target.value })}
                    maxLength={60}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ajuste-uf">{t("UF")}</Label>
                  <Input
                    id="ajuste-uf"
                    value={contato.uf}
                    onChange={(e) => setContato({ ...contato, uf: e.target.value.toUpperCase() })}
                    maxLength={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ajuste-cep">{t("CEP")}</Label>
                  <Input
                    id="ajuste-cep"
                    value={contato.cep}
                    onChange={(e) => setContato({ ...contato, cep: soDigitos(e.target.value) })}
                    inputMode="numeric"
                    maxLength={8}
                  />
                </div>
              </div>

              {quadro.contact_id && (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={aplicarNoCadastro}
                    onChange={(e) => setAplicarNoCadastro(e.target.checked)}
                  />
                  <span>
                    <span className="block font-medium">{t("Salvar também no cadastro do cliente")}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t(
                        "Assim a próxima nota já sai certa. Desmarcado, a correção vale só para esta nota.",
                      )}
                    </span>
                  </span>
                </label>
              )}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("Itens")} ({itens.length})
              </legend>
              {itens.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("Sem itens para corrigir nesta nota.")}
                </p>
              )}
              <div className="space-y-3">
                {itens.map((form, pos) => {
                  const original = quadro.itens[pos]!;
                  return (
                    <div key={form.order_item_id} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {form.codigo} · {original.quantidade} un
                        </span>
                        {original.ajustado && (
                          <Badge variant="info" className="text-[10px]">
                            {t("corrigido nesta nota")}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1 sm:col-span-2">
                          <Label htmlFor={`item-desc-${pos}`} className="text-xs">
                            {t("Descrição")}
                          </Label>
                          <Input
                            id={`item-desc-${pos}`}
                            value={form.descricao}
                            onChange={(e) => {
                              const lista = [...itens];
                              lista[pos] = { ...form, descricao: e.target.value };
                              setItens(lista);
                            }}
                            maxLength={120}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-3">
                          <div className="space-y-1">
                            <Label htmlFor={`item-ncm-${pos}`} className="text-xs">
                              {t("NCM")}
                            </Label>
                            <Input
                              id={`item-ncm-${pos}`}
                              value={form.ncm}
                              onChange={(e) => {
                                const lista = [...itens];
                                lista[pos] = { ...form, ncm: soDigitos(e.target.value) };
                                setItens(lista);
                              }}
                              inputMode="numeric"
                              maxLength={8}
                              placeholder={original.ncm_do_cadastro ?? "00000000"}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`item-cfop-${pos}`} className="text-xs">
                              {t("CFOP")}
                            </Label>
                            <Input
                              id={`item-cfop-${pos}`}
                              value={form.cfop}
                              onChange={(e) => {
                                const lista = [...itens];
                                lista[pos] = { ...form, cfop: soDigitos(e.target.value) };
                                setItens(lista);
                              }}
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="5102"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`item-un-${pos}`} className="text-xs">
                              {t("Unidade")}
                            </Label>
                            <Input
                              id={`item-un-${pos}`}
                              value={form.unidade}
                              onChange={(e) => {
                                const lista = [...itens];
                                lista[pos] = { ...form, unidade: e.target.value.toUpperCase() };
                                setItens(lista);
                              }}
                              maxLength={6}
                              placeholder="UN"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "A correção vale para esta nota. Para valer nas próximas, ajuste o cadastro do produto.",
                )}
              </p>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="ajuste-complementares">{t("Informações complementares")}</Label>
              <textarea
                id="ajuste-complementares"
                className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={complementares}
                onChange={(e) => setComplementares(e.target.value)}
                maxLength={5000}
                placeholder={t("Texto que sai em «Informações complementares» no DANFE.")}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={aoFechar} disabled={salvando !== null}>
                {t("Cancelar")}
              </Button>
              <Button
                variant="outline"
                onClick={() => void salvar(false)}
                disabled={salvando !== null}
              >
                {salvando === "salvar" ? t("Salvando…") : t("Só salvar")}
              </Button>
              <Button onClick={() => void salvar(true)} disabled={salvando !== null}>
                {salvando === "reenviar" ? t("Enviando…") : t("Salvar e reenviar")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
