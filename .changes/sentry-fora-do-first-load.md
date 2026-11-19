---
impacto: nada_mudou
secao: corrigido
titulo: Sentry deixa de pesar no carregamento inicial das telas
---

O SDK do Sentry era importado estaticamente pelo entry de instrumentação e pelos
boundaries de erro, então entrava no first load de toda rota — inclusive login.
Agora o SDK é carregado sob demanda depois da hidratação; uma fila síncrona
guarda erros e rejeições da janela inicial e os entrega assim que ele
inicializa. O Replay continua ligado, mas fora do caminho crítico.

Medido no mesmo método do doc 42: inbox cai de 592 KB para 503 KB gzip (−15%),
login de 318 KB para 228 KB (−28%), e nenhuma das seis rotas principais
regrediu. O alvo de 400 KB do inbox ainda não foi atingido; faltam 103 KB, com
os ofensores restantes registrados no doc 43.
