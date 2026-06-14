/**
 * scrape.mjs — CGTenders standalone scraper
 */

const MONGODB_URI = 'mongodb+srv://Vasu:9753%40@cluster0.wpm3f1b.mongodb.net/cgtenders?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'cgtenders';

const USE_MOCK_GEM = false;
const SKIP_CSPGCL = false;
const AUTO_DELETE_CLOSED_AFTER_DAYS = 2;


// imports
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';


const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPS_DIR = path.join(__dirname, '.scraper_deps');

const SEP = '═'.repeat(50);


const log = msg => console.log('  ' + msg);

const warn = msg =>
  console.warn('  ⚠️  ' + msg);

const die = msg => {
  console.error('\n❌  ' + msg + '\n');
  process.exit(1);
};


// Validate Mongo
if (MONGODB_URI.includes('YOUR_USER')) {
  die('MongoDB URI missing');
}


// install deps
if (!existsSync(DEPS_DIR))
  mkdirSync(DEPS_DIR, { recursive:true });


const needsInstall =
 !existsSync(path.join(DEPS_DIR,'node_modules','mongodb')) ||
 !existsSync(path.join(DEPS_DIR,'node_modules','cheerio')) ||
 process.argv.includes('--install');


if(needsInstall){

 console.log('\n📦 Installing dependencies...');

 writeFileSync(
  path.join(DEPS_DIR,'package.json'),
  JSON.stringify({
    name:'scraper-deps',
    private:true,
    dependencies:{
      mongodb:'^6.8.0',
      cheerio:'^1.0.0'
    }
  },null,2)
 );

 try{

  execSync(
    'npm install',
    {
     cwd:DEPS_DIR,
     stdio:'inherit'
    }
  );

  console.log(
    '✅ Done. Run node aa.mjs again'
  );

  process.exit(0);

 }catch{

  die('npm install failed');

 }

}


// FIXED IMPORTS ✅
// works Node 18 / 20 / 22 / 24

const { MongoClient } = require(
 path.join(
   DEPS_DIR,
   'node_modules',
   'mongodb'
 )
);


const { load: cheerioLoad } = require(
 path.join(
   DEPS_DIR,
   'node_modules',
   'cheerio'
 )
);


// ═════════════════════════════
// CONTINUE YOUR OLD CODE BELOW
// Start from:
// const CG_CITIES = [
// ═════════════════════════════
const CG_CITIES = [
  'Raipur','Bilaspur','Durg','Korba','Raigarh','Rajnandgaon','Bastar','Surguja',
  'Dhamtari','Mahasamund','Kanker','Kondagaon','Dantewada','Sukma','Bijapur',
  'Narayanpur','Kabirdham','Mungeli','Janjgir-Champa','Korea','Surajpur',
  'Balrampur','Jashpur','Gariaband','Balod','Baloda Bazar','Bemetara',
  'Mohla-Manpur','Sarangarh-Bilaigarh','Khairagarh-Chhuikhadan-Gandai',
  'Manendragarh-Chirmiri-Bharatpur','Sakti','Gaurela-Pendra-Marwahi',
];
const CITY_ALIASES = {
  koriya:'Korea',kawardha:'Kabirdham',jagdalpur:'Bastar',ambikapur:'Surguja',
  mcb:'Manendragarh-Chirmiri-Bharatpur',gpm:'Gaurela-Pendra-Marwahi',
  kkc:'Khairagarh-Chhuikhadan-Gandai',khairagarh:'Khairagarh-Chhuikhadan-Gandai',
  sarangarh:'Sarangarh-Bilaigarh','baloda bazar-bhatapara':'Baloda Bazar',
  bhatapara:'Baloda Bazar',janjgir:'Janjgir-Champa',champa:'Janjgir-Champa',
};

function resolveCityGem(text) {
  if (!text) return 'Unspecified';
  const t = text.toLowerCase();
  for (const c of CG_CITIES) if (t.includes(c.toLowerCase())) return c;
  for (const [a, c] of Object.entries(CITY_ALIASES)) if (t.includes(a)) return c;
  return 'Unspecified';
}

