"use client";

import { useT } from "@/hooks/i18n/useT";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NexusConfirmDialog } from "@/components/nexus-ui/forms/NexusConfirmDialog";
import { Plus, PencilSimple, Trash } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useMessageTemplates, type MessageTemplate } from "@/hooks/inbox/useMessageTemplates";
import { TemplateFormDialog } from "./TemplateFormDialog";

const TEMPLATES_KEY = ["message-templates"];

interface Props {
  canShare: boolean;
  currentUserId: string;
}

export function TemplatesClient({ canShare, currentUserId }: Props) {
  const t = useT();
  const { data: templates, isLoading } = useMessageTemplates();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/message-templates/${id}`),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATES_KEY }),
  });
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MessageTemplate | null>(null);
  const [excluindo, setExcluindo] = React.useState<MessageTemplate | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (template: MessageTemplate) => {
    setEditing(template);
    setFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex sm:justify-end">
        <Button type="button" onClick={openNew} className="w-full sm:w-auto">
          <Plus /> {t("Novo template")}
        </Button>
      </div>
      {!templates?.length ? (
        <p className="text-sm text-muted-foreground">{t("Nenhum template ainda.")}</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => {
            // Só quem pode editar/apagar pela RLS vê as ações: o dono do
            // pessoal, ou manager+ no compartilhado (owner null). Sem isto, um
            // agent veria botões que o backend rejeita (404/nada apagado).
            const canModify =
              template.owner_user_id === currentUserId ||
              (template.owner_user_id === null && canShare);
            return (
              <li
                key={template.id}
                className="flex items-start justify-between gap-4 rounded-2xl border bg-card p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{template.title}</span>
                    <Badge variant={template.owner_user_id ? "neutral" : "default"}>
                      {t(template.owner_user_id ? "Pessoal" : "Compartilhado")}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{template.body}</p>
                </div>
                {canModify && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("Editar template")}
                      onClick={() => openEdit(template)}
                    >
                      <PencilSimple />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("Excluir template")}
                      onClick={() => setExcluindo(template)}
                    >
                      <Trash />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        canShare={canShare}
        template={editing}
      />
      {excluindo && (
        <NexusConfirmDialog
          aberto
          aoFechar={(o) => !o && setExcluindo(null)}
          title={t("Excluir este template?")}
          description={t("Essa ação não pode ser desfeita.")}
          onConfirm={() =>
            del.mutate(excluindo.id, {
              onSuccess: () => toast.success(t("Template excluído.")),
            })
          }
        />
      )}
    </div>
  );
}
