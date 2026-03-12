/* Gerwing Steinwerke Preisrechner – App Logic (v5)
   Depends on common.js (window.Gerwing)

   Notes:
   - Works with the IDs from preisrechner.html in this repo (plz1, w1, chkBaustelle, chk2, chk3, stop2Box, stop3Box, tbody, theadRow, ...)
*/
(function(){
  'use strict';

  const G = window.Gerwing;

  const STATE = {
    werk: '',
    files: null,
    zones: null,
    rates: null,
    floaters: {},
    surcharges: {},
    forwarders: [],
    loaded: false
  };

  const SPECIAL = {
    // Baustelle ist bei Böckmann im Preis enthalten (wenn Baustelle ausgewählt).
    baustelleIncludedForwarders: new Set(['Böckmann','Bockmann'])
  };

  // ---------- DOM helpers ----------
  const $ = (id)=>document.getElementById(id);

  function showErr(msg){
    const el = $('msgErr');
    if(!el) return;
    el.textContent = msg || '';
    el.classList.toggle('d-none', !msg);
  }
  function showHint(msg){
    const el = $('msgHint');
    if(!el) return;
    el.textContent = msg || '';
    el.classList.toggle('d-none', !msg);
  }

  function setWerkHeading(werk){
    const titleEl = $('title');
    const h1 = $('title');
    const label = werk ? ` — Werk ${G.getWerkLabel(werk)}` : '';
    if(document.title) document.title = `Gerwing Steinwerke Preisrechner${label}`;
    if(h1) h1.textContent = `Gerwing Steinwerke Preisrechner${label}`;
  }

  // ---------- Inputs / Stops ----------
  function getStops(){
    const plz1 = ($('plz1')?.value ?? '').trim();
    const w1 = G.toNumber(($('w1')?.value ?? '').trim());

    const use2 = !!$('chk2')?.checked;
    const use3 = !!$('chk3')?.checked;

    const stops = [{idx:1, plz: plz1, weight: w1}];

    if(use2){
      const plz2 = ($('plz2')?.value ?? '').trim();
      const w2 = G.toNumber(($('w2')?.value ?? '').trim());
      stops.push({idx:2, plz: plz2, weight: w2});
    }
    if(use3){
      const plz3 = ($('plz3')?.value ?? '').trim();
      const w3 = G.toNumber(($('w3')?.value ?? '').trim());
      stops.push({idx:3, plz: plz3, weight: w3});
    }
    return stops;
  }

  function validateInputs(stops){
    const errs = [];
    if(!stops[0].plz) errs.push('Bitte PLZ eingeben.');
    if(!Number.isFinite(stops[0].weight) || stops[0].weight <= 0) errs.push('Bitte Gewicht (kg) eingeben.');
    for(const s of stops.slice(1)){
      if(!s.plz) errs.push(`Bitte PLZ ${s.idx} eingeben.`);
      if(!Number.isFinite(s.weight) || s.weight <= 0) errs.push(`Bitte Gewicht ${s.idx} (kg) eingeben.`);
    }
    return errs;
  }

  function totalWeight(stops){
    return stops.reduce((sum,s)=>sum + (Number.isFinite(s.weight)?s.weight:0), 0);
  }

  function optionsLabel(){
    const opts = [];
    if($('chkBaustelle')?.checked) opts.push('Baustelle');
    if($('chk2')?.checked) opts.push('Zweiter Stopp');
    if($('chk3')?.checked) opts.push('Dritter Stopp');
    return opts.length ? opts.join(', ') : '—';
  }

  function tourLabel(){
    return $('chkBaustelle')?.checked ? 'Baustellentour' : 'Standard';
  }

  // ---------- Pricing ----------
  function computeForForwarder(forwarder, stops, opts){
    const zones = [];
    const basePerStop = [];
    const reasons = [];

    for(const s of stops){
      const zone = STATE.zones.zoneFor(forwarder, s.plz);
      if(!zone){
        reasons.push(`Keine Zone für PLZ${s.idx} (${s.plz || '—'})`);
        zones.push(null);
        basePerStop.push(null);
        continue;
      }
      zones.push(zone);

      const price = STATE.rates.priceFor(forwarder, s.weight, zone);
      if(price === null){
        if(!STATE.rates.hasBand(forwarder, s.weight)){
          reasons.push(`Kein Gewichtsband (Stopp ${s.idx})`);
        }else{
          reasons.push(`Kein Preis für Zone ${zone} (Stopp ${s.idx})`);
        }
        basePerStop.push(null);
        continue;
      }
      basePerStop.push(price);
    }

    const zoneDisplay = zones.filter(Boolean).length===0 ? '—' : (new Set(zones.filter(Boolean)).size===1 ? zones.filter(Boolean)[0] : 'multi');

    if(basePerStop.some(p=>p===null)){
      return {
        forwarder,
        zoneDisplay,
        base: null,
        baustelle: null,
        stop2: null,
        stop3: null,
        floaterPct: opts.floaterPct,
        floaterEuro: null,
        total: null,
        reason: reasons.join(' / ') || '—',
        highlight: false
      };
    }

    const baseTotal = basePerStop.reduce((a,b)=>a+b,0);

    const sCfg = STATE.surcharges[forwarder] || {};

    // Baustelle
    let baustelleCharge = 0;
    let baustelleDisplay = null;
    if(opts.baustelle){
      if(SPECIAL.baustelleIncludedForwarders.has(forwarder)){
        baustelleDisplay = 'inkl.';
      } else {
        const v = G.toNumber(sCfg.baustelle);
        if(Number.isFinite(v) && v>0) baustelleCharge = v;
        baustelleDisplay = (baustelleCharge > 0) ? baustelleCharge : "";
      }
    }

    // Stop2 / Stop3 (only if selected)
    let stop2Charge = 0;
    if(opts.stop2){
      const v = G.toNumber(sCfg.stop2);
      if(Number.isFinite(v) && v>0) stop2Charge = v;
    }

    let stop3Charge = 0;
    if(opts.stop3){
      const v = G.toNumber(sCfg.stop3);
      if(Number.isFinite(v) && v>0) stop3Charge = v;
    }

    const floaterPct = opts.floaterPct;
    const floaterEuro = baseTotal * (floaterPct/100);

    const total = baseTotal + baustelleCharge + stop2Charge + stop3Charge + floaterEuro;

    return {
      forwarder,
      zoneDisplay,
      base: baseTotal,
      baustelle: baustelleDisplay,
      stop2: opts.stop2 ? (stop2Charge > 0 ? stop2Charge : "") : null,
      stop3: opts.stop3 ? (stop3Charge > 0 ? stop3Charge : "") : null,
      floaterPct,
      floaterEuro,
      total,
      reason: '',
      highlight: false
    };
  }

  // ---------- Rendering ----------
  function buildColumns(opts){
    const cols = [
      {key:'forwarder', label:'Spediteur', align:'start', fmt:(v)=>v},
      {key:'zoneDisplay', label:'Zone', align:'start', fmt:(v)=>v},
      {key:'base', label:'Basis (€)', align:'end', fmt:(v)=>G.formatEuro(v)}
    ];

    if(opts.baustelle){
      cols.push({key:'baustelle', label:'Baustelle (€)', align:'end', fmt:(v)=>{
        if(v === null || v === undefined) return '';
        if(typeof v === 'string') return v;
        return G.formatEuro(v);
      }});
    }
    if(opts.stop2){
      cols.push({key:'stop2', label:'2. Stopp (€)', align:'end', fmt:(v)=>Number.isFinite(v)?G.formatEuro(v):''});
    }
    if(opts.stop3){
      cols.push({key:'stop3', label:'3. Stopp (€)', align:'end', fmt:(v)=>Number.isFinite(v)?G.formatEuro(v):''});
    }

    cols.push(
      {key:'floaterPct', label:'Floater (%)', align:'end', fmt:(v)=>Number.isFinite(v)?v.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+'%':''},
      {key:'floaterEuro', label:'Floater (€)', align:'end', fmt:(v)=>G.formatEuro(v)},
      {key:'total', label:'Preis (€)', align:'end', fmt:(v)=>G.formatEuro(v)},
      {key:'reason', label:'Grund', align:'start', fmt:(v)=>v||''}
    );

    return cols;
  }

  function esc(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function renderTable(rows, opts){
    const tbody = $('tbody');
    const theadRow = $('theadRow') || document.querySelector('thead tr');
    if(!tbody || !theadRow) return;

    const cols = buildColumns(opts);

    // header
    theadRow.innerHTML = cols.map(c=>`<th class="text-${c.align==='end'?'end':'start'}">${esc(c.label)}</th>`).join('');

    // body
    if(!rows || rows.length===0){
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="muted">Noch keine Berechnung.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r=>{
      const cls = r.highlight ? ' class="winner"' : '';
      return `<tr${cls}>` + cols.map(c=>{
        let val = c.fmt ? c.fmt(r[c.key]) : r[c.key];
        if(val === null || val === undefined) val = '';
        return `<td class="text-${c.align==='end'?'end':'start'}">${esc(val)}</td>`;
      }).join('') + '</tr>';
    }).join('');
  }

  function renderSummary(stops, best){
    $('sumPlz').textContent = stops.map(s=>`PLZ${s.idx}: ${s.plz}`).join(' / ');
    $('sumWeight').textContent = stops.map(s=>`Gewicht${s.idx}: ${G.formatKg(s.weight)}`).join(' / ');
    $('sumOptions').textContent = optionsLabel();

    const tw = totalWeight(stops);
    $('sumTotals').textContent = `${G.formatKg(tw)} / ${stops.length} Stop${stops.length===1?'':'s'} / ${tourLabel()}`;

    $('sumStops').textContent = stops.map(s=>`PLZ${s.idx}: ${s.plz} / Gewicht${s.idx}: ${G.formatKg(s.weight)}`).join(' | ');

    $('bestName').textContent = (best && Number.isFinite(best.total)) ? `${best.forwarder} (${G.formatEuro(best.total)} €)` : '—';
  }

  // ---------- Load data ----------
  async function loadData(){
    STATE.werk = G.getWerkFromQuery();
    setWerkHeading(STATE.werk);

    STATE.files = G.filesForWerk(STATE.werk);
    if(!STATE.files){
      showErr('Werk fehlt in der URL. Bitte über die Startseite ein Werk auswählen.');
      return;
    }

    try{
      showErr('');
      showHint('Lade Daten…');

      const [zonesTxt, ratesTxt, floaterObj, surObj] = await Promise.all([
        G.fetchText(STATE.files.zones),
        G.fetchText(STATE.files.rates),
        G.fetchJson(STATE.files.floater),
        G.fetchJson(STATE.files.surcharges)
      ]);

      STATE.zones = G.buildZonesIndex(G.parseCSV(zonesTxt));
      STATE.rates = G.buildRatesIndex(G.parseCSV(ratesTxt));
      STATE.floaters = floaterObj || {};
      STATE.surcharges = surObj || {};

      const fSet = new Set([...STATE.zones.listForwarders(), ...STATE.rates.listForwarders()]);
      STATE.forwarders = Array.from(fSet).sort((a,b)=>a.localeCompare(b,'de-DE'));

      STATE.loaded = true;
      showHint(`Daten geladen: ${STATE.forwarders.length} Spediteure.`);

    } catch(err){
      console.error(err);
      STATE.loaded = false;
      showHint('');
      showErr(String(err.message || err));
    }
  }

  // ---------- Calculate ----------
  function calculate(){
    if(!STATE.loaded){
      showErr('Daten sind noch nicht geladen.');
      return;
    }

    const stops = getStops();
    const errs = validateInputs(stops);
    if(errs.length){
      showErr(errs.join(' '));
      return;
    }

    showErr('');

    const opts = {
      baustelle: !!$('chkBaustelle')?.checked,
      stop2: !!$('chk2')?.checked,
      stop3: !!$('chk3')?.checked
    };

    const rows = [];
    for(const f of STATE.forwarders){
      const floaterPct = G.toNumber(STATE.floaters[f] ?? 0);
      rows.push(computeForForwarder(f, stops, {...opts, floaterPct: Number.isFinite(floaterPct)?floaterPct:0}));
    }

    const valid = rows.filter(r=>Number.isFinite(r.total));
    let best = null;
    if(valid.length){
      best = valid.reduce((m,r)=> (m===null || r.total < m.total) ? r : m, null);
      for(const r of rows) r.highlight = (r.forwarder === best.forwarder);
    }

    renderSummary(stops, best);
    renderTable(rows, opts);
    showHint(`Daten geladen: ${STATE.forwarders.length} Spediteure.`);
  }

  // ---------- UI ----------
  function toggleStopsUI(){
    const s2 = !!$('chk2')?.checked;
    const s3 = !!$('chk3')?.checked;

    const b2 = $('stop2Box');
    const b3 = $('stop3Box');

    if(b2) b2.classList.toggle('d-none', !s2);
    if(b3) b3.classList.toggle('d-none', !s3);
  }

  function resetAll(){
    if($('plz1')) $('plz1').value = '';
    if($('w1')) $('w1').value = '';

    $('chkBaustelle').checked = false;
    $('chk2').checked = false;
    $('chk3').checked = false;

    for(const id of ['plz2','w2','plz3','w3']){
      if($(id)) $(id).value = '';
    }

    toggleStopsUI();

    $('sumPlz').textContent = '—';
    $('sumWeight').textContent = '—';
    $('sumOptions').textContent = '—';
    $('sumTotals').textContent = '—';
    $('sumStops').textContent = '—';
    $('bestName').textContent = '—';

    renderTable([], {baustelle:false, stop2:false, stop3:false});
    showErr('');
    if(STATE.loaded) showHint(`Daten geladen: ${STATE.forwarders.length} Spediteure.`);
  }

  function wire(){
    $('btnCalc')?.addEventListener('click', (e)=>{e.preventDefault(); calculate();});
    $('btnReset')?.addEventListener('click', (e)=>{e.preventDefault(); resetAll();});
    $('chk2')?.addEventListener('change', ()=>{toggleStopsUI();});
    $('chk3')?.addEventListener('change', ()=>{toggleStopsUI();});
    toggleStopsUI();
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    // add winner row styling if missing
    const style = document.createElement('style');
    style.textContent = 'tr.winner td{background:#cfe3d8 !important;}';
    document.head.appendChild(style);

    wire();
    loadData();
  });
})();