const PLANT_CITY = { 'korba-west':'Korba', dspm:'Korba', marwa:'Janjgir-Champa', central:null };

function resolveCityCspgcl(raw) {
  if (PLANT_CITY[raw.plantId]) return PLANT_CITY[raw.plantId];
  const h = `${raw.scopeRaw||''} ${raw.tenderNoticeNo||''} ${raw.issuingOffice||''}`.toLowerCase();
  if (/korba/i.test(h)) return 'Korba';
  if (/marwa|janjgir/i.test(h)) return 'Janjgir-Champa';
  if (/raipur/i.test(h)) return 'Raipur';
  return 'Unspecified';
}

// ══════════════════════════════════════════════════════
//  ANALYSIS ENGINE
// ══════════════════════════════════════════════════════
const CATS = {
  'Civil Works':  ['civil','construction','building','road','concrete','bridge','repair','renovation','rcc'],
  'Mechanical':   ['mechanical','turbine','boiler','pump','compressor','valve','motor','welding','overhauling'],
  'Electrical':   ['electrical','transformer','switchgear','cable','wiring','panel','generator','lighting'],
  'Manpower':     ['manpower','labour','labor','outsourc','housekeep','security','guard','cleaning','staffing'],
  'Procurement':  ['supply','procurement','purchase','spare','material','chemical','fuel','diesel','equipment'],
  'Environment':  ['environment','pollution','ash','effluent','emission','waste','disposal'],
  'EPC':          ['epc','turnkey','erection','commissioning','installation'],
  'IT & Software':['software','computer','server','network','cctv','website','digital'],
  'Transport':    ['transport','vehicle','truck','crane','dumper','jcb','excavator','tipper'],
};

function categorize(title) {
  const t = (title||'').toLowerCase();
  const out = [];
  for (const [cat,kws] of Object.entries(CATS)) if (kws.some(k=>t.includes(k))) out.push(cat);
  return out.length ? out : ['General'];
}

function scoreViability({ bidValue:cost, emdAmount:emd, endDate }) {
  let s = 6;
  if (cost!=null) { if(cost<=5e6) s+=2; else if(cost<=2e7) s+=1; else s-=1; }
  if (emd!=null && cost>0) { const r=emd/cost; if(r>0.05) s-=1; if(r<=0.02) s+=1; }
  if (endDate) { const d=Math.ceil((new Date(endDate)-new Date())/864e5); if(d<0) s-=2; else if(d<=3) s-=1; else if(d>=14) s+=1; }
  return Math.max(1,Math.min(10,s));
}

function identifyRisks({ bidValue:cost, emdAmount:emd, endDate, title }) {
  const r=[];
  if (endDate) { const d=Math.ceil((new Date(endDate)-new Date())/864e5); if(d<0) r.push('Tender expired'); else if(d<=2) r.push('Closing in < 48 hours'); else if(d<=5) r.push('Short submission window'); }
  if (emd&&cost&&emd/cost>0.05) r.push('High EMD relative to value');
  if (emd&&emd>500000) r.push('EMD exceeds ₹5 lakh');
  if (cost&&cost>5e7) r.push('Large-scale project (₹5 Cr+)');
  const t=(title||'').toLowerCase();
  if (t.includes('turnkey')||t.includes('epc')) r.push('EPC/Turnkey complexity');
  return r.slice(0,4);
}

// ══════════════════════════════════════════════════════
//  GEM SCRAPER
// ══════════════════════════════════════════════════════
const GEM_BASE = 'https://bidplus.gem.gov.in';

function mockGem() {
  const d = n => { const x=new Date(); x.setDate(x.getDate()+n); return x.toISOString(); };
  return [
    { bidNumber:'GEM/2026/B/MOCK001', title:'Supply of LED Street Lights', department:'Urban Admin', organization:'MoHUA', quantity:'500', startDate:d(-5), endDate:d(10), locationText:'Raipur, Chhattisgarh', bidValue:4500000, emdAmount:90000, bidLink:`${GEM_BASE}/showbidDocument/MOCK001`, isActive:true },
    { bidNumber:'GEM/2026/B/MOCK002', title:'AMC for HVAC Systems', department:'Health Dept', organization:'NHM', quantity:'1', startDate:d(-3), endDate:d(6), locationText:'Bilaspur, Chhattisgarh', bidValue:1850000, emdAmount:37000, bidLink:`${GEM_BASE}/showbidDocument/MOCK002`, isActive:true },
  ];
}

