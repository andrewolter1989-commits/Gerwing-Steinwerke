
let DATA = null;

function showErr(msg){
  const el = document.getElementById("msgErr");
  el.textContent = msg;
  el.classList.remove("d-none");
}
function clearErr(){
  document.getElementById("msgErr").classList.add("d-none");
  document.getElementById("msgErr").textContent = "";
}
function showHint(msg){
  const el = document.getElementById("msgHint");
  el.textContent = msg;
  el.classList.remove("d-none");
}
function clearHint(){
  document.getElementById("msgHint").classList.add("d-none");
  document.getElementById("msgHint").textContent = "";
}

function normalizePlz(v){
  const s = String(v||"").trim();
  const m = s.match(/\d{5}/);
  return m ? m[0] : "";
}
function parseKg(v){
  const s = String(v||"").trim().replace(/\s/g,"");
  if(!s) return NaN;
  // allow german comma
  const n = Number(s.replace(",","."));
  return Number.isFinite(n) ? n : NaN;
}

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

function zoneForPlz(zonesMap, forwarder, plz){
  const ranges = zonesMap.get(forwarder);
  if(!ranges) return null;
  const p = parseInt(plz,10);
  for(const rg of ranges){
    if(p>=rg.from && p<=rg.to) return rg.zone;
  }
  return null;
}

function bandForWeight(ratesMap, forwarder, kg){
  const bands = ratesMap.get(forwarder);
  if(!bands) return null;
  for(const b of bands){
    if(kg>=b.from && kg<=b.to) return b;
  }
  return null;
}

