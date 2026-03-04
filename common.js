/* Shared helpers for Gerwing Steinwerke Preisrechner (GitHub Pages friendly) */
(function(){
  'use strict';

  function getQueryParam(name, fallback=null){
    try{
      const url = new URL(window.location.href);
      return url.searchParams.get(name) ?? fallback;
    }catch(e){
      // very old browsers
      const m = new RegExp('[?&]'+name+'=([^&]+)').exec(window.location.search);
      return m ? decodeURIComponent(m[1]) : fallback;
    }
  }

  async function fetchText(url){
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok){
      throw new Error(`HTTP ${res.status} beim Laden von ${url}`);
    }
    return await res.text();
  }

  async function fetchJson(url){
    const txt = await fetchText(url);
    try{ return JSON.parse(txt); }
    catch(e){ throw new Error(`JSON ungültig: ${url}`); }
  }

  function parseCsv(csvText){
    const lines = (csvText||'')
      .replace(/\r\n/g,'\n')
      .replace(/\r/g,'\n')
      .split('\n')
      .map(l=>l.trimEnd())
      .filter(l=>l.trim().length>0);

    if(lines.length===0) return [];

    // Detect delimiter ; or , (prefer ;)
    const headerLine = lines[0];
    const delim = headerLine.includes(';') ? ';' : ',';

    const parseLine = (line)=>{
      const out=[];
      let cur='';
      let inQ=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(ch==='"'){
          if(inQ && line[i+1]==='"'){ cur+='"'; i++; }
          else inQ=!inQ;
        }else if(ch===delim && !inQ){
          out.push(cur);
          cur='';
        }else{
          cur+=ch;
        }
      }
      out.push(cur);
      return out.map(s=>s.trim());
    };

    const headers = parseLine(lines[0]).map(h=>h.replace(/^\uFEFF/,''));
    const rows=[];
    for(let i=1;i<lines.length;i++){
      const cols=parseLine(lines[i]);
      const row={};
      for(let c=0;c<headers.length;c++){
        row[headers[c]] = (cols[c] ?? '').trim();
      }
      rows.push(row);
    }
    return rows;
  }

  function parseEuroNumber(v){
    if(v==null) return NaN;
    if(typeof v==='number') return v;
    let s=String(v).trim();
    if(s==='') return NaN;
    s=s.replace(/\s/g,'');
    // Remove currency symbols
    s=s.replace(/€/g,'');
    // Convert German format 1.234,56 -> 1234.56
    // If both . and , exist assume . thousands and , decimal.
    if(s.includes(',') && s.includes('.')){
      s=s.replace(/\./g,'').replace(',', '.');
    }else if(s.includes(',')){
      // If only comma, treat as decimal separator
      s=s.replace(',', '.');
    }
    // Remove any non-number leftover
    s=s.replace(/[^0-9.+-]/g,'');
    const n=Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatEuro(n){
    if(n==null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatKg(n){
    if(n==null || !Number.isFinite(n)) return '—';
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Build zones mapping from zones csv (expects columns: PLZ, Zone or similar)
  function buildZones(rows){
    const map = new Map();
    for(const r of rows){
      const plz = (r.PLZ ?? r.plz ?? r.Zip ?? r.zip ?? r.Postleitzahl ?? '').toString().trim();
      const zoneRaw = (r.Zone ?? r.zone ?? r.ZONE ?? '').toString().trim();
      if(!plz) continue;
      const zone = zoneRaw ? Number(zoneRaw) : NaN;
      if(Number.isFinite(zone)) map.set(plz, zone);
    }
    return map;
  }

  // Expose
  window.GS = {
    getQueryParam,
    fetchText,
    fetchJson,
    parseCsv,
    parseEuroNumber,
    formatEuro,
    formatKg,
    buildZones
  };

  // Backwards-compatible globals (older pages call these directly)
  window.getQueryParam = getQueryParam;
  window.fetchText = fetchText;
  window.fetchJson = fetchJson;
  window.parseCsv = parseCsv;
  window.parseEuroNumber = parseEuroNumber;
  window.formatEuro = formatEuro;
  window.formatKg = formatKg;
  window.buildZones = buildZones;
})();
