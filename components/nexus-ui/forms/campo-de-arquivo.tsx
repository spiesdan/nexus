"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

/**
 * CAMPO DE ARQUIVO EM PORTUGUÊS.
 *
 * ─── O DEFEITO QUE ELE FECHA ──────────────────────────────────────────────
 *
 * `<input type="file">` desenha o próprio botão com o texto do NAVEGADOR:
 * "Choose File / No file chosen" no Chrome em inglês, mesmo com o produto todo
 * em pt-BR. Não existe atributo que traduza esse rótulo — a única saída é
 * desenhar o gatilho e deixar o input por cima, invisível. Era o que a tela de
 * marca mostrava em 20/11/2026 (`app_settings_marca_light_390.png`).
 *
 * ─── POR QUE O INPUT FICA POR CIMA, E NÃO `sr-only` ──────────────────────
 *
 * Um input de 1×1 px "funciona" para `setInputFiles`, mas não para o dedo: o
 * alvo real é o rótulo, e clicar nele abriria o seletor por acidente em alguns
 * navegadores. Aqui o input cobre exatamente o botão (`inset-0`, `opacity-0`):
 * o alvo é grande, o clique é o nativo do navegador (sem `.click()` sintético,
 * que alguns bloqueiam), e `toBeVisible()` do Playwright continua verdadeiro
 * porque a caixa tem tamanho — o teste de hidratação de `marca-logo` depende
 * disso. `tabIndex` fica no input (o botão é só a pintura) para não haver dois
 * stops de teclado no mesmo controle.
 *
 * O nome do arquivo escolhido aparece ao lado e é anunciado (`aria-live`) —
 * antes, quem escolhia via "No file chosen" até o fim do upload.
 */
export function CampoDeArquivo({
  id,
  accept,
  disabled = false,
  aoEscolher,
  rotulo = "Escolher arquivo",
  descricaoVazia = "Nenhum arquivo escolhido",
}: {
  id: string;
  accept?: string;
  disabled?: boolean;
  aoEscolher: (arquivo: File) => void;
  rotulo?: string;
  descricaoVazia?: string;
}) {
  const t = useT();
  const entrada = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="relative inline-flex shrink-0">
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          // A pintura não recebe o clique — quem recebe é o input por cima.
          className="pointer-events-none"
        >
          {t(rotulo)}
        </Button>
        <input
          ref={entrada}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-label={t(rotulo)}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo) {
              setNome(arquivo.name);
              aoEscolher(arquivo);
            }
            // Limpa a seleção para que escolher O MESMO arquivo de novo dispare
            // `change` outra vez (depois de remover o logo, por exemplo).
            evento.target.value = "";
          }}
        />
      </span>
      <span aria-live="polite" className="text-sm text-text-muted">
        {nome ?? t(descricaoVazia)}
      </span>
    </div>
  );
}