function setSummary(summary){
    // summary: {stops:[], totalKg:number, stopCount:number, baustelle:boolean, best:{name,total}|null}
    const s = summary || {};
    const plz = (s.stops?.[0]?.plz) || '—';
    const w1 = (s.stops?.[0]?.kg) ?? null;
    const opts = [];
    if(s.baustelle) opts.push('Baustelle');
    if((s.stopCount||1) >= 2) opts.push('2. Stopp');
    if((s.stopCount||1) >= 3) opts.push('3. Stopp');

    document.getElementById('sumPlz').textContent = plz;
    document.getElementById('sumGew').textContent = fmtKg(w1)
    document.getElementById('sumOpt').textContent = opts.length? opts.join(', ') : '—';

    document.getElementById('sumTotals').textContent =
      `${fmtKg(s.totalKg||0)} / ${(s.stopCount||1)} Stop${(s.stopCount||1)>1?'ps':''} / ${s.baustelle?'Baustellentour':'Standard'}`;

    const stopsLine = (s.stops||[]).map((st,i)=>`PLZ${i+1}: ${st.plz} / Gewicht${i+1}: ${fmtKg(st.kg)}`).join(' | ');
    document.getElementById('sumStops').textContent = stopsLine || '—';

    const best = s.best;
    document.getElementById('bestName').textContent = best ? best.name : '—';
    document.getElementById('bestPrice').textContent = best ? `(${money(best.total)})` : '';
  }


  function renderRows(rows, view){
    // view: {showBaustelle, showStop2, showStop3}
    const v = Object.assign({showBaustelle:false, showStop2:false, showStop3:false}, view||{});
    const cols = [
      {key:'forwarder', label:'Spediteur'},
      {key:'zone', label:'Zone'},
      {key:'base', label:'Basis (€)'},
    ];
    if(v.showBaustelle) cols.push({key:'baustelle', label:'Baustelle (€)'});
    if(v.showStop2) cols.push({key:'stop2', label:'2. Stopp (€)'});
    if(v.showStop3) cols.push({key:'stop3', label:'3. Stopp (€)'});
    cols.push(
      {key:'floaterPct', label:'Floater (%)'},
      {key:'floaterEur', label:'Floater (€)'},
      {key:'total', label:'Preis (€)'},
      {key:'reason', label:'Grund'}
    );

    // Build header
    const theadRow = document.getElementById('theadRow');
    theadRow.innerHTML = cols.map(c=>`<th>${c.label}</th>`).join('');

    // Find cheapest (valid totals only)
    const valid = rows.filter(r => typeof r.total === 'number' && isFinite(r.total));
    const minTotal = valid.length ? Math.min(...valid.map(r=>r.total)) : null;

    const body = document.getElementById('rows');
    if(!rows.length){
      body.innerHTML = `<tr><td colspan="${cols.length}" class="text-muted">Noch keine Berechnung.</td></tr>`;
      return;
    }

    const showBlankZero = (n)=> (n===0 ? '' : money(n));
    const showBlankPct = (p)=> (p===0 ? '' : (String(p).replace('.',',') + '%'));

    body.innerHTML = rows.map(r=>{
      const isBest = (minTotal!==null && typeof r.total==='number' && Math.abs(r.total-minTotal)<0.0001);
      const trClass = isBest ? 'table-success' : '';
      const cells = [];
      cells.push(`<td>${r.forwarder}</td>`);
      cells.push(`<td>${r.zone ?? '—'}</td>`);
      cells.push(`<td>${r.base!=null? money(r.base): '—'}</td>`);

      if(v.showBaustelle){
        let val = '';
        if(r.baustelleIncluded) val = 'inkl.';
        else if(typeof r.baustelle === 'number') val = showBlankZero(r.baustelle);
        cells.push(`<td>${val}</td>`);
      }
      if(v.showStop2){
        const val = (typeof r.stop2 === 'number') ? showBlankZero(r.stop2) : '';
        cells.push(`<td>${val}</td>`);
      }
      if(v.showStop3){
        const val = (typeof r.stop3 === 'number') ? showBlankZero(r.stop3) : '';
        cells.push(`<td>${val}</td>`);
      }

      cells.push(`<td>${r.floaterPct!=null? showBlankPct(r.floaterPct): ''}</td>`);
      cells.push(`<td>${typeof r.floaterEur==='number'? (r.floaterEur===0?'':money(r.floaterEur)) : ''}</td>`);
      cells.push(`<td>${typeof r.total==='number'? money(r.total): '—'}</td>`);
      cells.push(`<td>${r.reason||''}</td>`);
      return `<tr class="${trClass}">${cells.join('')}</tr>`;
    }).join('');
  }


  function calc(){
  clearErr();
  clearHint();
  if(!DATA) { showErr("Daten sind noch nicht geladen."); return; }

  let stops, opts=[];
  try{
    stops = validateStops();
  }catch(e){
    showErr(e.message);
    return;
  }
  if(document.getElementById("chkBaustelle").checked) opts.push("Baustelle");
  if(document.getElementById("chk2").checked) opts.push("2. Stopp");
  if(document.getElementById("chk3").checked) opts.push("3. Stopp");

  const totalKg = stops.reduce((s,x)=>s+x.kg,0);

  const rows=[];
  let cheapest=null;
  let cheapestVal=Infinity;

  for(const forwarder of DATA.forwarders){
    // zone based on first stop (typical); you can extend per stop if needed
    const zone = zoneForPlz(DATA.zones, forwarder, stops[0].plz);
    if(zone==null){
      rows.push({forwarder, zone:"—", base:NaN, baustelle:NaN, baustelleIncluded:false, stop2:NaN, stop3:NaN, floaterPct: DATA.floater[forwarder] ?? 0, floaterEur:NaN, total:NaN, reason:"Keine Zone"});
      continue;
    }
    const band = bandForWeight(DATA.rates, forwarder, totalKg);
    if(!band){
      rows.push({forwarder, zone, base:NaN, baustelle:0, stop2:0, stop3:0, floaterPct: DATA.floater[forwarder] ?? 0, floaterEur:NaN, total:NaN, reason:"Kein Gewichtsband"});
      continue;
    }
    const base = band.prices.get(zone);
    if(!Number.isFinite(base)){
      rows.push({forwarder, zone, base:NaN, baustelle:0, stop2:0, stop3:0, floaterPct: DATA.floater[forwarder] ?? 0, floaterEur:NaN, total:NaN, reason:`Kein Preis für Zone ${zone}`});
      continue;
    }

    let reason = "";
    // surcharges (supports both JSON formats)
    const sur = DATA.surcharges || {};
    const getSur = (key)=>{
      // format A: { "Forwarder": {"baustelle": 0, "stop2": 0, "stop3": 0} }
      if(sur[forwarder] && typeof sur[forwarder] === 'object'){
        const v = sur[forwarder][key];
        if(Number.isFinite(v)) return v;
      }
      // format B: { "baustelle": {"Forwarder": 0}, "stop2": {...}, "stop3": {...} }
      if(sur[key] && typeof sur[key] === 'object'){
        const v = sur[key][forwarder];
        if(Number.isFinite(v)) return v;
      }
      return NaN;
    };

    let baustelle=0, s2=0, s3=0;
    const forwarderName = r.forwarder;
    // Special case: Böckmann has Baustellentarif already included in the base rates
    let baustelleIncluded = false;

    if(document.getElementById("chkBaustelle").checked){
      if(forwarderName === "Böckmann"){
        baustelle = 0;
        baustelleIncluded = true;
      } else {
        const v = getSur('baustelle');
        if(Number.isFinite(v)) baustelle = v;
        else reason = reason || "Keine Baustellenzustellung";
      }
    }

    if(document.getElementById("chk2").checked){
      const v = getSur('stop2');
      if(Number.isFinite(v)) s2 = v;
      else reason = reason || "Kein 2. Stopp";
    }
    if(document.getElementById("chk3").checked){
      const v = getSur('stop3');
      if(Number.isFinite(v)) s3 = v;
      else reason = reason || "Kein 3. Stopp";
    }

    const floPct = Number(DATA.floater[forwarder] ?? 0);
    const floEur = round2(base * (floPct/100));
    const total = round2(base + floEur + baustelle + s2 + s3);

    rows.push({forwarder, zone, base, baustelle, baustelleIncluded, stop2:s2, stop3:s3, floaterPct:floPct, floaterEur:floEur, total, reason});

    if(Number.isFinite(total) && total < cheapestVal){
      cheapestVal = total;
      cheapest = `${forwarder} (${money(total)} €)`;
    }
  }

  renderRows(rows, {
    showBaustelle: document.getElementById("chkBaustelle").checked,
    showStop2: document.getElementById("chk2").checked,
    showStop3: document.getElementById("chk3").checked
  });
  setSummary({
    stops,
    totalKg,
    stopCount: stops.length,
    baustelle: document.getElementById("chkBaustelle").checked,
    best: cheapest ? {name: cheapest.name, total: cheapest.total} : null
  });
}

