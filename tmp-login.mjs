import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const c=JSON.parse(readFileSync(".e2e-creds.json","utf8"));
const b=await chromium.launch();const ctx=await b.newContext({locale:"pt-BR",viewport:{width:1440,height:900}});
const p=await ctx.newPage();await p.goto("http://localhost:3043/login",{waitUntil:"networkidle",timeout:240000});
await p.fill("#email, input[type=email]",c.users.manager.email);await p.fill("#password, input[type=password]",c.password);
await p.click("button[type=submit]");await p.waitForURL(u=>!u.pathname.startsWith("/login"),{timeout:180000});
await ctx.storageState({path:"/tmp/state-billing.json"});console.log("ok",p.url());await b.close();
