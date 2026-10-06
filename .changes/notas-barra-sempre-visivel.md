---
impacto: correcao
secao: corrigido
titulo: A barra de ferramentas das notas fiscais aparece mesmo sem nota
---

A barra de ferramentas da tela de NF-e (Emitir nota, Exportar CSV, Importar
histórico do SEFAZ, NSU, modelo, Exporta XMLs, busca e filtros de período e
status) ficava dentro do ramo que só renderizava quando existia ao menos uma
nota fiscal.

Medido em produção em 06/10/2026: as tabelas fiscais estavam todas com zero
linhas, então a tela caía no estado vazio e escondia a barra inteira — os
botões eram invisíveis não por permissão nem por versão, mas porque não havia
nota nenhuma para exportar ou filtrar. Quem olhava a tela não tinha como
saber que as ferramentas existiam.

A barra agora renderiza sempre. O condicional passou a decidir só o corpo:
sem nota (estado vazio), sem resultado de filtro, ou a tabela.
