/* Gerwing Steinwerke Preisrechner – Common Utilities (v5)
   - No dependencies
   - Works on GitHub Pages (relative fetch)
*/
(function(){
  'use strict';

  const Gerwing = {};

  // ---------- Formatting ----------
  Gerwing.toNumber = function(v){
    if(v === null || v === undefined) return NaN;
    if(typeof v === 'number') return v;
    let s = String(v).trim();
    if(!s) return NaN;
    // allow German decimal comma
    s = s.replace(/\./g,'').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  Gerwing.formatEuro = function(n){
    if(!Number.isFinite(n)) return '—';
    return n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  };

  Gerwing.formatKg = function(n){
    if(!Number.isFinite(n)) return '—';
    return n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' kg';
  };

  // ---------- Query / path helpers ----------
  Gerwing.getWerkFromQuery = function(){
    const u = new URL(window.location.href);
    // accept both ?werk= and ?work=
    return (u.searchParams.get('werk') || u.searchParams.get('work') || '').toLowerCase();
  };

  Gerwing.getWerkLabel = function(werk){
    if(!werk) return '';
    return werk.charAt(0).toUpperCase() + werk.slice(1);
  };

  // ---------- Fetch helpers ----------
  Gerwing.fetchText = async function(path){
    const res = await fetch(path, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} beim Laden: ${path}`);
    return await res.text();
  };

  Gerwing.fetchJson = async function(path){
    const res = await fetch(path, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} beim Laden: ${path}`);
    return await res.json();
  };

  // ---------- CSV parsing (semicolon or comma, tolerant) ----------
  Gerwing.parseCSV = function(text){
    const lines = String(text).replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n')
      .map(l=>l.trimEnd())
      .filter(l=>l.trim().length>0);
    if(lines.length===0) return [];
    const delim = lines[0].includes(';') ? ';' : ',';

    const split = (line)=>{
      // very simple CSV: no quoted delimiters expected in our input
      return line.split(delim).map(c=>c.trim());
    };

    const header = split(lines[0]);
    const rows = [];
    for(let i=1;i<lines.length;i++){
      const cols = split(lines[i]);
      const obj = {};
      for(let j=0;j<header.length;j++) obj[header[j]] = (cols[j] ?? '').trim();
      rows.push(obj);
    }
    return rows;
  };

  // ---------- Data builders ----------

  // zones CSV format: Forwarder;Dest from;Dest to;Zone;Label
  Gerwing.buildZonesIndex = function(zoneRows){
    const byForwarder = new Map();
    for(const r of zoneRows){
      const fwd = (r['Forwarder'] || r['forwarder'] || '').trim();
      if(!fwd) continue;
      const from = Gerwing.toNumber(r['Dest from'] ?? r['Dest From'] ?? r['Dest_from'] ?? r['Destfrom']);
      const to = Gerwing.toNumber(r['Dest to'] ?? r['Dest To'] ?? r['Dest_to'] ?? r['Destto']);
      const zone = (r['Zone'] ?? r['zone'] ?? '').toString().trim();
      if(!Number.isFinite(from) || !Number.isFinite(to) || !zone) continue;
      if(!byForwarder.has(fwd)) byForwarder.set(fwd, []);
      byForwarder.get(fwd).push({from, to, zone});
    }
    // sort ranges for binary-ish scan
    for(const [k, arr] of byForwarder.entries()){
      arr.sort((a,b)=>a.from-b.from);
      byForwarder.set(k, arr);
    }
    return {
      listForwarders(){ return Array.from(byForwarder.keys()); },
      zoneFor(forwarder, plz){
        const arr = byForwarder.get(forwarder);
        if(!arr) return null;
        const p = Gerwing.toNumber(plz);
        if(!Number.isFinite(p)) return null;
        // linear scan (ranges are not huge)
        for(const it of arr){
          if(p >= it.from && p <= it.to) return it.zone;
        }
        return null;
      }
    };
  };

  // rates CSV format: Forwarder;Bereich;Version;CHG from;CHG to;Unit;Zone 1;Zone 2;...
  Gerwing.buildRatesIndex = function(rateRows){
    // index[forwarder] = [{from,to, byZone: {1:price,...}}]
    const index = new Map();
    const zoneCols = (row)=>Object.keys(row).filter(k=>/^Zone\s*\d+/i.test(k));

    for(const r of rateRows){
      const fwd = (r['Forwarder'] || r['forwarder'] || '').trim();
      if(!fwd) continue;
      const from = Gerwing.toNumber(r['CHG from'] ?? r['CHG From'] ?? r['CHG_from']);
      const to = Gerwing.toNumber(r['CHG to'] ?? r['CHG To'] ?? r['CHG_to']);
      if(!Number.isFinite(from) || !Number.isFinite(to)) continue;
      const byZone = {};
      for(const zc of zoneCols(r)){
        const zn = String(zc).match(/(\d+)/)?.[1];
        if(!zn) continue;
        const price = Gerwing.toNumber(r[zc]);
        if(Number.isFinite(price)) byZone[zn] = price;
      }
      if(!index.has(fwd)) index.set(fwd, []);
      index.get(fwd).push({from, to, byZone});
    }

    for(const [k, arr] of index.entries()){
      arr.sort((a,b)=>a.from-b.from);
      index.set(k, arr);
    }

    return {
      listForwarders(){ return Array.from(index.keys()); },
      priceFor(forwarder, kg, zone){
        const arr = index.get(forwarder);
        if(!arr) return null;
        const w = Gerwing.toNumber(kg);
        if(!Number.isFinite(w)) return null;
        const z = String(zone ?? '').trim();
        if(!z) return null;
        for(const band of arr){
          if(w >= band.from && w <= band.to){
            const p = band.byZone[z];
            return (p === undefined) ? null : p;
          }
        }
        return null;
      },
      hasBand(forwarder, kg){
        const arr = index.get(forwarder);
        if(!arr) return false;
        const w = Gerwing.toNumber(kg);
        if(!Number.isFinite(w)) return false;
        return arr.some(b=>w>=b.from && w<=b.to);
      }
    };
  };

  // ---------- File naming ----------
  Gerwing.filesForWerk = function(werk){
    const w = (werk||'').toLowerCase();
    if(!w) return null;
    return {
      rates: `rates_${w}.csv`,
      zones: `zones_${w}.csv`,
      floater: `floater_${w}.json`,
      surcharges: `surcharges_${w}.json`
    };
  };

  // expose
  window.Gerwing = Gerwing;
})();
