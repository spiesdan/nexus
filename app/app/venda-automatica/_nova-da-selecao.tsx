"use client";

/**
 * NOVA CAMPANHA DA SELEÇÃO — a aba que o botão "Criar venda automática" abre.
 *
 * ═══ O FLUXO ═══════════════════════════════════════════════════════════════
 *
 * Prospecção (filtro de cidade/categoria, com ou sem marcação manual) →
 * esta aba (as empresas + a mensagem padrão + o cooldown) → campanha criada
 * com lista fechada → o cron manda uma por vez, espaçadas.
 *
 * Antes (0269), o botão criava a campanha DIRETO, sem texto e sem lista: a
 * mensagem era gerada pela IA a cada envio e a fila era preenchida pelo
 * filtro. O "criar" era um ato de fé — o dono só descobria o que saiu quando
 * o cliente recebia.
 *
 * ═══ DE ONDE VEM A LISTA ══════════════════════════════════════════════════
 *
 * Dois caminhos, e a aba mostra qual está valendo:
 *
 * - `ids`: marcação manual na prospecção (até 100 — acima disso a URL
 *   estouraria, e o botão manda o filtro em vez dos ids).
 * - filtro (cidade + categoria): a aba busca na API e pagina de 200 em 200
 *   até 500, que é o teto da campanha. Acima disso, avisa que o resto ficou
 *   de fora — em vez de criar campanha que finge cobrir o que não cobre.
 *
 * ═══ POR QUE A MENSAGEM É OBRIGATÓRIA AQUI ═══════════════════════════════
 *
 * Porque esta aba existe para isso. Sem mensagem, a campanha cai no gerar
 * IA — que é o comportamento do diálogo "Nova campanha", não deste. Misturar
 * os dois faria esta tela prometer texto fixo e entregar texto gerado.
 */
import * as React from "react";
import { useRouter } from "next/navigation";

import { nexusToast as toast } from "@/components/nexus-ui/feedback/nexus-toast";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { Prospect } from "@/lib/schemas/prospeccao";

export interface SelecaoInicial {
  cidade: string;
  uf: string;
  /**
   * VÁRIAS categorias. Era uma só até a prospecção aceitar multi-seleção —
   * mandar só a primeira faria a campanha nascer com um recorte menor que o
   * da tela, em silêncio.
   */
  categorias: string[];
  ids: string[];
}

const LIMITE_BUSCA = 200;
const TETO_CAMPANHA = 500;

