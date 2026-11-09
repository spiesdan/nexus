"use client";
import { useT } from "@/hooks/i18n/useT";
import { templateMediaDoMetadata } from "@/lib/messaging/template-media";
import type { Message } from "@/lib/types/messaging";

import { AudioPlayer } from "./AudioPlayer";
import { DocumentCard } from "./DocumentCard";
import { ImageMedia } from "./ImageMedia";
import { StickerMedia } from "./StickerMedia";
import { VideoMedia } from "./VideoMedia";

/**
 * Dispatcher de mídia por message.type (Onda 1). Tipo com mídia mas sem
 * renderer dedicado (location/contact futuros) cai no DocumentCard —
 * sempre dá pro atendente baixar o arquivo.
 */
export function MediaRenderer({ message }: { message: Message }) {
  const t = useT();
  const isOutbound = message.direction === "outbound";
  switch (message.type) {
    case "image":
      return <ImageMedia messageId={message.id} alt={t("Imagem recebida")} />;
    case "sticker":
      return <StickerMedia messageId={message.id} />;
    case "audio":
      return <AudioPlayer messageId={message.id} isOutbound={isOutbound} />;
    case "video":
      return <VideoMedia messageId={message.id} />;
    case "contact":
      return null;
    case "template": {
      // O arquivo do cabeçalho mora em `metadata.template_media` (ver
      // lib/messaging/template-media.ts). Sem ele, template só tem texto.
      const midia = templateMediaDoMetadata(message.metadata);
      if (!midia) return null;
      if (midia.mime.startsWith("image/")) {
        return <ImageMedia messageId={message.id} alt={t("Imagem do modelo")} />;
      }
      if (midia.mime.startsWith("video/")) {
        return <VideoMedia messageId={message.id} />;
      }
      return (
        <DocumentCard
          messageId={message.id}
          mime={midia.mime}
          sizeBytes={null}
          storagePath={midia.path}
          isOutbound={isOutbound}
        />
      );
    }
    default:
      return (
        <DocumentCard
          messageId={message.id}
          mime={message.media_mime}
          sizeBytes={message.media_size_bytes}
          storagePath={message.media_storage_path}
          isOutbound={isOutbound}
        />
      );
  }
}