async function fetchGem() {
  if (USE_MOCK_GEM) { log('Mock GeM: 2 records'); return mockGem(); }
  log('GeM: initialising session...');
  let cookies='', csrf='';
  try {
    const r = await fetch(`${GEM_BASE}/advance-search`, {
      headers:{'User-Agent':'Mozilla/5.0 Chrome/124','Accept':'text/html','Accept-Language':'en-IN,en;q=0.9'},
      signal:AbortSignal.timeout(20000),
    });
    const sc = typeof r.headers.getSetCookie==='function' ? r.headers.getSetCookie() : (r.headers.get('set-cookie')||'').split(/,\s*(?=[a-zA-Z0-9_-]+=)/);
    cookies = sc.map(c=>c.split(';')[0]).join('; ');
    const html = await r.text();
    csrf = html.match(/csrf_bd_gem_nk['"]?\s*:\s*['"]([a-f0-9]+)['"]/)?.[1] ?? '';
  } catch(e) { warn('GeM session error: '+e.message); return []; }
  if (!csrf) { warn('GeM: no CSRF token found'); return []; }

  const results=[];
  let page=1, total=null;
  while (page<=200) {
    try {
      const body = new URLSearchParams({ searchType:'location', state_name_con:'CHHATTISGARH', city_name_con:'', bidEndDateFrom:'', bidEndDateTo:'', page_no:String(page), csrf_bd_gem_nk:csrf });
      const r = await fetch(`${GEM_BASE}/search-bids`, {
        method:'POST',
        headers:{'User-Agent':'Mozilla/5.0 Chrome/124','Accept':'application/json','Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest',Origin:GEM_BASE,Referer:`${GEM_BASE}/advance-search`,Cookie:cookies},
        body, signal:AbortSignal.timeout(25000),
      });
      if (!r.ok) break;
      const json = await r.json();
      const solr = json?.response?.response;
      if (!solr) break;
      if (total===null) { total=solr.numFound??0; log(`GeM: ${total} total tenders found`); }
      const docs = solr.docs??[];
      if (!docs.length) break;
      const a = v => Array.isArray(v)?v[0]:v;
      for (const d of docs) {
        const bidNumber=a(d.b_bid_number); if(!bidNumber) continue;
        results.push({ bidNumber, title:a(d.bd_category_name)||a(d.b_category_name)||bidNumber, department:a(d.ba_official_details_deptName)||null, organization:a(d.ba_official_details_minName)||null, quantity:a(d.b_total_quantity)!=null?String(a(d.b_total_quantity)):null, startDate:a(d.final_start_date_sort)?new Date(a(d.final_start_date_sort)).toISOString():null, endDate:a(d.final_end_date_sort)?new Date(a(d.final_end_date_sort)).toISOString():null, locationText:'Chhattisgarh', bidValue:null, emdAmount:null, bidLink:`${GEM_BASE}/showbidDocument/${encodeURIComponent(bidNumber)}`, isActive:a(d.b_status)===1 });
      }
      log(`  GeM page ${page}: +${docs.length} → ${results.length} so far`);
      if (results.length>=Math.min(total,2000)||docs.length<10) break;
      page++;
      await new Promise(r=>setTimeout(r,500));
    } catch(e) { warn('GeM page '+page+': '+e.message); break; }
  }
  return results;
}

// ══════════════════════════════════════════════════════
//  CSPGCL SCRAPER
// ══════════════════════════════════════════════════════
const PLANTS = [
  {id:'central',    paramflag:1, label:'Central Offices'},
  {id:'korba-west', paramflag:2, label:'Hasdeo TPS Korba West'},
  {id:'dspm',       paramflag:3, label:'Dr. S.P. Mukharjee TPS'},
  {id:'marwa',      paramflag:5, label:'Marwa Tendubhata TPS'},
];
const CSPGCL_URL = 'https://cspc.co.in/cspgcl_tendernotices/CSPGCL_Tender.aspx';

