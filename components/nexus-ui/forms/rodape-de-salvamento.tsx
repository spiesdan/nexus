"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

/**
 * O RODAPÉ DE UM FORMULÁRIO DE CONFIGURAÇÃO.
 *
 * ─── O QUE ELE PADRONIZA, E POR QUE ISSO É DEFEITO DE PRODUTO ─────────────
 *
 * Medido nas telas de `/app/settings`: só `atendimento` desabilitava o
 * "Salvar" quando nada tinha mudado. Em `tenant`, `profile` e `marca` o botão
 * nascia habilitado numa tela recém-aberta, ficava habilitado depois de
 * salvar, e não havia sinal nenhum de "há mudança aqui". Quem edita e sai pela
 * sidebar perde o texto sem aviso — o mesmo defeito que `beforeunload` resolve
 * para recarregar/fechar, e que a frase resolve para o resto.
 *
 * A regra é uma só, e agora mora num lugar:
 *   - sem mudança → botão desabilitado;
 *   - com mudança → botão habilitado + "Há mudanças não salvas.";
 *   - salvando → "Salvando…", botão travado;
 *   - falha que a tela não sabe nomear → texto técnico ao lado do botão.
 *
 * Não decide negócio nenhum: recebe `sujo` de quem conhece o formulário.
 */
export function RodapeDeSalvamento({
  sujo,
  salvando = false,
  podeSalvar = true,
  erroTecnico = null,
  rotulo = "Salvar",
  className,
}: {
  sujo: boolean;
  salvando?: boolean;
  /** Validação local (cor inválida, etc.) — independente de `sujo`. */
  podeSalvar?: boolean;
  erroTecnico?: string | null;
  rotulo?: string;
  className?: string;
}) {
  const t = useT();

  return (
    <div className={`flex flex-wrap items-center justify-end gap-x-3 gap-y-2 ${className ?? ""}`}>
      {erroTecnico ? (
        <span className="font-mono text-xs text-text-muted">{erroTecnico}</span>
      ) : null}
      {/*
        `role="status"` e não `alert`: não é erro, é estado. Leitor de tela
        anuncia a mudança sem interromper o que a pessoa está digitando.
      */}
      {sujo && !salvando ? (
        <span role="status" className="text-xs text-muted-foreground">
          {t("Há mudanças não salvas.")}
        </span>
      ) : null}
      <Button
        type="submit"
        // 40px: o alvo mínimo que a varredura do módulo cobra. O `h-9` (36px)
        // do botão padrão fica para ações secundárias.
        className="h-10 w-full px-5 sm:w-auto"
        disabled={salvando || !sujo || !podeSalvar}
      >
        {salvando ? t("Salvando…") : t(rotulo)}
      </Button>
    </div>
  );
}

/**
 * AVISO DE SAÍDA COM MUDANÇA NÃO SALVA.
 *
 * `beforeunload` cobre recarregar, fechar a aba e navegar para fora do app —
 * os casos em que o navegador perde o estado sem passar pelo Next. Navegação
 * interna (sidebar) não dispara este evento; para ela, o sinal é a frase do
 * rodapé. Um interceptador de clique em `<a>` foi descartado: ele roubaria a
 * navegação do produto inteiro por causa de um formulário.
 */
export function useAvisoDeSaida(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const aoSair = (evento: BeforeUnloadEvent) => {
      // `preventDefault` é o caminho moderno; `returnValue` é o que o Safari e
      // versões antigas leem. Os dois juntos custam uma linha e cobrem o
      // navegador de quem usa o produto, não o do desenvolvedor.
      evento.preventDefault();
      evento.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [ativo]);
}
