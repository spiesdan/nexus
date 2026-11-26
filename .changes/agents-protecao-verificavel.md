---
impacto: nada_mudou
secao: corrigido
titulo: AGENTS.md mede a proteção da main em vez de afirmar de memória
---

O arquivo afirmava, com comando e data, que cinco checks eram obrigatórios na branch protection. A proteção não está no repositório — ela vive na configuração do GitHub — e o repo `spiesdan/nexus` nasceu em 22/09/2026, depois daquela medição, sem herdar nada: estava `protected: false`, com zero checks exigidos. Foi por isso que três releases falharam depois do merge. O texto agora traz o comando que responde, o estado medido em 26/11 (seis checks, PR obrigatório, sem force-push, sem bypass de admin) e a prova de que funciona.
