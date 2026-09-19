export const ACTIVITIES=[
 {code:'1',key:'sleep',label:'Sleep',short:'sleeping',colour:'#7d8cff'},
 {code:'3',key:'personal',label:'Personal care',short:'personal care',colour:'#72d9ff'},
 {code:'4',key:'eating',label:'Eating',short:'eating',colour:'#61e6a2'},
 {code:'5',key:'travel',label:'Transportation',short:'in transit',colour:'#f6c85f'},
 {code:'6',key:'work',label:'Paid work, studying or learning',short:'work / study',colour:'#ff6675'},
 {code:'7',key:'care',label:'Unpaid domestic and care work',short:'household / care',colour:'#c98cff'},
 {code:'10',key:'leisure',label:'Socializing and leisure',short:'socializing / leisure',colour:'#43d9d0'},
 {code:'14',key:'other',label:'Other activities',short:'other',colour:'#b7c1c9'}
];
export const PROVINCES=[
 {id:'bc',name:'British Columbia',abbr:'B.C.',population:5646420,tz:'America/Vancouver',x:.13,y:.62},
 {id:'ab',name:'Alberta',abbr:'Alta.',population:5057077,tz:'America/Edmonton',x:.28,y:.61},
 {id:'sk',name:'Saskatchewan',abbr:'Sask.',population:1266092,tz:'America/Regina',x:.38,y:.62},
 {id:'mb',name:'Manitoba',abbr:'Man.',population:1503865,tz:'America/Winnipeg',x:.48,y:.62},
 {id:'on',name:'Ontario',abbr:'Ont.',population:16103890,tz:'America/Toronto',x:.61,y:.67},
 {id:'qc',name:'Quebec',abbr:'Que.',population:9016222,tz:'America/Toronto',x:.72,y:.56},
 {id:'nb',name:'New Brunswick',abbr:'N.B.',population:866497,tz:'America/Moncton',x:.82,y:.68},
 {id:'ns',name:'Nova Scotia',abbr:'N.S.',population:1090852,tz:'America/Halifax',x:.87,y:.71},
 {id:'pe',name:'Prince Edward Island',abbr:'P.E.I.',population:181715,tz:'America/Halifax',x:.85,y:.65},
 {id:'nl',name:'Newfoundland and Labrador',abbr:'N.L.',population:547910,tz:'America/St_Johns',x:.92,y:.49}
];
export const TERRITORIES=[
 {id:'yt',name:'Yukon',abbr:'Y.T.',population:48493,tz:'America/Whitehorse',x:.19,y:.28},
 {id:'nt',name:'Northwest Territories',abbr:'N.W.T.',population:45808,tz:'America/Yellowknife',x:.37,y:.30},
 {id:'nu',name:'Nunavut',abbr:'Nun.',population:42215,tz:'America/Iqaluit',x:.58,y:.25}
];
export const AGE_15_PLUS_SHARE=(41651653-1871184-2138350-2251628)/41651653;
export const VERIFIED_POPULATION={strategy:'verified-snapshot',asOf:'2026-04-01',canada:41417056,values:Object.fromEntries([...PROVINCES,...TERRITORIES].map(r=>[r.id,r.population])),age15PlusShare:AGE_15_PLUS_SHARE};
export function timeCodeForMinute(minute){const i=Math.floor(minute/5);return ((i-48+288)%288)+1}
export function labelForTimeCode(code){const i=(Number(code)-1+48)%288,m=i*5;return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
export function localParts(date,tz){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);const get=t=>parts.find(p=>p.type===t)?.value;const hour=Number(get('hour'))%24,minute=Number(get('minute'));return{weekday:get('weekday'),hour,minute,label:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`,minuteOfDay:hour*60+minute}}
function dayBucket(w){return w==='Sat'||w==='Sun'?'weekends':'weekdays'}
function popFor(data,r){return Number(data?.values?.[r.id]??r.population)}
export function buildCanadaSnapshot(profile,population=VERIFIED_POPULATION,at=new Date()){
 if(!profile?.weekdays||!profile?.weekends)throw new Error('Time-use profile unavailable');
 const instant=at instanceof Date?at:new Date(at),share=population.age15PlusShare??AGE_15_PLUS_SHARE;
 const totals=Object.fromEntries(ACTIVITIES.map(a=>[a.key,0]));let scoped=0;
 const regions=PROVINCES.map(r=>{const lp=localParts(instant,r.tz),code=timeCodeForMinute(lp.minuteOfDay),bucket=dayBucket(lp.weekday),slice=profile[bucket]?.[String(code)];if(!slice)throw new Error(`Missing ${bucket} slot ${code}`);const p=popFor(population,r),scope=p*share,counts={},activities={};for(const a of ACTIVITIES){const pct=Number(slice[a.key]);activities[a.key]=pct;counts[a.key]=Math.round(scope*pct/100);totals[a.key]+=scope*pct/100}scoped+=scope;const awake=100-activities.sleep;const dominant=ACTIVITIES.filter(a=>a.key!=='sleep').sort((a,b)=>activities[b.key]-activities[a.key])[0].key;return{...r,population:p,scopedPopulation:Math.round(scope),localTime:lp.label,weekday:lp.weekday,timeSlot:labelForTimeCode(code),awakePercent:+awake.toFixed(1),awakeCount:Math.round(scope*awake/100),dominant,activities,counts,surveyIncluded:true}});
 const counts=Object.fromEntries(ACTIVITIES.map(a=>[a.key,Math.round(totals[a.key])])),activities=Object.fromEntries(ACTIVITIES.map(a=>[a.key,+((totals[a.key]/scoped)*100).toFixed(1)])),awakeCount=scoped-totals.sleep;
 return{status:'ready',instant:instant.toISOString(),national:{scopePopulation:Math.round(scoped),awakeCount:Math.round(awakeCount),awakePercent:+(awakeCount/scoped*100).toFixed(1),counts,activities},regions,territories:TERRITORIES.map(r=>({...r,population:popFor(population,r),localTime:localParts(instant,r.tz).label,surveyIncluded:false})),activities:ACTIVITIES,sources:{profile:profile.source,population}};
}
export function factCandidates(s){const top=ACTIVITIES.filter(a=>a.key!=='sleep').map(a=>({...a,value:s.national.activities[a.key],count:s.national.counts[a.key]})).sort((a,b)=>b.value-a.value)[0];return[
{id:'awake',kicker:'National pulse',title:`${s.national.awakePercent.toFixed(1)}% of the modelled 15+ population is awake`,detail:`About ${s.national.awakeCount.toLocaleString('en-CA')} people across the ten-province survey scope.`},
{id:'top',kicker:'Top awake activity',title:`${top.label} leads the awake mix`,detail:`${top.value.toFixed(1)}% of the modelled population, about ${top.count.toLocaleString('en-CA')} people.`},
{id:'truth',kicker:'What “live” means',title:'Live-to-the-clock, not live surveillance',detail:'The clock is live; the behavioural profile comes from Statistics Canada’s 2022 Time Use Survey. No individual is tracked.'}
]}
export function deterministicFact(s){const c=factCandidates(s);return{mode:'deterministic',generatedAt:new Date().toISOString(),snapshotInstant:s.instant,selected:c[1]||c[0]}}
