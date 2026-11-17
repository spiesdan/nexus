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
import {
  type CadastroPublico,
  type PlanoDeCorrecao,
  planejarCorrecaoAutomatica,
  resumirPlano,
} from "@/lib/fiscal/correcao-automatica";
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
  /** Consulta ao cadastro público em andamento — desabilita o botão e diz "consultando". */
  const [consultando, setConsultando] = React.useState(false);
  /** IE preenchida pela consulta, e não digitada: a tela diz de onde ela veio. */
  const [ieVeioDoCnpj, setIeVeioDoCnpj] = React.useState(false);
  const [avisoDaBusca, setAvisoDaBusca] = React.useState<string | null>(null);
  /** O cadastro público consultado — a fonte do plano de correção. */
  const [cadastroPublico, setCadastroPublico] = React.useState<CadastroPublico | null>(null);
  /** O plano pendente de revisão: mudanças propostas + o que a máquina não resolve. */
  const [plano, setPlano] = React.useState<PlanoDeCorrecao | null>(null);
  /** Última combinação CNPJ:UF consultada — evita repetir a chamada em cada render. */
  const cadastroConsultado = React.useRef<string | null>(null);
  /** A mesma chave, em estado: `cadastroAtual` é calculado no render, e ler ref no
   * render é proibido pelo React Compiler (e daria plano com dado de outro CNPJ). */
  const [chaveConsultada, setChaveConsultada] = React.useState<string | null>(null);
  /**
   * O cadastro só vale para o CNPJ:UF de agora. Trocar o documento no campo
   * sem consultar de novo usaria o cadastro do cliente ANTERIOR para preencher
   * o endereço — e isso grava endereço errado na nota. Chave diferente = nulo.
   */
  const cadastroAtual =
    contato &&
    chaveConsultada ===
      `${soDigitos(contato.documento ?? "")}:${(contato.uf ?? "").trim().toUpperCase()}`
      ? cadastroPublico
      : null;

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

  /**
   * CONSULTA O CADASTRO PÚBLICO — a fonte de tudo que a máquina consegue
   * preencher sozinha (IE, endereço, razão social).
   *
   * Devolve o cadastro para quem chamou, e guarda em estado porque o plano é
   * montado a partir dele. Três regras:
   *
   * 1. **Sem CNPJ + UF não há o que consultar.** A UF importa porque IE de
   *    outro estado é rejeição garantida — a rota só devolve a IE da UF pedida.
   * 2. **Uma consulta por CNPJ:UF.** O mesmo par não vai à rede duas vezes
   *    (abrir o diálogo já dispara a busca); trocar documento ou UF invalida.
   * 3. **Fonte fora do ar não vira erro da nota.** Aviso na tela, campo à mão.
   */
  async function consultarCadastro(origem: "auto" | "manual"): Promise<CadastroPublico | null> {
    if (!contato) return null;
    const digitos = soDigitos(contato.documento ?? "");
    const uf = (contato.uf ?? "").trim().toUpperCase();
    if (digitos.length !== 14 || uf.length !== 2) {
      if (origem === "manual") {
        toast.error(t("Informe o CNPJ e a UF do destinatário para consultar o cadastro."));
      }
      return null;
    }
    const chave = `${digitos}:${uf}`;
    if (origem === "auto" && cadastroConsultado.current === chave) return cadastroPublico;
    cadastroConsultado.current = chave;
    setChaveConsultada(chave);

    setConsultando(true);
    setAvisoDaBusca(null);
    try {
      const resposta = await apiClient.get<{ data: CadastroPublico }>(
        `/api/v1/fiscal/cadastro-do-cnpj?cnpj=${digitos}&uf=${uf}`,
      );
      const dados = resposta.data;
      setCadastroPublico(dados);
      if (!dados.ie) {
        // Campo vazio sem explicação é o que faz o operador reenviar e tomar a
        // mesma rejeição. O aviso diz qual das duas situações é o caso.
        setAvisoDaBusca(
          dados.ufs_com_inscricao.length > 0
            ? `${t("O CNPJ tem IE ativa em")} ${dados.ufs_com_inscricao.join(", ")}, ${t(
                "mas o destinatário está em",
              )} ${uf}. ${t("Confira a UF ou informe ISENTO.")}`
            : t(
                "Nenhuma IE publicada para este CNPJ. Se a empresa é isenta de inscrição estadual, escreva ISENTO.",
              ),
        );
      }
      return dados;
    } catch {
      setAvisoDaBusca(
        t("Não consegui consultar o cadastro agora — preencha à mão e tente de novo."),
      );
      return null;
    } finally {
      setConsultando(false);
    }
  }

  /** Monta o plano a partir do que está na tela + o cadastro consultado. */
  function planejar(cadastro: CadastroPublico | null): PlanoDeCorrecao | null {
    if (!contato) return null;
    return planejarCorrecaoAutomatica({
      destinatario: contato,
      itens: itens.map((form, pos) => ({
        order_item_id: form.order_item_id,
        descricao: form.descricao,
        ncm: form.ncm,
        cfop: form.cfop,
        unidade: form.unidade,
        ncm_do_cadastro: quadro?.itens[pos]?.ncm_do_cadastro ?? null,
      })),
      cadastro,
    });
  }

  /**
   * CORRIGIR AUTOMATICAMENTE — consulta (se preciso) e mostra o plano.
   *
   * Nada é gravado nem aplicado aqui: o operador vê o que muda, de onde veio e
   * o que a máquina NÃO consegue resolver, e então aplica nos campos. Salvar
   * continua sendo o botão de salvar — corrigir não é emitir.
   */
  async function corrigirAutomaticamente() {
    const cadastro = cadastroAtual ?? (await consultarCadastro("manual"));
    if (!cadastro) return;
    const proposto = planejar(cadastro);
    if (!proposto) return;
    setPlano(proposto);
  }

  /** Botão ao lado do campo de IE: consulta e preenche só se o campo está vazio. */
  async function buscarIePeloCnpj() {
    const cadastro = await consultarCadastro("manual");
    if (!cadastro) return;
    if (!cadastro.ie) {
      const proposto = planejar(cadastro);
      if (proposto) setPlano(proposto);
      return;
    }
    const jaTem = (contato?.ie ?? "").trim() !== "";
    setContato((atual) => {
      if (!atual) return atual;
      // Nunca pisa no que a pessoa digitou — nem quando ela digitou "ISENTO".
      if ((atual.ie ?? "").trim() !== "") return atual;
      return { ...atual, ie: cadastro.ie };
    });
    setIeVeioDoCnpj(true);
    toast[jaTem ? "info" : "success"](
      jaTem
        ? `${t("O cadastro público tem IE")} ${cadastro.ie} — ${t("o campo já estava preenchido e não foi alterado.")}`
        : `${t("IE preenchida pelo CNPJ")} (${contato?.uf ?? ""}) — ${t("confira antes de reenviar.")}`,
    );
  }

  /**
   * Aplica o plano NO ESTADO da tela — sem salvar. Depois disso o operador
   * confere campo a campo e usa "Salvar" / "Salvar e reenviar" como sempre.
   */
  function aplicarPlano() {
    if (!plano) return;
    const total = plano.mudancas.length;
    if (Object.keys(plano.destinatario).length > 0) {
      setContato((atual) => (atual ? { ...atual, ...plano.destinatario } : atual));
      if (plano.mudancas.some((m) => m.campo === "ie")) setIeVeioDoCnpj(true);
    }
    if (plano.itens.length > 0) {
      setItens((atual) =>
        atual.map((form) => {
          const mudanca = plano.itens.find((i) => i.order_item_id === form.order_item_id);
          if (!mudanca) return form;
          return {
            ...form,
            ...(mudanca.ncm ? { ncm: mudanca.ncm } : {}),
            ...(mudanca.cfop ? { cfop: mudanca.cfop } : {}),
            ...(mudanca.unidade ? { unidade: mudanca.unidade } : {}),
          };
        }),
      );
    }
    toast.success(
      `${t("Preenchido")}: ${total} ${total === 1 ? t("campo") : t("campos")}. ${t(
        "Confira antes de reenviar.",
      )}`,
    );
    setPlano(null);
  }

  // Ao abrir a nota, se falta cadastro do destinatário, o sistema já consulta e
  // deixa o plano pronto para revisão. A guarda por CNPJ:UF impede a repetição.
  React.useEffect(() => {
    if (!aberto || !contato || !quadro) return;
    const digitos = soDigitos(contato.documento ?? "");
    const uf = (contato.uf ?? "").trim();
    const faltaAlgo =
      (contato.ie ?? "").trim() === "" ||
      contato.logradouro.trim() === "" ||
      contato.numero.trim() === "" ||
      contato.bairro.trim() === "" ||
      contato.cidade.trim() === "" ||
      uf === "" ||
      soDigitos(contato.cep).length !== 8;
    if (!faltaAlgo || digitos.length !== 14 || uf.length !== 2) return;
    let vivo = true;
    // `consultarCadastro` liga o indicador de "consultando" no início; o plano
    // nasce da resposta da rede. Não há como evitar o setState dentro do efeito
    // — a guarda `vivo` impede atualizar componente desmontado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void consultarCadastro("auto").then((cadastro) => {
      if (!vivo || !cadastro) return;
      const proposto = planejar(cadastro);
      if (proposto && proposto.mudancas.length > 0) setPlano(proposto);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda quando o quadro abre; a chave da rede é CNPJ:UF, guardada em `cadastroConsultado`
  }, [aberto, quadro]);

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
        reenviar ? t("Correção salva — a nota voltou para a fila.") : t("Correção salva."),
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

            <div className="flex flex-wrap items-start justify-between gap-2">
              {falta.length > 0 ? (
                <p className="flex-1 rounded-lg border border-border bg-surface p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-text">{t("Falta para a nota sair")}: </span>
                  {falta.join(" · ")}
                </p>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={consultando}
                onClick={() => void corrigirAutomaticamente()}
                title={t("Consulta o cadastro público e propõe o que dá para preencher sozinho")}
              >
                {consultando ? t("Consultando…") : t("Corrigir automaticamente")}
              </Button>
            </div>

            {plano && (
              <section
                aria-labelledby="plano-titulo"
                className="rounded-lg border border-info/40 bg-info-bg p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p id="plano-titulo" className="text-sm font-medium text-text">
                    {t("Correção automática")} — {resumirPlano(plano)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {plano.mudancas.length > 0 && (
                      <Button type="button" size="sm" onClick={aplicarPlano}>
                        {t("Aplicar nos campos")}
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setPlano(null)}>
                      {t("Dispensar")}
                    </Button>
                  </div>
                </div>
                {plano.mudancas.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {plano.mudancas.map((m) => (
                      <li key={`${m.campo}-${m.rotulo}`}>
                        <span className="font-medium text-text">{m.rotulo}</span>
                        {": "}
                        {m.de ? `${m.de} → ` : `${t("vazio")} → `}
                        <span className="font-mono text-text">{m.para}</span>
                        {" — "}
                        {m.motivo}
                      </li>
                    ))}
                  </ul>
                )}
                {plano.pendencias.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-warning-fg">
                    {plano.pendencias.map((pd) => (
                      <li key={`${pd.campo}-${pd.acao}`}>
                        <span className="font-medium">{pd.rotulo}</span>
                        {": "}
                        {pd.motivo}
                        {" — "}
                        {pd.acao}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
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
                  <div className="flex gap-2">
                    <Input
                      id="ajuste-ie"
                      value={contato.ie ?? ""}
                      onChange={(e) => {
                        setContato({ ...contato, ie: e.target.value });
                        setIeVeioDoCnpj(false);
                      }}
                      placeholder={t("Número da IE ou ISENTO")}
                      aria-describedby="ajuste-ie-ajuda"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={consultando}
                      onClick={() => void buscarIePeloCnpj()}
                      title={t("Consulta o cadastro público pelo CNPJ e preenche a IE da UF")}
                    >
                      {consultando ? t("Buscando…") : t("Buscar pelo CNPJ")}
                    </Button>
                  </div>
                  <p id="ajuste-ie-ajuda" className="text-[11px] text-muted-foreground">
                    {ieVeioDoCnpj
                      ? t(
                          "Preenchida pelo cadastro público a partir do CNPJ — confira antes de reenviar.",
                        )
                      : t(
                          "Rejeição 232 é isto: o CNPJ tem IE ativa na UF e o cadastro está sem ela.",
                        )}
                  </p>
                  {avisoDaBusca ? (
                    <p role="status" className="text-[11px] text-warning-fg">
                      {avisoDaBusca}
                    </p>
                  ) : null}
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
                    <span className="block font-medium">
                      {t("Salvar também no cadastro do cliente")}
                    </span>
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
