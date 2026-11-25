---
impacto: nada_mudou
secao: corrigido
titulo: Job do aviso no Discord declarado no mapa de gatilhos
---

O workflow novo (`discord-release.yml::avisar`) entrou sem linha em `GATILHO_ESPERADO`, e o gate que impede job de entrega de ser desligado em silêncio reprovou a suíte. Entrada acrescentada com `condicao: null` (roda sempre que a tag existe) e o efeito escrito: sem ele, a versão sobe calada — foi o que aconteceu com a 1.72.1 e a 2.0.0.
