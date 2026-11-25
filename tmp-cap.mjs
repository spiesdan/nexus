import { chromium } from "@playwright/test";
const base={fonte:"stripe",status:"sem_assinatura",plano:{configurado:true,nome:"Nexus",valor_cents:169900,moeda:"BRL",fonte:"banco",intervalo:"mensal"},valor_cents:null,moeda:null,vencimento:null,cancela_no_fim:false,id:null,avisos:[],proximos:[]};
const sem={...base,plano:{configurado:false,nome:null,valor_cents:null,moeda:null,fonte:"nenhum"}};
const b=await chromium.launch();
for (const [nome,dados] of [['com-plano',base],['sem-plano',sem]]) {
 const temas = nome==='com-plano' ? ['light','dark'] : ['light'];
 for (const tema of temas) for (const [w,h] of [[1440,900],[390,844]]) {
  const ctx=await b.newContext({storageState:"/tmp/state-qa.json",viewport:{width:w,height:h},locale:"pt-BR"});
  await ctx.addInitScript(t=>window.localStorage.setItem("nexus-theme",t),tema);
  await ctx.route('**/api/v1/billing/subscription',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:dados})}));
  const p=await ctx.newPage();await p.goto("http://localhost:3046/app/settings/billing",{waitUntil:"domcontentloaded",timeout:240000});await p.waitForTimeout(3000);
  console.log(nome,tema,w,JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('dd')].map(x=>x.textContent.trim()).slice(0,3))));
  await p.screenshot({path:`docs/auditoria/capturas/qa-billing-${nome}-${tema}_${w}.png`});await ctx.close();
 }
}
await b.close();
