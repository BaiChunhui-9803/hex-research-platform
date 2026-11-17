import {readFile,writeFile,mkdir,readdir}from 'node:fs/promises';
import {createHash,randomUUID}from 'node:crypto';
import {problemRegistry}from '../problems/index.js';import{methodRegistry}from '../methods/index.js';import{compatibility}from '../core/registry.js';
import{runExperiment,summarize,resultCSV}from '../core/experiment.js';import{replaySession}from '../core/session.js';
const root=new URL('../',import.meta.url),folder=new URL('../experiments/2026-11-15-evolutionary-baselines/',import.meta.url);
await mkdir(folder,{recursive:true});await mkdir(new URL('../experiments/runs/',import.meta.url),{recursive:true});
async function codeFiles(directory){const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){const url=new URL(entry.name+(entry.isDirectory()?'/':''),directory);if(entry.isDirectory())files.push(...await codeFiles(url));else if(entry.name.endsWith('.js'))files.push(url);}return files;}
const hash=createHash('sha256');for(const group of ['core','methods','problems'])for(const file of (await codeFiles(new URL(group+'/',root))).sort((a,b)=>a.href.localeCompare(b.href))){hash.update(file.pathname);hash.update(await readFile(file));}
const codeHash=hash.digest('hex'),seeds=[26,27,28],evaluations=Number(process.argv[2]??32);let total=0,replays=0;
const reports=[];
for(const problem of problemRegistry.list()){
  const cases=[];
  for(const scenario of problem.scenarios){
    const methodIds=methodRegistry.list().filter(m=>compatibility(m,problem.capabilities(scenario.id)).compatible).map(m=>m.id);
    const file=new URL(problem.id+'-'+scenario.id+'.json',folder);let report;
    try{const old=JSON.parse(await readFile(file,'utf8'));if(old.codeHash===codeHash&&old.request.evaluations===evaluations)report=old;}catch{}
    if(!report){report=runExperiment({problemId:problem.id,scenarioIds:[scenario.id],methodIds,seeds,evaluations},problemRegistry,methodRegistry,{limitMs:240000});report.codeHash=codeHash;await writeFile(file,JSON.stringify(report,null,2));}
    for(const result of report.results){const restored=replaySession(problem,result.replay);if(JSON.stringify(restored.environment.metrics())!==JSON.stringify(result.metrics))throw new Error('Replay mismatch: '+result.id);replays++;}
    cases.push(report);total+=report.results.length;console.log(JSON.stringify({problem:problem.id,scenario:scenario.id,episodes:report.results.length,total,elapsedMs:report.elapsedMs}),{flush:true});
  }
  const results=cases.flatMap(r=>r.results),matrix=cases.map(r=>({scenarioId:r.request.scenarioIds[0],methodIds:r.request.methodIds}));
  const combined={version:cases[0].version,createdAt:new Date().toISOString(),codeHash,request:{problemId:problem.id,scenarioIds:problem.scenarios.map(s=>s.id),methodIds:[...new Set(matrix.flatMap(r=>r.methodIds))],seeds,evaluations,populationSize:0,matrix,design:'compatibility-matrix'},metricSchema:problem.metrics,results,summary:summarize(results,problem.metrics),elapsedMs:cases.reduce((s,r)=>s+r.elapsedMs,0)};
  await writeFile(new URL(problem.id+'.json',folder),JSON.stringify(combined,null,2));await writeFile(new URL(problem.id+'.csv',folder),resultCSV(combined));
  await writeFile(new URL('../experiments/runs/'+randomUUID()+'.json',import.meta.url),JSON.stringify(combined,null,2));reports.push(combined);
}
const audit={episodes:total,verifiedReplays:replays,methods:methodRegistry.list().length,scenarios:11,seeds,evaluations,codeHash,scope:'Integration check, not a CEC benchmark reproduction or human difficulty calibration'};
await writeFile(new URL('validation.json',folder),JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
