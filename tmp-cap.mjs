import { chromium } from "@playwright/test";
const base={fonte:"stripe",status:"active",valor_cents:4900,moeda:"brl",vencimento:"2026-12-01T00:00:00Z",cancela_no_fim:false,id:"sub_1",avisos:[{etapa:3,canal:"email+in_app",enviado_em:"2026-11-20T10:00:00Z",resultado:"enviado",detalhe:"Fatura vence em 3 dias."}],proximos:[2,1]};
const estados={
 sem:{...base,status:"sem_assinatura",valor_cents:null,moeda:null,vencimento:null,id:null,avisos:[],proximos:[]},
 ativa:base,
 pendente:{...base,status:"past_due",vencimento:"2026-11-24T00:00:00Z",avisos:[{etapa:1,canal:"email+in_app",enviado_em:null,resultado:"falhou",detalhe:"Fatura vence em 1 dia."}],proximos:[]},
 suspensa:{...base,status:"suspenso"},
};
const b=await chromium.launch();
for (const [nome,dados] of Object.entries(estados)) {
 const temas = nome==='ativa' ? ['light','dark'] : ['light'];
 for (const tema of temas) for (const [w,h] of [[1440,900],[390,844]]) {
  const ctx=await b.newContext({storageState:"/tmp/state-billing.json",viewport:{width:w,height:h},locale:"pt-BR"});
  await ctx.addInitScript(t=>window.localStorage.setItem("nexus-theme",t),tema);
  await ctx.route('**/api/v1/billing/subscription',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:dados})}));
  const p=await ctx.newPage();const erros=[];p.on('console',m=>{if(m.type()==='error')erros.push(m.text().slice(0,70))});
  await p.goto("http://localhost:3043/app/settings/billing",{waitUntil:"domcontentloaded",timeout:240000});await p.waitForTimeout(3000);
  const m=await p.evaluate(()=>({h1:[...document.querySelectorAll('h1')].map(x=>x.textContent.trim()),badge:[...document.querySelectorAll('div')].filter(x=>/^(Sem assinatura|Assinatura ativa|Pagamento pendente|Conta suspensa)/.test(x.textContent.trim())).slice(-1).map(x=>x.textContent.trim().slice(0,40)),acoes:[...document.querySelectorAll('button')].map(x=>x.textContent.trim()).filter(x=>/Pagar|Gerenciar|Tentar/.test(x)),overflow:document.documentElement.scrollWidth>window.innerWidth}));
  console.log(nome,tema,w,JSON.stringify({...m,erros}));
  await p.screenshot({path:`docs/auditoria/capturas/billing-${nome}-${tema}_${w}.png`});
  await ctx.close();
 }
}
await b.close();
