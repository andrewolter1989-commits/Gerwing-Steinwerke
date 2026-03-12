window.Gerwing = window.Gerwing || {};
const Gerwing = window.Gerwing;

// ---------- Basics ----------
Gerwing.toNumber = function(v){
  if(v === null || v === undefined) return NaN;
  if(typeof v === 'number') return v;
  let s = String(v).trim();
  if(!s) return NaN;
  s = s.replace(/\./g,'').replace(',', '.').replace(/[^\d.-]/g,'');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

Gerwing.formatEuro = function(n){
  if(!Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

Gerwing.formatKg = function(n){
  if(!Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
};

// ---------- Query ----------
Gerwing.getWerkFromQuery = function(){
  const p = new URLSearchParams(window.location.search);
  return (p.get('werk') || p.get('work') || '').toLowerCase();
};

Gerwing.getWerkLabel = function(werk){
  return werk ? werk.charAt(0).toUpperCase() + werk.slice(1) : '';
};

// ---------- Fetch ----------
Gerwing.fetchText = async function(path){
  const res = await fetch(path + '?v=' + Date.now(), { cache: 'no-store' });
  if(!res.ok) throw new Error(`HTTP ${res.status} beim Laden: ${path}`);
  return await res.text();
};

Gerwing.fetchJson = async function(path){
  const res = await fetch(path + '?v=' + Date.now(), { cache: 'no-store' });
  if(!res.ok) throw new Error(`HTTP ${res.status} beim Laden: ${path}`);
  return await res.json();
};

// ---------- CSV ----------
Gerwing.parseCSV = function(text){
  const rawLines = String(text)
    .replace(/\r\n/g,'\n')
    .replace(/\r/g,'\n')
    .split('\n')
    .map(l => l.trimEnd())
    .filter(l => l.trim().length > 0);

  if(rawLines.length === 0) return [];

  const delim = rawLines.find(l => l.includes(';')) ? ';' : ',';
  const split = (line) => line.split(delim).map(c => c.trim());

  // passende Header-Zeile suchen
  let headerIndex = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const cols = split(rawLines[i]).map(c => c.toLowerCase());

    const isZonesHeader =
      cols.includes('forwarder') &&
      cols.some(c => c === 'dest from' || c === 'dest to') &&
      cols.includes('zone');

    const isRatesHeader =
      cols.includes('forwarder') &&
      cols.some(c => c === 'chg from') &&
      cols.some(c => c === 'chg to');

    if (isZonesHeader || isRatesHeader) {
      headerIndex = i;
      break;
    }
  }

  const header = split(rawLines[headerIndex]);
  const rows = [];

  for (let i = headerIndex + 1; i < rawLines.length; i++) {
    const cols = split(rawLines[i]);
    const obj = {};
    for (let j = 0; j < header.length; j++) {
      obj[header[j]] = (cols[j] ?? '').trim();
    }
    rows.push(obj);
  }

  return rows;
};

// ---------- Zones ----------
Gerwing.buildZonesIndex = function(zoneRows){
  const byForwarder = new Map();

  for(const r of zoneRows){
    const fwd = (r['Forwarder'] || r['forwarder'] || '').trim();
    if(!fwd) continue;

    const from = Gerwing.toNumber(r['Dest From'] ?? r['Dest from'] ?? r['DestFrom']);
    const to   = Gerwing.toNumber(r['Dest To'] ?? r['Dest to'] ?? r['DestTo']);
    const zone = String(r['Zone'] ?? '').trim();

    if(!Number.isFinite(from) || !Number.isFinite(to) || !zone) continue;

    if(!byForwarder.has(fwd)) byForwarder.set(fwd, []);
    byForwarder.get(fwd).push({ from, to, zone });
  }

  return {
    listForwarders(){ return Array.from(byForwarder.keys()); },
    zoneFor(forwarder, plz){
      const arr = byForwarder.get(forwarder);
      if(!arr) return null;
      const p = Gerwing.toNumber(plz);
      if(!Number.isFinite(p)) return null;
      for(const it of arr){
        if(p >= it.from && p <= it.to) return it.zone;
      }
      return null;
    }
  };
};

// ---------- Rates ----------
Gerwing.buildRatesIndex = function(rateRows){
  const index = new Map();

  for(const r of rateRows){
    const fwd = (r['Forwarder'] || '').trim();
    if(!fwd) continue;

    const from = Gerwing.toNumber(r['CHG from']);
    const to = Gerwing.toNumber(r['CHG to']);
    if(!Number.isFinite(from) || !Number.isFinite(to)) continue;

    const byZone = {};
    for(const k of Object.keys(r)){
      const m = k.match(/^Zone\s*(\d+)/i);
      if(m){
        const zoneNo = m[1];
        const price = Gerwing.toNumber(r[k]);
        if(Number.isFinite(price)) byZone[zoneNo] = price;
      }
    }

    if(!index.has(fwd)) index.set(fwd, []);
    index.get(fwd).push({ from, to, byZone });
  }

  return {
    listForwarders(){ return Array.from(index.keys()); },
    hasBand(forwarder, kg){
      const arr = index.get(forwarder);
      if(!arr) return false;
      const w = Gerwing.toNumber(kg);
      return arr.some(b => w >= b.from && w <= b.to);
    },
    priceFor(forwarder, kg, zone){
      const arr = index.get(forwarder);
      if(!arr) return null;
      const w = Gerwing.toNumber(kg);
      const z = String(zone || '').trim();
      for(const b of arr){
        if(w >= b.from && w <= b.to){
          return b.byZone[z] ?? null;
        }
      }
      return null;
    }
  };
};

// ---------- Files ----------
Gerwing.filesForWerk = function(werk){
  if(!werk) return null;
  return {
    zones: `zones_${werk}.csv`,
    rates: `rates_${werk}.csv`,
    floater: `floater_${werk}.json`,
    surcharges: `surcharges_${werk}.json`
  };
};