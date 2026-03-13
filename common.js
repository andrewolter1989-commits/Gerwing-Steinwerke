/* Gerwing Steinwerke Preisrechner – Common Utilities (v6 stable) */
(function(){
  'use strict';

  window.Gerwing = window.Gerwing || {};
  const Gerwing = window.Gerwing;

  Gerwing.toNumber = function(v){
    if(v === null || v === undefined) return NaN;
    if(typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    let s = String(v).trim();
    if(!s) return NaN;
    s = s.replace(/\u00A0/g,' ').replace(/€/g,'').trim();
    s = s.replace(/\./g,'').replace(',', '.').replace(/[^\d\-\.]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  Gerwing.formatEuro = function(n){
    if(!Number.isFinite(n)) return '—';
    return n.toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2});
  };

  Gerwing.formatKg = function(n){
    if(!Number.isFinite(n)) return '—';
    return n.toLocaleString('de-DE', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' kg';
  };

  Gerwing.getWerkFromQuery = function(){
    const u = new URL(window.location.href);
    return (u.searchParams.get('werk') || u.searchParams.get('work') || '').toLowerCase();
  };

  Gerwing.getWerkLabel = function(werk){
    if(!werk) return '';
    return werk.charAt(0).toUpperCase() + werk.slice(1);
  };

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

  Gerwing.parseCSV = function(text){
    const rawLines = String(text)
      .replace(/\r\n/g,'\n')
      .replace(/\r/g,'\n')
      .split('\n')
      .map(l => l.trimEnd())
      .filter(l => l.trim().length > 0);

    if(rawLines.length === 0) return [];

    const delim = rawLines.find(l => l.includes(';')) ? ';' : ',';
    const split = (line) => line.split(delim).map(c => c.trim().replace(/^\uFEFF/, ''));

    let headerIndex = 0;
    for(let i=0;i<rawLines.length;i++){
      const cols = split(rawLines[i]).map(c => c.toLowerCase());
      const isZonesHeader = cols.includes('forwarder') && cols.includes('zone') && cols.some(c => c === 'dest from' || c === 'dest to');
      const isRatesHeader = cols.includes('forwarder') && cols.some(c => c === 'chg from') && cols.some(c => c === 'chg to');
      if(isZonesHeader || isRatesHeader){
        headerIndex = i;
        break;
      }
    }

    const header = split(rawLines[headerIndex]);
    const rows = [];
    for(let i=headerIndex+1;i<rawLines.length;i++){
      const cols = split(rawLines[i]);
      const obj = {};
      for(let j=0;j<header.length;j++) obj[header[j]] = (cols[j] ?? '').trim();
      rows.push(obj);
    }
    return rows;
  };

  Gerwing.buildZonesIndex = function(zoneRows){
    const byForwarder = new Map();
    for(const r of zoneRows){
      const fwd = (r['Forwarder'] || r['forwarder'] || '').trim();
      if(!fwd) continue;
      const from = Gerwing.toNumber(r['Dest from'] ?? r['Dest From'] ?? r['Dest_from'] ?? r['DestFrom']);
      const to = Gerwing.toNumber(r['Dest to'] ?? r['Dest To'] ?? r['Dest_to'] ?? r['DestTo']);
      const zone = String(r['Zone'] ?? r['zone'] ?? '').trim();
      if(!Number.isFinite(from) || !Number.isFinite(to) || !zone) continue;
      if(!byForwarder.has(fwd)) byForwarder.set(fwd, []);
      byForwarder.get(fwd).push({from, to, zone});
    }
    for(const [k, arr] of byForwarder.entries()){
      arr.sort((a,b) => a.from - b.from);
      byForwarder.set(k, arr);
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

  Gerwing.buildRatesIndex = function(rateRows){
    const index = new Map();
    const zoneCols = (row)=>Object.keys(row).filter(k=>/^Zone\s*\d+/i.test(k));
    const normBereich = (v)=>String(v ?? '').trim().toLowerCase();

    const pushBand = (key, band) => {
      if(!key) return;
      if(!index.has(key)) index.set(key, []);
      index.get(key).push(band);
    };

    for(const r of rateRows){
      const fwd = (r['Forwarder'] || r['forwarder'] || '').trim();
      if(!fwd) continue;
      const bereich = normBereich(r['Bereich'] ?? r['bereich']);
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

      const band = {from, to, byZone};
      // Base key always available for standard forwarders
      pushBand(fwd, band);

      // Composite key for special tariff branches, e.g. Böckmann freight/bau
      if(bereich){
        pushBand(`${fwd}|${bereich}`, band);
      }
    }

    for(const [k, arr] of index.entries()){
      arr.sort((a,b) => a.from - b.from);
      index.set(k, arr);
    }

    const resolveKeys = (forwarder) => {
      const f = String(forwarder ?? '').trim();
      if(!f) return [];
      const lower = f.toLowerCase();
      const keys = [f];
      // Alias handling for Böckmann freight/bau tariffs
      if(lower === 'böckmann|freight' || lower === 'bockmann|freight'){
        keys.unshift('Böckmann|freight','Bockmann|freight','Böckmann|freght','Bockmann|freght');
      } else if(lower === 'böckmann|bau' || lower === 'bockmann|bau'){
        keys.unshift('Böckmann|bau','Bockmann|bau');
      }
      return Array.from(new Set(keys));
    };

    return {
      listForwarders(){
        return Array.from(index.keys()).filter(k => !k.includes('|'));
      },
      priceFor(forwarder, kg, zone){
        const w = Gerwing.toNumber(kg);
        if(!Number.isFinite(w)) return null;
        const z = String(zone ?? '').trim();
        if(!z) return null;
        for(const key of resolveKeys(forwarder)){
          const arr = index.get(key);
          if(!arr) continue;
          for(const band of arr){
            if(w >= band.from && w <= band.to){
              const p = band.byZone[z];
              if(p !== undefined) return p;
            }
          }
        }
        return null;
      },
      hasBand(forwarder, kg){
        const w = Gerwing.toNumber(kg);
        if(!Number.isFinite(w)) return false;
        for(const key of resolveKeys(forwarder)){
          const arr = index.get(key);
          if(arr && arr.some(b => w >= b.from && w <= b.to)) return true;
        }
        return false;
      }
    };
  };

  Gerwing.filesForWerk = function(werk){
    const w = (werk || '').toLowerCase();
    if(!w) return null;
    return {
      rates: `rates_${w}.csv`,
      zones: `zones_${w}.csv`,
      floater: `floater_${w}.json`,
      surcharges: `surcharges_${w}.json`
    };
  };
})();