async function loadData(){
  const werk = (qsParam("werk") || qsParam("work") || "holdorf").toLowerCase();
  const pretty = werk==="clausnitz" ? "Werk Clausnitz" : "Werk Holdorf";
  document.getElementById("title").textContent = `Gerwing Steinwerke Preisrechner — ${pretty}`;

  const zonesFile = `zones_${werk}.csv`;
  const ratesFile = `rates_${werk}.csv`;
  const floFile = `floater_${werk}.json`;
  const surFile = `surcharges_${werk}.json`;

  try{
    const [zTxt, rTxt, fTxt, sTxt] = await Promise.all([
      fetchText(zonesFile),
      fetchText(ratesFile),
      fetchText(floFile),
      fetchText(surFile),
    ]);
    const zonesRows = parseCsv(zTxt);
    const ratesRows = parseCsv(rTxt);
    const zones = buildZones(zonesRows);
    const rates = buildRates(ratesRows);
    const flo = JSON.parse(fTxt);
    const sur = JSON.parse(sTxt);

    // forwarders = intersection of zones & rates (stable)
    const set = new Set([...zones.keys()].filter(x => rates.has(x)));
    const forwarders = [...set].sort((a,b)=>a.localeCompare(b,"de"));

    DATA = {werk, zones, rates, floater: flo||{}, surcharges: sur||{}, forwarders};
    showHint(`Daten geladen: ${forwarders.length} Spediteure.`);
  }catch(e){
    showErr(e.message || String(e));
  }
}

function wireUI(){
  document.getElementById("btnCalc").addEventListener("click", calc);
  document.getElementById("btnReset").addEventListener("click", ()=>{
    clearErr(); clearHint();
    for(const id of ["plz1","w1","plz2","w2","plz3","w3"]){ document.getElementById(id).value=""; }
    for(const id of ["chkBaustelle","chk2","chk3"]){ document.getElementById(id).checked=false; }
    document.getElementById("stop2Box").classList.add("d-none");
    document.getElementById("stop3Box").classList.add("d-none");
    document.getElementById("tbody").innerHTML = `<tr><td colspan="10" class="muted">Noch keine Berechnung.</td></tr>`;
    document.getElementById("summaryLeft").innerHTML = `
      <div><b>PLZ:</b> —</div>
      <div><b>Gewicht:</b> —</div>
      <div><b>Optionen:</b> —</div>
      <div class="mt-2"><b>Gesamtgewicht / Stops / Baustelle:</b> —</div>
      <div><b>Stops:</b> —</div>
    `;
    document.getElementById("summaryRight").innerHTML = `<div class="fw-bold">Günstigster Anbieter</div><div>—</div>`;
  });

  const chk2 = document.getElementById("chk2");
  const chk3 = document.getElementById("chk3");
  chk2.addEventListener("change", ()=>{ document.getElementById("stop2Box").classList.toggle("d-none", !chk2.checked); });
  chk3.addEventListener("change", ()=>{ document.getElementById("stop3Box").classList.toggle("d-none", !chk3.checked); });
}

wireUI();
renderRows([], {showBaustelle:false, showStop2:false, showStop3:false});
loadData();
