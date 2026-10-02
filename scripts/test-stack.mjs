import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const env=Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)]}));
const base=process.env.STACK_URL||`http://localhost:${env.APP_PORT||3000}`;
let cookie='';
async function request(path,method='GET',body,expected=200,session=cookie,headers={}){const r=await fetch(`${base}/api/${path}`,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();assert.equal(r.status,expected,`${method} ${path}: ${JSON.stringify(v)}`);return {response:r,value:v};}
await request('workspace','GET',undefined,401,'');
const logged=await request('auth/login','POST',{username:process.env.ADMIN_USERNAME||env.ADMIN_USERNAME||'admin',password:process.env.ADMIN_PASSWORD||env.ADMIN_PASSWORD});cookie=logged.response.headers.get('set-cookie').split(';')[0];assert.ok(!('token' in logged.value),'session token is not exposed in response JSON');
assert.match(logged.response.headers.get('set-cookie'),/HttpOnly/i);
const identity=(await request('auth/me')).value.user;assert.equal(identity.role,'Admin');
let state=(await request('workspace')).value;const original=structuredClone(state.workspace);
const command=async(path,method='POST',body={},expected=200)=>{const details=path==='transactions'?{reference:`API-${crypto.randomUUID()}`,beneficiary:'Unlisted Recipient',beneficiaryAccount:'ACCT-1',currency:'INR',channel:'Bank transfer',purpose:'Invoice payment',transactionDate:new Date().toISOString()}:{};const r=await request(path,method,{...details,...body,revision:state.revision},expected);if(expected===200&&r.value.workspace)state=r.value;return r.value;};
const suffix=crypto.randomUUID().slice(0,8);const name=`API Probe${suffix}`;
let testUser;
try{
 await command('watchlists/import','POST',{records:[{name,country:'India',dob:'1980-01-01',source:'Integration test'}]});
 const first={first:'API',middle:'',last:`Probe${suffix}`,dob:'1980-01-01',country:'India',location:'Mumbai',countryRisk:90,locationRisk:90,professionRisk:90};
 const screened=await command('customers','POST',first);assert.equal(screened.result.risk,90);assert.equal(screened.result.matchCount,1);assert.equal(screened.result.alertCount,1);const id=screened.result.customerId;assert.equal(state.workspace.customers.find(c=>c.id===id).profession,'');assert.equal(state.workspace.watch.filter(w=>w.customerId===id).length,1);
 assert.equal((await request(`customers/${id}`)).value.risk,90);assert.ok((await request('customers?q=API')).value.some(c=>c.id===id));
 const alert=state.workspace.alerts.find(a=>a.customerId===id);assert.equal(alert.score,100);assert.equal(alert.risk,'High');assert.ok(alert.evidence);
 await command(`alerts/${alert.id}/reviews`,'POST',{status:'Closed',note:'Identifiers reviewed by integration test.'});assert.equal((await request(`alerts/${alert.id}/reviews`)).value.at(-1).reviewer,identity.username);
 await command(`alerts/${alert.id}/reviews`,'POST',{status:'Closed',note:'   '},400);
 await command('rules','PUT',{rules:{...state.workspace.rules,amount:100,velocity:2}});
 let tx=(await command('transactions','POST',{customerId:id,amount:'49.99',destination:'India',count:10000,idempotencyKey:crypto.randomUUID()})).result;assert.equal(tx.count,'1');assert.equal(tx.flag,false);
 tx=(await command('transactions','POST',{customerId:id,amount:'49.99',destination:'India',idempotencyKey:crypto.randomUUID()})).result;assert.equal(tx.count,'2');assert.equal(tx.flag,true);assert.ok(state.workspace.alerts.some(a=>a.transactionId===tx.id));
 await command('transactions','POST',{customerId:id,amount:'1.001',destination:'India'},400);
 await command('transactions','POST',{customerId:'missing',amount:'1.00',destination:'India'},404);
 await command('rules','PUT',{rules:{...state.workspace.rules,threshold:101}},400);
 await command('customers','POST',{...first,dob:'2099-01-01'},400);
 await command(`customers/${id}`,'PUT',{...first,countryRisk:20,locationRisk:20,professionRisk:20});assert.equal((await request(`customers/${id}`)).value.risk,20);
 const rescreened=await command(`customers/${id}/screen`);assert.equal(rescreened.result.matchCount,1);assert.equal(state.workspace.watch.filter(w=>w.customerId===id).length,1);
 const stale=state.revision-1;await request('rules','PUT',{revision:stale,rules:state.workspace.rules},409);
 await request('rules','PUT',{revision:state.revision,rules:state.workspace.rules},403,cookie,{Origin:'https://untrusted.example'});
 await request(`customers/${id}?revision=${state.revision}`,'DELETE',undefined,409);
 const watchId=state.workspace.watch.find(w=>w.name===name).id;await command(`watchlists/${watchId}`,'PUT',{name,country:'India',dob:'1980-01-01',source:'Edited integration test'});await request(`watchlists/${watchId}?revision=${state.revision}`,'DELETE');state=(await request('workspace')).value;
 const second=(await command('customers','POST',{...first,last:`Delete${suffix}`})).result.customerId;await request(`customers/${second}?revision=${state.revision}`,'DELETE');state=(await request('workspace')).value;
 const events=(await request('audit')).value;assert.ok(events.some(e=>e.action==='TRANSACTION_EVALUATED'&&e.actor===identity.username));assert.ok((await request('dashboard')).value.transactions>=2);
 const password=`TestPassword-${crypto.randomUUID()}`;testUser=(await request('users','POST',{username:`viewer_${suffix}`,password,role:'Viewer'})).value;
 const viewerLogin=await request('auth/login','POST',{username:testUser.username,password});const viewerCookie=viewerLogin.response.headers.get('set-cookie').split(';')[0];await request('customers','GET',undefined,200,viewerCookie);await request('customers','POST',{...first,revision:state.revision},403,viewerCookie);await request('audit','GET',undefined,403,viewerCookie);
 await request(`users/${testUser.id}`,'PUT',{role:'Reviewer',active:true});await request('watchlists/import','POST',{records:[{name:'Denied',country:'India',dob:''}],revision:state.revision},403,viewerCookie);
 await request('auth/password','POST',{currentPassword:password,newPassword:password+'-changed'},200,viewerCookie);await request('auth/me','GET',undefined,401,viewerCookie);
 await request(`users/${identity.id}`,'PUT',{role:'Viewer',active:false},400);

 // Test a plain two-token watchlist record; restore removes it at the end.
 await command('watchlists/import','POST',{records:[{name:'messi leonel',country:'Argentina',dob:'',source:`Phonetic test ${suffix}`}]});
 for(const firstName of ['messy','mesi','leoneel']){
  const screened=await command('customers','POST',{first:firstName,last:'',country:'Argentina',location:'Rosario',countryRisk:20,locationRisk:20,professionRisk:20});
  const evidence=screened.result.matches.find(m=>m.name==='messi leonel');assert.ok(evidence,firstName);assert.equal(evidence.matchMethod,'Phonetic token match');assert.equal(evidence.score,90);assert.ok(screened.result.alertCount>0);
 }
 await command('rules','PUT',{rules:{...state.workspace.rules,threshold:95}});
 const strict=await command('customers','POST',{first:'leoneel',last:'',country:'Argentina',location:'Rosario',countryRisk:20,locationRisk:20,professionRisk:20});assert.ok(!strict.result.matches.some(m=>m.name==='messi leonel'));
 console.log('PASS: authentication, HttpOnly sessions, customer CRUD/screening, watchlist CRUD/import, alert review, decimal transactions, server velocity, rules, filters, audit, dashboard, roles, password rotation and conflicts.');
}finally{
 state=(await request('workspace')).value;await request('workspace','PUT',{revision:state.revision,workspace:original});if(testUser)await request(`users/${testUser.id}`,'PUT',{role:'Viewer',active:false});await request('auth/logout','POST');console.log('Temporary business records removed; test account disabled; original workspace restored.');
}
