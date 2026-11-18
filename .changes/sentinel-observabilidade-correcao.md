---
impacto: nada_mudou
secao: corrigido
titulo: Sentinel avisa quando uma correção aprovada ficou sem reversão ou com aprovação vencida
---

Duas situações que a tela de correção não conseguia mostrar sozinha agora viram
ocorrência:

- **Correção sem reversão:** a antecipação foi aplicada, mas o job saiu do
  estado que a reversão exigia (o worker reclamou, o horário mudou ou o job foi
  removido). Reverter seria mentira; o Sentinel registra o fato para alguém
  conferir o resultado.
- **Aprovação vencida:** a ocorrência está aprovada além da janela de 5 min do
  plano revisado. A execução exige nova simulação e confirmação; o alerta pede
  a revalidação.

Nenhum dos dois executam, revertem ou aprovam: são observação. A correção
continua sendo o caminho manual aprovado da versão anterior.
