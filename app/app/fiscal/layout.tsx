import { NavFiscal } from "./_components/NavFiscal";

/**
 * A casca do módulo fiscal: uma faixa de subtelas + a tela.
 *
 * O cabeçalho (`NexusPageHeader`) fica em cada página, porque título e ações
 * mudam; o que não muda é o caminho de volta para as outras doze.
 */
export default function FiscalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <NavFiscal />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
