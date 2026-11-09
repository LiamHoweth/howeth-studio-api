import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {it} from 'node:test';
import pg from 'pg';
import {createApp} from '../src/app.js';
import {createDatabase} from '../src/database.js';

it('receives real client-shaped batches, deduplicates retry IDs, displays aggregates and cascades deletion', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const schema='growth_'+randomUUID().replaceAll('-','');
 const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();
 let database,server;
 try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options','-csearch_path='+schema+',public');
  const setup=new pg.Client({connectionString:url.toString()});await setup.connect();
  try {await setup.query(await readFile(new URL('../migrations/001_football_era.sql',import.meta.url),'utf8'));}finally{await setup.end();}
  database=createDatabase(url.toString());
  const app=createApp({database,env:{ADMIN_API_KEY:'synthetic-growth-admin'}});
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const registration=await fetch(origin+'/api/v1/installations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({platform:'ios',appVersion:'2.0.0'})});assert.equal(registration.status,201);
  const credentials=await registration.json();
  const headers={authorization:'Bearer '+credentials.token,'content-type':'application/json'};
  const gameAttemptId=randomUUID();
  const context={schemaVersion:2,appVersion:'2.0.0',appBuild:'11',platform:'ios',analyticsEnvironment:'test',distributionChannel:'development',sessionId:randomUUID()};
  const make=(eventName,p)=>({eventId:randomUUID(),occurredAt:new Date().toISOString(),eventName,properties:{...context,...p,playerName:'MUST BE STRIPPED'}});
  const events=[make('growth_cohort_started',{existingProgress:false}),make('career_game_started',{gameAttemptId,position:'QB',mode:'field'}),make('career_game_completed',{gameAttemptId,position:'QB',mode:'mixed'}),make('first_game_completed',{elapsedBucket:'under_1m'}),make('reliability_result',{operation:'local_save',result:'success',latencyBucket:'under_1s'})];
  const send=()=>fetch(origin+'/api/v1/events',{method:'POST',headers,body:JSON.stringify({events})});
  let response=await send();assert.equal(response.status,202);assert.equal((await response.json()).accepted,5);
  response=await send();assert.equal((await response.json()).accepted,0);
  const statsHeaders={authorization:'Bearer synthetic-growth-admin'};
  const stats=async()=>{const r=await fetch(origin+'/api/v1/admin/stats/growth?environment=test&channel=development',{headers:statsHeaders});assert.equal(r.status,200);return r.json();};
  const result=await stats();assert.equal(result.summary.new_players,1);assert.equal(result.modes[0].completed,1);assert.equal(result.reliability[0].observations,1);assert.equal(result.timing[0].installations,1);
  const rows=await admin.query(`SELECT properties FROM ${schema}.analytics_events`);assert.ok(rows.rows.every(r=>r.properties.playerName===undefined));
  assert.equal((await fetch(origin+'/api/v1/installations/me',{method:'DELETE',headers})).status,204);
  assert.equal((await stats()).summary.observed,0);
 } finally {
  if(server)await new Promise(r=>server.close(r));await database?.close();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();
 }
});
