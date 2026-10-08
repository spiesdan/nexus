---
impacto: nada_mudou
secao: corrigido
titulo: A busca de empresas volta a encontrar resultados
---

A busca de empresas ficava parada em "Progresso 0%", sem encontrar nada e sem
mostrar erro, mesmo com o resto do sistema funcionando.

O serviço público de mapas que responde a essas buscas estava indisponível, e o
sistema insistia no mesmo serviço em vez de tentar os outros. Agora ele passa
para o próximo serviço quando um deixa de responder, e foi incluído um serviço
reserva que está no ar.