function parseCDate(d) {
  if (!d) return null;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let [,day,mon,yr,hr,min,mer]=m; hr=parseInt(hr);
  if(mer){if(mer.toUpperCase()==='PM'&&hr!==12)hr+=12;if(mer.toUpperCase()==='AM'&&hr===12)hr=0;}
  const dt=new Date(`${yr}-${mon}-${day}T${String(hr).padStart(2,'0')}:${min}:00+05:30`);
  return isNaN(dt.getTime())?null:dt;
}

async function fetchCspgcl() {
  const all=[];
  for (const plant of PLANTS) {
    try {
      const r = await fetch(`${CSPGCL_URL}?paramflag=${plant.paramflag}`,{headers:{'User-Agent':'Mozilla/5.0 Chrome/124','Accept-Language':'en-IN,en;q=0.9'},signal:AbortSignal.timeout(25000)});
      if (!r.ok) { warn(`CSPGCL ${plant.label}: HTTP ${r.status}`); continue; }
      const $ = cheerioLoad(await r.text());
      let n=0;
      $('#GVTenderDetails tr').each((i,tr)=>{
        if(i===0) return;
        const tds=$(tr).find('td').toArray();
        if(tds.length<8) return;
        const t=el=>$(el).text().trim().replace(/\s+/g,' ');
        const num=s=>{if(!s||/nil|-/i.test(s))return null;const n=Number(s.replace(/[^0-9.]/g,''));return isNaN(n)?null:n;};
        const closing=parseCDate(t(tds[6]));
        if(closing&&closing<new Date()) return;
        all.push({tenderNoticeNo:t(tds[2]),scopeRaw:t(tds[3]),issuingOffice:t(tds[1]),estimatedCost:num(t(tds[4])),emd:num(t(tds[5])),closingDate:closing,openingDate:parseCDate(t(tds[7])),plantId:plant.id,plantLabel:plant.label,paramflag:plant.paramflag});
        n++;
      });
      log(`  CSPGCL ${plant.label}: ${n} active tenders`);
      await new Promise(r=>setTimeout(r,500));
    } catch(e) { warn(`CSPGCL ${plant.label}: ${e.message}`); }
  }
  return all;
}

// ══════════════════════════════════════════════════════
//  NORMALIZE
// ══════════════════════════════════════════════════════
function status(d) { return !d||new Date(d)>=new Date()?'open':'closed'; }
function hashKey(parts) { const s=parts.join('|');let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0;}return `CSPGCL-GEN-${Math.abs(h)}`; }

function buildTender(base) {
  return { ...base, category:categorize(base.title), viabilityScore:scoreViability(base), risks:identifyRisks(base) };
}

function normGem(r) {
  const endDate=r.endDate?new Date(r.endDate):null;
  return buildTender({ source:'GEM', bidNumber:r.bidNumber, title:(r.title?.length>300?r.title.slice(0,297)+'...':r.title), department:r.department||null, organization:r.organization||null, locationState:'Chhattisgarh', locationCity:resolveCityGem(r.locationText), startDate:r.startDate?new Date(r.startDate):null, endDate, quantity:r.quantity||null, bidValue:r.bidValue??null, emdAmount:r.emdAmount??null, valueExtractionStatus:r.bidValue!=null?'extracted':'not_attempted', pdfPath:null, bidLink:r.bidLink, status:status(endDate), fetchedAt:new Date(), sourceMeta:{locationTextRaw:r.locationText||null}, rawJson:r });
}

