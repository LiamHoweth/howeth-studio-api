import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import pg from 'pg';
import { getGrowthStats } from '../src/growthAnalytics.js';
import { validateEvents } from '../src/validation.js';
import { validateGrowthFilters } from '../src/growthValidation.js';
import { createApp } from '../src/app.js';
const context = {schemaVersion:2,appVersion:'2.0.0',appBuild:'11',platform:'ios',analyticsEnvironment:'production',distributionChannel:'app_store',sessionId:randomUUID()};
const attemptId = randomUUID(), gameAttemptId = randomUUID();
const examples = [
 ['growth_cohort_started',{existingProgress:false}],['onboarding_started',{attemptId}],
 ['onboarding_step_completed',{attemptId,step:'NAME'}],['onboarding_completed',{attemptId,elapsedBucket:'1_to_5m'}],
 ['career_game_started',{gameAttemptId,position:'QB',mode:'field'}],['career_game_completed',{gameAttemptId,position:'QB',mode:'mixed'}],
 ['first_game_completed',{elapsedBucket:'5_to_15m'}],['reliability_result',{operation:'local_save',result:'failed',latencyBucket:'under_1s'}]
];
const wire = (eventName,properties,extra={}) => ({eventId:randomUUID(),occurredAt:new Date().toISOString(),eventName,properties:{...context,...properties,...extra}});
describe('growth privacy and compatibility contract',()=>{
 it('accepts every client shape while stripping names, errors, account IDs and arbitrary properties',()=>{
  const events=validateEvents({events:examples.map(([name,p])=>wire(name,p,{name:'private',error:'private',accountId:'private'}))});
  assert.equal(events.length,examples.length);
  events.forEach(e=>{assert.equal(e.properties.name,undefined);assert.equal(e.properties.error,undefined);assert.equal(e.properties.accountId,undefined);assert.equal(e.properties.appBuild,'11');});
 });
 it('requires occurrence provenance for new events but accepts legacy session events',()=>{
  assert.equal(validateEvents({events:[{...wire('growth_cohort_started',{}),properties:{existingProgress:false}}]}),null);
  assert.ok(validateEvents({events:[{...wire('session_started',{}),properties:{}}]}));
 });
 it('rejects unbounded steps, identities, modes, diagnostics and invalid filters',()=>{
  for(const [name,p] of [ ['onboarding_step_completed',{attemptId,step:'a player name'}],['career_game_started',{gameAttemptId:'career-private',position:'QB',mode:'field'}],['reliability_result',{operation:'raw stack',result:'failed',latencyBucket:'under_1s'}],['first_game_completed',{elapsedBucket:Infinity}] ]) assert.equal(validateEvents({events:[wire(name,p)]}),null);
  assert.equal(validateGrowthFilters({version:"'; DROP TABLE accounts;--"}),null);
  assert.equal(validateGrowthFilters({environment:['production']}),null);
  assert.deepEqual(validateGrowthFilters({}),{environment:'production',channel:'app_store',version:''});
 });
 it('protects the growth endpoint and passes only validated filters to the database',async()=>{
  let received;
  const app=createApp({database:{configured:true,ping:async()=>true,getGrowthStats:async f=>{received=f;return {summary:{observed:0}};}},env:{ADMIN_API_KEY:'growth-test-secret',DASHBOARD_USERNAME:'test',DASHBOARD_PASSWORD:'test'}});
  const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  try {
   const url=`http://127.0.0.1:${server.address().port}/api/v1/admin/stats/growth`;
   assert.equal((await fetch(url)).status,401);
   const headers={authorization:'Bearer growth-test-secret'};
   assert.equal((await fetch(url+'?environment=bogus',{headers})).status,400);
   const result=await fetch(url+'?environment=test&channel=testflight&version=2.0.0',{headers});
   assert.equal(result.status,200); assert.deepEqual(received,{environment:'test',channel:'testflight',version:'2.0.0'});
  } finally {await new Promise(r=>server.close(r));}
 });
});

