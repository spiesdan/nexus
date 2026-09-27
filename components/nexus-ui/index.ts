/**
 * Barril público do Nexus Design System.
 * Importar sempre daqui (`@/components/nexus-ui`), nunca do caminho fundo.
 */
export { nexusTokens, nexusTableContainerClass, nexusTouchTargetClass } from "@/lib/nexus/tokens";
export { NexusLoading } from "@/components/nexus-ui/feedback/NexusLoading";
export {
  NexusTableSkeleton,
  NexusCardsSkeleton,
  NexusPageSkeleton,
} from "@/components/nexus-ui/feedback/NexusSkeleton";
export { NexusEmptyState } from "@/components/nexus-ui/feedback/NexusEmptyState";
export { NexusErrorState } from "@/components/nexus-ui/feedback/NexusErrorState";
export { nexusToast } from "@/components/nexus-ui/feedback/nexus-toast";
export { NexusConfirmDialog } from "@/components/nexus-ui/forms/NexusConfirmDialog";
export {
  ConfirmacaoProvider,
  useConfirmar,
} from "@/components/nexus-ui/forms/ConfirmacaoProvider";
export { NexusFormDialog } from "@/components/nexus-ui/forms/NexusFormDialog";
export { FormField } from "@/components/nexus-ui/forms/form-field";
export { NexusSteps } from "@/components/nexus-ui/forms/NexusSteps";
export { NexusQuantityStepper } from "@/components/nexus-ui/forms/NexusQuantityStepper";
export { NexusDataTable, type NexusDataState } from "@/components/nexus-ui/data/NexusDataTable";
export { NexusPageHeader } from "@/components/nexus-ui/layout/NexusPageHeader";
export { NexusKpi, NexusKpiGrid } from "@/components/nexus-ui/kpi/nexus-kpi";
export { CrmSalesChart } from "@/components/nexus-ui/crm/crm-sales-chart";
export {
  NexusAiBriefing,
  NexusAiSuggestion,
  type NexusInsight,
} from "@/components/nexus-ui/ai/NexusAi";
export { NexusAiApproval } from "@/components/nexus-ui/ai/NexusAiApproval";
export { NexusAiSources, type NexusSource } from "@/components/nexus-ui/ai/NexusAiSources";
export { NexusAiContextMeter } from "@/components/nexus-ui/ai/NexusAiContextMeter";
export { NexusIntelligence } from "@/components/nexus-ui/intelligence/NexusIntelligence";
export { NexusGraphCanvas } from "@/components/nexus-ui/intelligence/NexusGraphCanvas";
export {
  buildIntelligenceGraph,
  buildSelectionContext,
  explainNode,
  priorizarClientes,
  type NexusGraph,
  type NexusGraphNode,
  type NexusGraphEdge,
  type NexusNodeKind,
  type NexusSelectionContext,
} from "@/lib/nexus/graph";