function normCspgcl(r) {
  const endDate=r.closingDate?new Date(r.closingDate):null;
  const bidNumber=r.tenderNoticeNo?.trim()||hashKey([r.issuingOffice,r.scopeRaw,r.closingDate]);
  return buildTender({ source:'CSPGCL', bidNumber, title:r.scopeRaw, department:null, organization:r.issuingOffice||null, locationState:'Chhattisgarh', locationCity:resolveCityCspgcl(r), startDate:r.openingDate?new Date(r.openingDate):null, endDate, quantity:null, bidValue:r.estimatedCost??null, emdAmount:r.emd??null, valueExtractionStatus:r.estimatedCost!=null?'extracted':'not_attempted', pdfPath:null, bidLink:`${CSPGCL_URL}?paramflag=${r.paramflag}`, status:status(endDate), fetchedAt:new Date(), sourceMeta:{plantId:r.plantId,plantLabel:r.plantLabel,paramflag:r.paramflag,isEbidding:false}, rawJson:r });
}

// ══════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════
console.log('\n' + SEP);
console.log('  CGTenders — Scraper');
console.log(SEP);
console.log('  Started  : ' + new Date().toLocaleString('en-IN'));
console.log(SEP);

// Step 1: MongoDB
console.log('\n[1/4] Connecting to MongoDB...');
const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  log('Connected ✅');
} catch(e) {
  await client.close().catch(()=>{});
  die('MongoDB failed: ' + e.message + '\n     Check your MONGODB_URI and whitelist your IP in Atlas → Network Access.');
}

const db       = client.db(DB_NAME);
const col      = db.collection('tenders');
const logs     = db.collection('fetchlogs');
await col.createIndex({ source:1, bidNumber:1 }, { unique:true }).catch(()=>{});

// Step 2: Scrape
console.log('\n[2/4] Scraping portals...');
let gemRaw=[], cspgclRaw=[];
try { gemRaw = await fetchGem(); } catch(e) { warn('GeM failed: '+e.message); }
if (!SKIP_CSPGCL) { try { cspgclRaw = await fetchCspgcl(); } catch(e) { warn('CSPGCL failed: '+e.message); } }
else log('CSPGCL skipped');

log(`Total scraped — GeM: ${gemRaw.length}, CSPGCL: ${cspgclRaw.length}`);

// Step 3: Save
console.log('\n[3/4] Saving to MongoDB...');
const records = [
  ...gemRaw.map(r=>{ try{return normGem(r);}catch(e){warn('norm:'+e.message);return null;} }),
  ...cspgclRaw.map(r=>{ try{return normCspgcl(r);}catch(e){warn('norm:'+e.message);return null;} }),
].filter(Boolean);

let newCount=0, updatedCount=0, errors=[];
for (const t of records) {
  try {
    const res = await col.updateOne(
      { source:t.source, bidNumber:t.bidNumber },
      { $set:t, $setOnInsert:{ createdAt:new Date() } },
      { upsert:true }
    );
    if (res.upsertedCount>0) newCount++;
    else if (res.modifiedCount>0) updatedCount++;
  } catch(e) { errors.push(`${t.source}/${t.bidNumber}: ${e.message}`); }
}
log(`Saved — New: ${newCount}, Updated: ${updatedCount}`);

// Step 4: Cleanup
console.log('\n[4/4] Cleanup...');
const now=new Date();
const {modifiedCount:closed} = await col.updateMany({status:'open',endDate:{$lt:now}},{$set:{status:'closed'}});
const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-AUTO_DELETE_CLOSED_AFTER_DAYS);
const {deletedCount:deleted} = await col.deleteMany({status:'closed',endDate:{$lt:cutoff}});
log(`Marked ${closed} as closed, deleted ${deleted} old records`);

await logs.insertOne({ runAt:new Date(), source:'ALL', found:gemRaw.length+cspgclRaw.length, newCount, updatedCount, cleanedRecords:deleted, errors });
await client.close();

// Results
console.log('\n' + SEP);
console.log('  ✅  COMPLETE');
console.log(SEP);
console.log('  GeM scraped    : ' + gemRaw.length);
console.log('  CSPGCL scraped : ' + cspgclRaw.length);
console.log('  New in DB      : ' + newCount);
console.log('  Updated in DB  : ' + updatedCount);
console.log('  Errors         : ' + errors.length);
if (errors.length) errors.forEach(e=>log('  - '+e));
console.log(SEP);
console.log('  Finished : ' + new Date().toLocaleString('en-IN'));
console.log(SEP + '\n');
