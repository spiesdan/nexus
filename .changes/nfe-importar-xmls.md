---
impacto: nada_mudou
secao: corrigido
titulo: Notas importa o histórico por XML, e a busca por NSU deixa de prometer o que a SEFAZ não entrega
---

O botão "Importar histórico do SEFAZ" ficava em NSU 0/0 para sempre. A causa
não era defeito de chamada: a distribuição de DF-e por NSU é do DESTINATÁRIO,
e a SEFAZ não devolve ao emitente as notas que ele mesmo emitiu (NT 2014.002).
Ela só distribui as notas recebidas, que é o que a aba Entradas já faz.

A aba Notas agora importa por XML: aceita os .xml ou o .zip exportados do
sistema antigo (Mercos, Odivix e afins), mostra quantas entraram, quantas já
existiam e o motivo de cada recusa — sem fechar o diálogo. O envio não fala
com a SEFAZ, então funciona sem sidecar e em homologação; a única régua é o
CNPJ do emitente, para não importar nota de terceiro.

Em homologação, a sincronização de entradas passa a dizer que a SEFAZ não
distribui notas reais naquele ambiente, em vez de responder "0 nova(s)" e
mandar esperar uma hora.
