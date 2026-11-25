---
impacto: nada_mudou
secao: corrigido
titulo: Navegação por ruas volta a usar o OSRM público por padrão
---

O padrão de `OSRM_URL` voltou a ser `https://router.project-osrm.org`, como era antes da 2.0.0 — sem configurar nada, a cabine volta a desenhar rotas pelas ruas. Instalações que quiserem evitar terceiros podem apontar a variável para um OSRM próprio já existente. Ficam os aperfeiçoamentos anteriores: timeout de 5 segundos com erro nomeado, falha de rede visível e a contingência Maps/Waze.
