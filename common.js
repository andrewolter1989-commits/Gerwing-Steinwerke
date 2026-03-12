
function qsParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}


function num(v){
  if(v===null || v===undefined) return 0;
  // accepts numbers, "1.234,56", "1234.56", "1 234,56 €"
  const s = String(v)
    .replace(/\s+/g,'')
    .replace(/€/g,'')
    .replace(/\./g,'')      // thousands separator
    .replace(/,/g,'.')       // decimal comma
    .replace(/[^0-9.\-]/g,'');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeHeader(s){
  return String(s||"")
    .trim()
    .toLowerCase()
    .replace(/\uFEFF/g,"")
    .replace(/\s+/g," ")
    .replace(/[^\w %]/g,""); // keep letters/numbers/underscore/space/%
}

function detectDelimiter(line){
  const semi = (line.match(/;/g)||[]).length;
  const comma = (line.match(/,/g)||[]).length;
  return semi >= comma ? ";" : ",";
}

async function fetchText(path){
  const res = await fetch(path, {cache:"no-store"});
  if(!res.ok) throw new Error(`Konnte Datei nicht laden: ${path} (${res.status})`);
  return await res.text();
}

function parseCsv(text){
  const lines = text.split(/\r?\n/).filter(l => l.trim().length>0);
  if(lines.length===0) return [];
  const delim = detectDelimiter(lines[0]);
  const rows = lines.map(l => l.split(delim).map(c => c.trim()));
  return rows;
}

function parseEuro(str){
  if(str==null) return NaN;
  const s = String(str).trim();
  if(!s) return NaN;
  // remove currency, spaces
  const cleaned = s.replace(/€/g,"").replace(/\s/g,"");
  // german format "3.465,00"
  const norm = cleaned.replace(/\./g,"").replace(",",".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}

function round2(n){ return Math.round((n + Number.EPSILON) * 100) / 100; }

function money(n){
  if(!Number.isFinite(n)) return "—";
  return n.toLocaleString("de-DE",{minimumFractionDigits:2, maximumFractionDigits:2});
}


// ---- Shared helpers used by editors & price calculator ----
function findHeaderRow(rows, required){
  for(let i=0;i<rows.length;i++){
    const norm = rows[i].map(normalizeHeader);
    let ok=true;
    for(const r of required){
      if(!norm.some(h=>h.includes(r))) { ok=false; break; }
    }
    if(ok) return {i, norm};
  }
  return null;
}

function buildZones(rows){
  const found = findHeaderRow(rows, ["forwarder","dest from","dest to","zone"]);
  if(!found) throw new Error("zones: Header nicht gefunden.");
  const header = found.norm;
  const idxF = header.findIndex(h=>h.includes("forwarder"));
  const idxFrom = header.findIndex(h=>h.includes("dest from"));
  const idxTo = header.findIndex(h=>h.includes("dest to"));
  const idxZone = header.findIndex(h=>h.includes("zone"));
  const map = new Map();
  for(let r=found.i+1;r<rows.length;r++){
    const row = rows[r];
    const f = row[idxF]?.trim();
    if(!f) continue;
    const from = parseInt(row[idxFrom],10);
    const to = parseInt(row[idxTo],10);
    const zone = parseInt(row[idxZone],10);
    if(!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(zone)) continue;
    if(!map.has(f)) map.set(f, []);
    map.get(f).push({from,to,zone});
  }
  // sort ranges
  for(const [k,v] of map.entries()){
    v.sort((a,b)=>a.from-b.from);
  }
  return map;
}

function buildRates(rows){
  const found = findHeaderRow(rows, ["forwarder","chg from","chg to","unit"]);
  if(!found) throw new Error("rates: Header nicht gefunden.");
  const header = found.norm;
  const idxF = header.findIndex(h=>h.includes("forwarder"));
  const idxFrom = header.findIndex(h=>h.includes("chg from"));
  const idxTo = header.findIndex(h=>h.includes("chg to"));
  const idxUnit = header.findIndex(h=>h.includes("unit"));
  // zone columns
  const zoneCols = [];
  for(let i=0;i<header.length;i++){
    const m = header[i].match(/zone\s*(\d+)/);
    if(m) zoneCols.push({zone: parseInt(m[1],10), idx:i});
  }
  if(zoneCols.length===0) throw new Error("rates: Keine Zone-Spalten gefunden.");
  const map = new Map();
  for(let r=found.i+1;r<rows.length;r++){
    const row = rows[r];
    const f = row[idxF]?.trim();
    if(!f) continue;
    const from = parseEuro(row[idxFrom]);
    const to = parseEuro(row[idxTo]);
    const unit = (row[idxUnit]||"").trim();
    if(!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const prices = new Map();
    for(const zc of zoneCols){
      const p = parseEuro(row[zc.idx]);
      if(Number.isFinite(p)) prices.set(zc.zone, p);
    }
    if(!map.has(f)) map.set(f, []);
    map.get(f).push({from,to,unit,prices});
  }
  for(const [k,v] of map.entries()){
    v.sort((a,b)=>a.from-b.from);
  }
  return map;
}

window.buildZones = buildZones;
window.buildRates = buildRates;
