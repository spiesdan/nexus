---
impacto: capacidade_nova
secao: adicionado
titulo: Notas de compra entram pela SEFAZ e só viram estoque depois da conferência
---

O sistema passa a receber **NF-e de entrada** — a nota do fornecedor — em vez de
esperar alguém baixar o XML e subir à mão. A distribuição DF-e da SEFAZ é
consultada pelo certificado A1 da empresa, e cada documento que chega fica
guardado com o XML original, os itens, os impostos e o histórico de eventos
(cancelamento e carta de correção inclusive).

O que muda na rotina de quem compra:

- **Recebimento automático.** Em *Fiscal → Configurações* você liga o
  recebimento, define de quanto em quanto tempo ele consulta a SEFAZ e, se
  quiser, a manifestação automática (a ciência da operação). O `scheduler` já
  entrega o ciclo pronto — não há cron para instalar.
- **Conferência antes de mover estoque.** A nota chega como **pendente**. Nada
  de estoque, produto ou conta a pagar se move até alguém aprovar a conferência.
  É um portão, não um aviso: a importação recusa nota não aprovada.
- **Associação item a item.** Cada item da nota pode ser apontado para um
  produto do seu catálogo, com busca. Essa escolha vence o casamento por código
  do fornecedor — e continua valendo quando a nota é ressincronizada.
- **13 telas em *Fiscal*** — visão geral com alertas (certificado vencendo,
  erro 656, última sincronização), notas, pendentes de conferência, XMLs,
  resumos, manifestações, fornecedores, produtos, eventos, relatórios e o
  histórico de cada sincronização.
- **Relatórios de entrada.** Compras por período, por fornecedor, por mês,
  produtos mais comprados e impostos — calculados sobre as notas já gravadas.

A segurança do cursor foi refeita junto: uma falha de gravação **não** avança o
NSU, então uma nota não se perde por erro passageiro; duas sincronizações
simultâneas não se atropelam (uma espera a outra), e o erro 656 da SEFAZ entra
em espera de uma hora em vez de insistir.

O módulo chega **desligado** e sem efeito sobre quem já usa o sistema: nada
muda até você enviar o certificado A1 e ativar o recebimento. A comunicação com
a SEFAZ depende das suas credenciais (certificado, CNPJ, IE e UF) — sem elas a
tela de configuração avisa o que falta e nenhuma consulta é feita.
