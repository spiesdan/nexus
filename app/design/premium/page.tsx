import { AnimatedSidebarPreview } from "@/components/previews/motion/animated-sidebar.preview";

export default function PremiumProofPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Prova beUI 1:1 — código exato da doc, sem adaptar marca, i18n ou navegação.
      </p>
      <AnimatedSidebarPreview />
    </div>
  );
}
