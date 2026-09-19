import{readFile}from'node:fs/promises';import{existsSync}from'node:fs';import{ACTIVITIES,PROVINCES,TERRITORIES,VERIFIED_POPULATION,timeCodeForMinute,labelForTimeCode,buildCanadaSnapshot}from'../src/model.js';
for(const f of['index.html','src/main.js','src/model.js','src/styles.css','scripts/refresh-data.mjs','.github/workflows/pages.yml'])if(!existsSync(f)||(await readFile(f,'utf8')).trim()==='')throw new Error(f+' missing');
const eq=(a,b,n)=>{if(a!==b)throw new Error(`${n}: ${a} != ${b}`)};eq(timeCodeForMinute(240),1,'04:00');eq(timeCodeForMinute(720),97,'12:00');eq(timeCodeForMinute(0),241,'midnight');eq(labelForTimeCode(288),'03:55','code 288');eq(ACTIVITIES.length,8,'activity count');eq([...PROVINCES,...TERRITORIES].reduce((s,r)=>s+r.population,0),VERIFIED_POPULATION.canada,'population');
const profile={source:{table:'fixture'},weekdays:{},weekends:{}};for(const b of['weekdays','weekends'])for(let i=1;i<=288;i++)profile[b][i]={sleep:40,personal:5,eating:10,travel:5,work:15,care:10,leisure:12,other:3};
const s=buildCanadaSnapshot(profile,VERIFIED_POPULATION,new Date('2026-09-19T16:00:00Z'));eq(s.national.awakePercent,60,'awake');eq(s.regions.length,10,'provinces');eq(s.territories.length,3,'territories');
const workflow=await readFile('.github/workflows/pages.yml','utf8');for(const x of['configure-pages@v6','upload-pages-artifact@v5','deploy-pages@v5','refresh-data.mjs'])if(!workflow.includes(x))throw new Error('workflow missing '+x);

if(existsSync('public/data/population.json')){
  const live=JSON.parse(await readFile('public/data/population.json','utf8'));
  if(!Number.isFinite(Number(live.canada))||!live.values)throw new Error('generated population bundle invalid');
  const sum=Object.values(live.values).reduce((s,v)=>s+Number(v||0),0);
  if(Math.abs(sum-Number(live.canada))/Number(live.canada)>.025)throw new Error('generated province/territory populations do not reconcile with Canada');
  for(const [id,baseline] of Object.entries(VERIFIED_POPULATION.values)){
    const value=Number(live.values[id]);
    if(!Number.isFinite(value))throw new Error('generated population missing '+id);
    const ratio=value/Number(baseline);
    if(ratio<.75||ratio>1.3)throw new Error(`generated population mapping for ${id} is implausible: ${value} vs verified ${baseline}`);
  }
}
if(existsSync('public/data/live-signals.json')){
  const signals=JSON.parse(await readFile('public/data/live-signals.json','utf8'));
  if(!signals.generatedAt)throw new Error('live signal bundle missing generatedAt');
  if(signals.openGovernment?.status==='ready'&&!Number.isFinite(Number(signals.openGovernment.changedLast24h)))throw new Error('Open Government 24h change count missing');
  if(signals.statcan?.status==='ready'){
    if(!Array.isArray(signals.statcan.indicators)||!signals.statcan.indicators.length)throw new Error('StatCan indicator snapshot missing');
    if(!Array.isArray(signals.statcan.schedule)||!signals.statcan.schedule.length)throw new Error('StatCan release schedule missing');
    if(signals.statcan.changed?.status==='ready'&&!Array.isArray(signals.statcan.changed.items))throw new Error('StatCan changed-table metadata missing');
  }
}
if(existsSync('public/data/canada-provinces.geojson')){
  const geo=JSON.parse(await readFile('public/data/canada-provinces.geojson','utf8'));
  if(geo?.type!=='FeatureCollection'||geo.features?.length!==13)throw new Error('generated Canada boundary bundle must contain 13 regions');
  const ids=new Set(geo.features.map(f=>String(f?.properties?.PRUID||'')));
  for(const id of ['10','11','12','13','24','35','46','47','48','59','60','61','62'])if(!ids.has(id))throw new Error('boundary bundle missing PRUID '+id);
}
console.log('Checks passed.');