export function NovaCampanhaDaSelecao({
  selecao,
  aoCriar,
}: {
  selecao: SelecaoInicial;
  aoCriar: (id: string) => void;
}) {
  const t = useT();
  const router = useRouter();

  const [empresas, setEmpresas] = React.useState<Prospect[]>([]);
  const [total, setTotal] = React.useState<number | null>(null);
  const [temMais, setTemMais] = React.useState(false);
  const [carregando, setCarregando] = React.useState(true);
  const [trazendoMais, setTrazendoMais] = React.useState(false);

  // O que a pessoa lê no título e no cabeçalho: uma categoria é o nome dela;
  // várias viram a contagem — a lista inteira estoura o título.
  const rotuloCategorias =
    selecao.categorias.length <= 1
      ? (selecao.categorias[0] ?? "")
      : `${selecao.categorias.length} categorias`;

  const [nome, setNome] = React.useState(
    `Venda ${selecao.cidade}${rotuloCategorias ? ` · ${rotuloCategorias}` : ""}`,
  );
  const [mensagem, setMensagem] = React.useState("");
  const [cooldown, setCooldown] = React.useState("60");
  const [limite, setLimite] = React.useState("");
  const [inicio, setInicio] = React.useState("09:00");
  const [fim, setFim] = React.useState("17:30");
  const [salvando, setSalvando] = React.useState(false);

  const carregar = React.useCallback(
    async (offset: number, acrescentar: boolean) => {
      const qs = new URLSearchParams();
      qs.set("limite", String(LIMITE_BUSCA));
      if (offset > 0) qs.set("offset", String(offset));
      if (selecao.ids.length > 0) {
        qs.set("ids", selecao.ids.join(","));
      } else {
        qs.set("cidade", selecao.cidade);
        if (selecao.uf) qs.set("estado", selecao.uf);
        for (const c of selecao.categorias) qs.append("categoria", c);
      }
      const corpo = await apiClient.get<{
        data: unknown;
        meta?: { total?: number; has_more?: boolean };
      }>(`/api/v1/prospecting/prospects?${qs.toString()}`);
      const lista = Array.isArray(corpo?.data) ? (corpo.data as Prospect[]) : [];
      setEmpresas((atual) => (acrescentar ? [...atual, ...lista] : lista));
      if (!acrescentar && typeof corpo?.meta?.total === "number") setTotal(corpo.meta.total);
      setTemMais(corpo?.meta?.has_more === true);
    },
    [selecao],
  );

  React.useEffect(() => {
    setCarregando(true);
    carregar(0, false)
      .catch((e) => showApiError(e))
      .finally(() => setCarregando(false));
  }, [carregar]);

  async function trazerMais() {
    setTrazendoMais(true);
    try {
      await carregar(empresas.length, true);
    } catch (e) {
      showApiError(e);
    } finally {
      setTrazendoMais(false);
    }
  }

  // O limite padrão é a lista inteira ("manda para todas"), não 30: quem veio
  // desta aba já escolheu o universo, e presumir cota menor seria decidir por
  // ele. Editável, como todo o resto.
  const limiteEfetivo = limite.trim() === "" ? Math.min(empresas.length, TETO_CAMPANHA) : Number(limite);
  const cooldownNum = Number(cooldown);

  async function criar() {
    const texto = mensagem.trim();
    if (texto === "") {
      toast.error(t("Escreva a mensagem padrão — sem ela, a IA gera uma por envio."));
      return;
    }
    if (!Number.isInteger(cooldownNum) || cooldownNum < 10 || cooldownNum > 3600) {
      toast.error(t("Cooldown entre 10 e 3600 segundos."));
      return;
    }
    if (!Number.isInteger(limiteEfetivo) || limiteEfetivo < 1 || limiteEfetivo > TETO_CAMPANHA) {
      toast.error(t(`Limite diário entre 1 e ${TETO_CAMPANHA}.`));
      return;
    }
    if (empresas.length === 0) {
      toast.error(t("Nenhuma empresa na seleção."));
      return;
    }
    setSalvando(true);
    try {
      const corpo = await apiClient.post<{ data: { id: string } | null }>(
        "/api/v1/automatic-sales/campaigns",
        {
          nome: nome.trim() || `Venda ${selecao.cidade}`,
          cidade: selecao.cidade,
          uf: selecao.uf || null,
          categorias: selecao.categorias,
          limite_diario: limiteEfetivo,
          janela_inicio: inicio,
          janela_fim: fim,
          followup_horas: [24, 48],
          mensagem_padrao: texto,
          cooldown_segundos: cooldownNum,
          prospect_ids: empresas.slice(0, TETO_CAMPANHA).map((e) => e.id),
        },
      );
      const id = corpo?.data?.id;
      if (!id) {
        toast.error(t("A campanha não voltou com id."));
        return;
      }
      toast.success(t("Campanha criada — as mensagens saem espaçadas pelo cooldown."));
      router.replace("/app/venda-automatica");
      aoCriar(id);
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  const comWhatsapp = empresas.filter((e) => e.whatsapp_potencial).length;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">
            {t("NOVA CAMPANHA DA SELEÇÃO")}
          </p>
          <p className="text-sm text-muted-foreground">
            {selecao.cidade}
            {selecao.uf ? `/${selecao.uf}` : ""}
            {rotuloCategorias ? ` · ${rotuloCategorias}` : ""} ·{" "}
            {carregando
              ? t("carregando empresas…")
              : total !== null
                ? t(`${empresas.length} de ${total} empresas`)
                : t(`${empresas.length} empresas`)}
            {` · ${comWhatsapp} ${t("com WhatsApp")}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => router.replace("/app/venda-automatica")}
        >
          {t("Fechar")}
        </Button>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">{t("Buscando as empresas do filtro…")}</p>
      ) : (
        <>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border p-2">
            {empresas.map((e) => (
              <div key={e.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{e.nome}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {e.categoria ?? "—"}
                </span>
                <span
                  className={`shrink-0 text-xs ${e.whatsapp_potencial ? "text-emerald-600" : "text-muted-foreground"}`}
                  title={e.telefone ?? t("Sem telefone")}
                >
                  {e.whatsapp_potencial ? "WhatsApp" : e.telefone ? t("só telefone") : t("sem fone")}
                </span>
              </div>
            ))}
          </div>
          {temMais && empresas.length < TETO_CAMPANHA && (
            <Button variant="outline" size="sm" onClick={() => void trazerMais()} disabled={trazendoMais}>
              {trazendoMais ? t("Buscando…") : t(`Trazer mais (faltam ${total !== null ? Math.max(0, total - empresas.length) : "?"})`)}
            </Button>
          )}
          {empresas.length >= TETO_CAMPANHA && (
            <p className="text-xs text-muted-foreground">
              {t(`Teto de ${TETO_CAMPANHA} por campanha: o resto fica para a próxima.`)}
            </p>
          )}
        </>
      )}

      <div className="space-y-1">
        <Label htmlFor="va-sel-nome">{t("Nome da campanha")}</Label>
        <Input id="va-sel-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="va-sel-mensagem">{t("Mensagem padrão (a mesma para todas)")}</Label>
        <Textarea
          id="va-sel-mensagem"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder={t("Olá! Aqui é da [loja]…")}
        />
        <p className="text-xs text-muted-foreground">
          {t("Quem responde entra na conversa no Inbox. Sem mensagem, a IA gera uma por envio.")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="va-sel-cooldown">{t("Cooldown entre envios (segundos)")}</Label>
          <Input
            id="va-sel-cooldown"
            inputMode="numeric"
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="va-sel-limite">{t("Limite por dia")}</Label>
          <Input
            id="va-sel-limite"
            inputMode="numeric"
            value={limite}
            placeholder={String(Math.min(empresas.length, TETO_CAMPANHA))}
            onChange={(e) => setLimite(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="va-sel-inicio">{t("Das")}</Label>
            <Input id="va-sel-inicio" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="va-sel-fim">{t("Até")}</Label>
            <Input id="va-sel-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void criar()} disabled={salvando || carregando}>
          {salvando ? t("Criando…") : t(`Criar e enfileirar ${empresas.length} empresas`)}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t(`As mensagens saem uma a cada ${Number.isInteger(cooldownNum) ? cooldownNum : 60}s. Sem sessão conectada, a fila espera.`)}
        </p>
      </div>
    </Card>
  );
}
