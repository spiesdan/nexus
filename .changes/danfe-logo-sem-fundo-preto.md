---
impacto: nada_mudou
secao: corrigido
titulo: Logo do DANFE não sai mais com fundo preto
---

O DANFE é renderizado com FPDF (`sped-da`), que não tem canal alfa: a área transparente do PNG é desenhada como preto — medido no DANFE da nota 4677, reclamado pelo dono. O logo não estava errado; o formato de destino é que não suporta transparência. O sidecar agora compõe a imagem sobre BRANCO com GD antes de entregá-la ao FPDF, com prova de pixel (`rgb=255,255,255` no canto de um PNG 4×4 totalmente transparente). Sem GD, ou imagem ilegível, o logo passa como veio — logo é enfeite, DANFE sem logo é melhor que DANFE que falha.