describe('growth metrics in real PostgreSQL',{skip:!process.env.TEST_DATABASE_URL},()=>{
 let client;
 before(async()=>{client=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();await client.query('CREATE TEMP TABLE analytics_events (id bigserial,installation_id uuid,event_id uuid,event_name text,occurred_at timestamptz,properties jsonb, UNIQUE(installation_id,event_id))');});
 after(async()=>{await client?.end();});
 beforeEach(async()=>{await client.query('TRUNCATE analytics_events');});
 const id=randomUUID();
 async function add(name,p,ageHours,installation=id,extra={},eventId=randomUUID()){
  await client.query("INSERT INTO analytics_events(installation_id,event_id,event_name,occurred_at,properties) VALUES($1,$2,$3,now()-$4*interval '1 hour',$5) ON CONFLICT DO NOTHING",[installation,eventId,name,ageHours,{...context,...p,...extra}]);
 }
 const filters={environment:'production',channel:'app_store',version:''};
 it('handles empty data and avoids division by zero',async()=>{
  const r=await getGrowthStats(client,filters);assert.equal(r.summary.observed,0);assert.equal(r.summary.activationRate,null);assert.ok(r.retention.every(x=>x.eligible===0&&x.rate===null));
 });
 it('counts mature exact return windows, activation and ordered game completion once',async()=>{
  await add('growth_cohort_started',{existingProgress:false},960);
  await add('first_game_completed',{elapsedBucket:'5_to_15m'},959.8);
  for(const age of [930,786,234]) await add('session_started',{},age);
  await add('onboarding_started',{attemptId},959.99);
  await add('onboarding_step_completed',{attemptId,step:'NAME'},959.97);
  await add('onboarding_completed',{attemptId},959.9);
  await add('career_game_started',{gameAttemptId,position:'QB',mode:'field'},959.85);
  const duplicate=randomUUID();
  await add('career_game_completed',{gameAttemptId,position:'QB',mode:'mixed'},959.8,id,{},duplicate);
  await add('career_game_completed',{gameAttemptId,position:'QB',mode:'mixed'},959.8,id,{},duplicate);
  await add('career_game_completed',{gameAttemptId:randomUUID(),position:'QB',mode:'field'},959.7);
  const r=await getGrowthStats(client,filters);
  assert.equal(r.summary.activated,1);assert.equal(r.summary.activationRate,1);
  assert.deepEqual(r.retention.map(x=>[x.eligible,x.retained]),[[1,1],[1,1],[1,1]]);
  assert.equal(r.modes[0].started,1);assert.equal(r.modes[0].completed,1);
  assert.equal(r.onboarding.find(x=>x.step==='completed').attempts,1);
 });
 it('excludes partial windows and existing progress from activation, and keeps test data separate',async()=>{
  await add('growth_cohort_started',{existingProgress:false},30);
  await add('session_started',{},2);
  await add('growth_cohort_started',{existingProgress:true},100,randomUUID());
  await add('growth_cohort_started',{existingProgress:false},960,randomUUID(),{analyticsEnvironment:'test'});
  const r=await getGrowthStats(client,filters);
  assert.equal(r.summary.new_players,1);assert.equal(r.summary.existing,1);assert.equal(r.summary.activation_eligible,1);
  assert.equal(r.retention[0].eligible,1);assert.equal(r.retention[0].retained,0);
  assert.equal(r.coverage.length,2);
 });
 it('uses cohort entry version while permitting return after an app update; late observations do not redefine the cohort',async()=>{
  await add('growth_cohort_started',{existingProgress:false},960);
  await add('growth_cohort_started',{existingProgress:false},10);
  await add('session_started',{},930,id,{appVersion:'2.1.0'});
  const r=await getGrowthStats(client,{...filters,version:'2.0.0'});
  assert.equal(r.summary.observed,1);assert.equal(r.retention[0].retained,1);
  const updated=await getGrowthStats(client,{...filters,version:'2.1.0'});assert.equal(updated.summary.observed,0);
 });
});
