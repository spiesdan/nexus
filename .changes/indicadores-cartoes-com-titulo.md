---
impacto: nada_mudou
secao: alterado
titulo: Os cartões de Indicadores dizem o que são antes de carregar
---

Quem abria **Indicadores** numa VPS via três retângulos cinza sem nome no meio
da página — o resumo inteligente, o funil e a atividade ficavam como buracos,
e não dava para saber o que ia aparecer ali. O carregamento agora desenha o
**cartão de verdade**, com o título no mesmo lugar e no mesmo tamanho do
conteúdo final: só as linhas de baixo trocam quando os dados chegam, então a
página também deixa de pular.

O componente que faz isso (`NexusCardSkeleton`) passa a existir no catálogo de
esqueletos, para as próximas telas não repetirem o retângulo anônimo.
