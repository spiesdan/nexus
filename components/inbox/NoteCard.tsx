"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { format } from "date-fns";
import { useT } from "@/hooks/i18n/useT";
import { Trash } from "@/lib/ui/icons";
import type { Note } from "@/lib/types/messaging";

interface Props {
  note: Note;
  onDelete?: () => void;
}

/** Onda 5.2: nota interna inline no thread — nunca vai ao cliente, destaque âmbar (token `warning`). */
export function NoteCard({ note, onDelete }: Props) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const time = format(new Date(note.created_at), "HH:mm", { locale: localeDaData });

  return (
    <div className="group flex w-full justify-end py-1">
      {/* `.note` da referência: âncora à direita, largura da bolha de saída,
          12px de raio e o card âmbar DASHED da folha — respiro 10/12 na grade
          de 4px da §15 (folha: 9/13), origem em 12px/600 a 75% de opacidade,
          sem caixa de ícone nem "uppercase". */}
      <div className="max-w-[min(520px,78%)] rounded-[12px] border border-dashed border-[#b98f57] bg-[#e7c9a3] px-3 py-2.5 text-sm text-[#3a2a14]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold opacity-75">
            <span>{note.created_by_name ?? t("Alguém")}</span>
            <span aria-hidden>·</span>
            <span>{t("Nota interna · só o time vê")}</span>
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="opacity-0 transition-opacity hover:text-[#7a1f12] group-hover:opacity-100"
              aria-label={t("Excluir nota")}
            >
              <Trash size={12} weight="bold" />
            </button>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words leading-snug">{note.body}</p>
        <div className="mt-1 text-right text-[11px] opacity-70">{time}</div>
      </div>
    </div>
  );
}
