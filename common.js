
function qsParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
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
