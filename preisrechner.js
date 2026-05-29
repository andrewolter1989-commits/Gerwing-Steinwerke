/* Gerwing Steinwerke Preisrechner – App Logic (v6 stable) */
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
    emails: {},
    forwarders: [],
    loaded: false
  };

  const SPECIAL = {
    baustelleIncludedForwarders: new Set(['Böckmann','Bockmann']), // base tariff switches to bau/freight; surcharge itself stays included
    baustelleBlockedForwarders: new Set(['Berghegger','Hartmann','DB Schenker']),
    sievertForwarders: new Set(['Sievert'])
  };

  const $ = (id)=>document.getElementById(id);
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));

  function showErr(msg){
    const el = $('msgErr');
    if(!el) return;
    el.textContent = msg || '';
    el.classList.toggle('d-none', !msg);
  }
  function showHint(msg){
    // Hinweisfeld 'Daten geladen' wird bewusst nicht mehr angezeigt.
  }
  function setWerkHeading(werk){
    const h1 = $('title');
    const label = werk ? ` — Werk ${G.getWerkLabel(werk)}` : '';
    document.title = `Gerwing Steinwerke Preisrechner${label}`;
    if(h1) h1.textContent = `Gerwing Steinwerke Preisrechner${label}`;
  }

  function updateStopVisibility(){
    const use2 = !!$('chk2')?.checked;
    const use3 = !!$('chk3')?.checked;
    $('stop2Box')?.classList.toggle('d-none', !use2);
    $('stop3Box')?.classList.toggle('d-none', !use3);
    if(!use2){ if($('plz2')) $('plz2').value=''; if($('w2')) $('w2').value=''; if($('pallets2')) $('pallets2').value=''; }
    if(!use3){ if($('plz3')) $('plz3').value=''; if($('w3')) $('w3').value=''; if($('pallets3')) $('pallets3').value=''; }
  }

  function getStops(){
    const stops = [];
    stops.push({
      idx:1,
      plz: ($('plz1')?.value ?? '').trim(),
      weight: G.toNumber(($('w1')?.value ?? '').trim()),
      pallets: ($('pallets')?.value ?? '').trim()
    });
    if($('chk2')?.checked){
      stops.push({
        idx:2,
        plz: ($('plz2')?.value ?? '').trim(),
        weight: G.toNumber(($('w2')?.value ?? '').trim()),
        pallets: ($('pallets2')?.value ?? '').trim()
      });
    }
    if($('chk3')?.checked){
      stops.push({
        idx:3,
        plz: ($('plz3')?.value ?? '').trim(),
        weight: G.toNumber(($('w3')?.value ?? '').trim()),
        pallets: ($('pallets3')?.value ?? '').trim()
      });
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
    if($('chk3')?.checked && !$('chk2')?.checked){ errs.push('Dritter Stopp nur zusammen mit Zweitem Stopp.'); }
    return errs;
  }

  function totalWeight(stops){
    return stops.reduce((sum,s)=>sum + (Number.isFinite(s.weight) ? s.weight : 0), 0);
  }

  function totalPalletsFromStops(stops){
    let total = 0;
    let hasAny = false;
    for(const s of stops){
      const raw = String(s.pallets || '').trim().replace(',', '.');
      const value = Number(raw);
      if(Number.isFinite(value)){
        total += value;
        hasAny = true;
      }
    }
    return hasAny ? total : null;
  }

  function formatKgNoDecimals(value){
    if(!Number.isFinite(value)) return '—';
    return value.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' kg';
  }

  function formatPallets(value){
    if(value === null || value === undefined || value === '') return '—';
    const num = Number(String(value).replace(',', '.'));
    if(Number.isFinite(num)) return num.toLocaleString('de-DE', { maximumFractionDigits: 0 });
    return String(value);
  }

  function unloadCountLabel(stops){
    const count = stops.length || 1;
    return `${count} Entladestelle${count === 1 ? '' : 'n'}`;
  }

  function optionsLabel(){
    const opts = [];
    opts.push($('chkBaustelle')?.checked ? 'Baustelle' : 'Lagertour');
    if($('chk2')?.checked) opts.push('2. Stopp');
    if($('chk3')?.checked) opts.push('3. Stopp');
    return opts.join(', ');
  }

  function tourLabel(){
    return $('chkBaustelle')?.checked ? 'Baustellentour' : 'Lagertour';
  }


  function getLoadingPointText(){
    const label = G.getWerkLabel(STATE.werk);
    if(String(STATE.werk).toLowerCase() === 'holdorf') {
      return `Ladestelle Gerwing Holdorf\nIndustriestraße 52, 49451 Holdorf`;
    }
    return `Ladestelle Gerwing ${label}`;
  }

  function formatDisplayDate(value){
    if(!value) return '—';
    const parts = String(value).split('-');
    if(parts.length !== 3) return value;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  function normalizeEmailKey(value){
    return String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
  }

  function getExtraInputs(){
    return {
      pallets: ($('pallets')?.value || '').trim(),
      pickupDate: formatDisplayDate($('pickupDate')?.value || ''),
      deliveryDate: formatDisplayDate($('deliveryDate')?.value || ''),
      freeText: ($('freeText')?.value || '').trim()
    };
  }

  function getEmailConfig(forwarder){
    const cfg = STATE.emails[normalizeEmailKey(forwarder)] || STATE.emails[forwarder] || {};
    if(typeof cfg === 'string') return { availability: cfg.trim(), booking: cfg.trim() };
    return {
      availability: String(cfg.availability || cfg.anfrage || cfg.request || '').trim(),
      booking: String(cfg.booking || cfg.buchung || cfg.order || '').trim()
    };
  }

  function createEmailButton(kind, forwarder){
    const cfg = getEmailConfig(forwarder);
    const address = cfg.availability || cfg.booking || '';
    if(!address) return '<span class="email-missing">Keine E-Mail hinterlegt</span>';
    return `<button type="button" class="email-btn" data-forwarder="${esc(forwarder)}">Anfrage stellen</button>`;
  }

  function getSurchargeValue(forwarder, key){
    const cfg = STATE.surcharges[forwarder] || {};
    const v = G.toNumber(cfg[key]);
    return Number.isFinite(v) ? v : null;
  }

  function computeBaseForForwarder(sp, stops, applyBaz){
    const wt = totalWeight(stops);
    const rateKey = (sp === 'Böckmann' || sp === 'Bockmann')
      ? (applyBaz ? 'Böckmann|bau' : 'Böckmann|freight')
      : sp;
    const reasons = [];
    const zones = [];
    let zoneDisplay = '—';
    let base = null;

    // zones first
    for(const s of stops){
      const zone = STATE.zones.zoneFor(sp, s.plz);
      zones.push(zone);
      if(!zone) reasons.push(`Keine Zone für PLZ${s.idx} (${s.plz || '—'})`);
    }
    if(reasons.length) return { zone:'—', base:null, reason: reasons.join(' / ') };

    // Sievert: each stop separate with own zone+weight, then sum
    if(SPECIAL.sievertForwarders.has(sp)){
      let totalBase = 0;
      let ok = true;
      for(let i=0;i<stops.length;i++){
        const s = stops[i];
        const z = zones[i];
        const price = STATE.rates.priceFor(rateKey, s.weight, z);
        if(price === null){
          ok = false;
          if(!STATE.rates.hasBand(rateKey, s.weight)) reasons.push(`Kein Gewichtsband (Stopp ${s.idx})`);
          else reasons.push(`Kein Preis für Zone ${z} (Stopp ${s.idx})`);
        } else totalBase += price;
      }
      return { zone: stops.length>1 ? 'multi' : zones[0], base: ok ? totalBase : null, reason: ok ? '' : reasons.join(' / ') };
    }

    // all others: total weight + highest stop zone price
    let chosenBase = null;
    let chosenZone = zones[0];
    for(let i=0;i<stops.length;i++){
      const s = stops[i];
      const z = zones[i];
      const price = STATE.rates.priceFor(rateKey, wt, z);
      if(price === null){
        if(!STATE.rates.hasBand(rateKey, wt)) reasons.push(`Kein Gewichtsband (Stopp ${s.idx})`);
        else reasons.push(`Kein Preis für Zone ${z} (Stopp ${s.idx})`);
      } else if(chosenBase === null || price > chosenBase){
        chosenBase = price;
        chosenZone = z;
      }
    }

    if(chosenBase === null) return { zone:'—', base:null, reason: reasons.join(' / ') || '—' };
    zoneDisplay = chosenZone;
    return { zone: zoneDisplay, base: chosenBase, reason:'' };
  }

  function computeForForwarder(forwarder, stops, opts){
    const baseResult = computeBaseForForwarder(forwarder, stops, opts.baustelle);
    let zoneDisplay = baseResult.zone;
    let base = baseResult.base;
    let reason = baseResult.reason || '';

    let baustelle = null;
    let stop2 = null;
    let stop3 = null;
    let floaterPct = opts.floaterPct;
    let floaterEuro = null;
    let total = null;

    if(base !== null){
      // Baustelle
      if(opts.baustelle){
        const totalKg = totalWeight(stops);

        // Sonderregel Brüning: 3,5 € pro Tonne bei Baustellenbelieferung
        if(/^brüning$/i.test(forwarder) || /^bruening$/i.test(forwarder)){
          baustelle = (totalKg / 1000) * 3.5;
        } else if(SPECIAL.baustelleBlockedForwarders.has(forwarder)){
          base = null;
          reason = reason ? `${reason} / Keine Baustellenzustellung` : 'Keine Baustellenzustellung';
        } else if(SPECIAL.baustelleIncludedForwarders.has(forwarder)){
          baustelle = 'inkl.';
        } else {
          const v = getSurchargeValue(forwarder, 'baustelle');
          if(Number.isFinite(v) && v > 0){
            baustelle = v;
          } else {
            // active but no surcharge configured -> old tool displayed none/add 0 for allowed providers
            baustelle = '';
          }
        }
      }

      // second stop surcharge when selected
      if(base !== null && opts.stop2){
        if(!(opts.baustelle && SPECIAL.baustelleBlockedForwarders.has(forwarder))){
          const v = getSurchargeValue(forwarder, 'stop2');
          stop2 = (Number.isFinite(v) && v > 0) ? v : '';
        }
      }

      // third stop surcharge when selected
      if(base !== null && opts.stop3){
        if(!(opts.baustelle && SPECIAL.baustelleBlockedForwarders.has(forwarder))){
          const v = getSurchargeValue(forwarder, 'stop3');
          stop3 = (Number.isFinite(v) && v > 0) ? v : '';
        }
      }

      if(base !== null){
        floaterPct = Number.isFinite(floaterPct) ? floaterPct : 0;
        floaterEuro = base * floaterPct / 100;
        total = base
          + (typeof baustelle === 'number' ? baustelle : 0)
          + (typeof stop2 === 'number' ? stop2 : 0)
          + (typeof stop3 === 'number' ? stop3 : 0)
          + floaterEuro;
      }
    }

    return {
      forwarder,
      zoneDisplay: base !== null ? zoneDisplay : '—',
      base,
      baustelle: opts.baustelle ? baustelle : null,
      stop2: opts.stop2 ? stop2 : null,
      stop3: opts.stop3 ? stop3 : null,
      floaterPct,
      floaterEuro,
      total,
      reason,
      highlight:false
    };
  }

  function renderSummary(stops, best){
    const tw = totalWeight(stops);
    const extra = getExtraInputs();
    const totalPallets = totalPalletsFromStops(stops);
    const palletsDisplay = totalPallets !== null ? formatPallets(totalPallets) : (extra.pallets || '—');

    if($('sumTotals')) {
      $('sumTotals').textContent = `${G.formatKg(tw)} / ${stops.length || 0} ${(stops.length || 0) === 1 ? 'Stopp' : 'Stopps'} / ${palletsDisplay} Paletten / ${tourLabel()}`;
    }
    if($('sumPickupDate')) $('sumPickupDate').textContent = extra.pickupDate;
    if($('sumDeliveryDate')) $('sumDeliveryDate').textContent = extra.deliveryDate;
    if($('sumFreeText')) $('sumFreeText').textContent = extra.freeText || '—';

    if($('sumStops')) {
      if(!stops.length){
        $('sumStops').textContent = '—';
      } else {
        $('sumStops').innerHTML = stops.map(s => {
          const pal = s.pallets ? ` / ${formatPallets(s.pallets)} Paletten` : '';
          return `<span class="summary-stop-line">Stopp${s.idx}: PLZ${s.idx}: ${esc(s.plz)} / Gewicht${s.idx}: ${formatKgNoDecimals(s.weight)}${pal}</span>`;
        }).join('');
      }
    }

    $('bestName').textContent = (best && Number.isFinite(best.total)) ? `${best.forwarder} (${G.formatEuro(best.total)} €)` : '—';
  }

  function buildColumns(opts){
    const cols = [
      { key:'forwarder', label:'Spediteur', align:'start' },
      { key:'zoneDisplay', label:'Zone', align:'start' },
      { key:'base', label:'Basis (€)', align:'end', fmt:v=>Number.isFinite(v)?G.formatEuro(v):'—' }
    ];
    if(opts.baustelle) cols.push({ key:'baustelle', label:'Baustelle (€)', align:'end', fmt:v=> typeof v==='number' ? G.formatEuro(v) : (v || '') });
    if(opts.stop2) cols.push({ key:'stop2', label:'2. Stopp (€)', align:'end', fmt:v=> Number.isFinite(v) ? G.formatEuro(v) : (v || '') });
    if(opts.stop3) cols.push({ key:'stop3', label:'3. Stopp (€)', align:'end', fmt:v=> Number.isFinite(v) ? G.formatEuro(v) : (v || '') });
    cols.push({ key:'floaterPct', label:'Floater (%)', align:'end', fmt:v=> (Number.isFinite(v) && Math.abs(v) > 1e-9) ? v.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+'%' : '' });
    cols.push({ key:'floaterEuro', label:'Floater (€)', align:'end', fmt:v=> (Number.isFinite(v) && Math.abs(v) > 1e-9) ? G.formatEuro(v) : '' });
    cols.push({ key:'total', label:'Preis (€)', align:'end', fmt:v=> Number.isFinite(v) ? G.formatEuro(v) : '—' });
    cols.push({ key:'reason', label:'Grund', align:'start', fmt:v=>v||'' });
    cols.push({ key:'availabilityEmail', label:'Anfrage', align:'start', html:true, fmt:(v,row)=> Number.isFinite(row.total) ? createEmailButton('availability', row.forwarder) : '' });
    return cols;
  }

  function renderTable(rows, opts){
    const tbody = $('tbody');
    const theadRow = $('theadRow') || document.querySelector('thead tr');
    if(!tbody || !theadRow) return;
    const cols = buildColumns(opts);
    theadRow.innerHTML = cols.map(c=>`<th class="text-${c.align==='end'?'end':'start'}">${esc(c.label)}</th>`).join('');
    if(!rows || rows.length===0){
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="muted">Noch keine Berechnung.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r=>{
      const cls = r.highlight ? ' class="winner"' : '';
      return `<tr${cls}>` + cols.map(c=>{
        let val = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
        if(val === null || val === undefined) val = '';
        const safeVal = c.html ? val : esc(val);
        return `<td class="text-${c.align==='end'?'end':'start'}">${safeVal}</td>`;
      }).join('') + `</tr>`;
    }).join('');
  }

  async function loadData(){
    STATE.werk = G.getWerkFromQuery();
    STATE.files = G.filesForWerk(STATE.werk);
    if(!STATE.files) throw new Error('Werk fehlt in der URL (?werk=holdorf oder ?werk=clausnitz).');

    setWerkHeading(STATE.werk);

    const [zonesText, ratesText, floaterJson, surchargeJson, emailJson] = await Promise.all([
      G.fetchText(STATE.files.zones),
      G.fetchText(STATE.files.rates),
      G.fetchJson(STATE.files.floater).catch(()=>({})),
      G.fetchJson(STATE.files.surcharges).catch(()=>({})),
      G.fetchJson('emails.json').catch(()=>({}))
    ]);

    const zoneRows = G.parseCSV(zonesText);
    const rateRows = G.parseCSV(ratesText);

    STATE.zones = G.buildZonesIndex(zoneRows);
    STATE.rates = G.buildRatesIndex(rateRows);
    STATE.floaters = (G.normalizeFloatersMap ? G.normalizeFloatersMap(floaterJson, STATE.werk) : (floaterJson || {}));
    STATE.surcharges = surchargeJson || {};
    STATE.emails = {};
    Object.entries(emailJson || {}).forEach(([key, value]) => {
      STATE.emails[normalizeEmailKey(key)] = value;
    });

    const merged = new Set([...STATE.zones.listForwarders(), ...STATE.rates.listForwarders()]);
    STATE.forwarders = Array.from(merged).sort((a,b)=>a.localeCompare(b,'de'));
    STATE.loaded = true;
    showHint(`Daten geladen: ${STATE.forwarders.length} Spediteure.`);
  }

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
      const floaterPct = G.normalizeFloaterValue ? G.normalizeFloaterValue(STATE.floaters[f]) : G.toNumber(STATE.floaters[f] ?? 0);
      rows.push(computeForForwarder(f, stops, { ...opts, floaterPct: Number.isFinite(floaterPct) ? floaterPct : 0 }));
    }

    const valid = rows.filter(r => Number.isFinite(r.total)).sort((a,b)=>a.total-b.total || a.forwarder.localeCompare(b.forwarder,'de'));
    const invalid = rows.filter(r => !Number.isFinite(r.total)).sort((a,b)=>a.forwarder.localeCompare(b.forwarder,'de'));
    let best = null;
    if(valid.length){
      best = valid[0];
      for(const r of valid) r.highlight = (r.forwarder === best.forwarder);
    }

    const orderedRows = valid.concat(invalid);
    renderSummary(stops, best);
    renderTable(orderedRows, opts);
    showHint(`Daten geladen: ${STATE.forwarders.length} Spediteure.`);
  }

  function resetAll(){
    ['plz1','w1','pallets','pickupDate','deliveryDate','freeText','plz2','w2','pallets2','plz3','w3','pallets3'].forEach(id=>{ if($(id)) $(id).value=''; });
    ['chkBaustelle','chk2','chk3'].forEach(id=>{ if($(id)) $(id).checked=false; });
    updateStopVisibility();
    showErr('');
    renderSummary([], null);
    renderTable([], {baustelle:false, stop2:false, stop3:false});
    showHint(STATE.loaded ? `Daten geladen: ${STATE.forwarders.length} Spediteure.` : '');
  }


  window.createGerwingEmail = function(forwarder, kind){
    const cfg = getEmailConfig(forwarder);
    const to = cfg.availability || cfg.booking || '';
    if(!to){
      alert(`Für ${forwarder} ist noch keine E-Mail-Adresse hinterlegt.`);
      return;
    }

    const stops = getStops().filter(s => s.plz || Number.isFinite(s.weight));
    const extra = getExtraInputs();
    const werkLabel = STATE.werk ? G.getWerkLabel(STATE.werk) : '';
    const mainPlz = stops[0]?.plz || '';
    const subject = encodeURIComponent(`Anfrage ab ${werkLabel} nach ${mainPlz}`.trim());
    const totalPallets = totalPalletsFromStops(stops);
    const palletsDisplay = totalPallets !== null ? formatPallets(totalPallets) : (extra.pallets || '-');

    let bodyText = `Guten Tag zusammen,
`;
    bodyText += `folgende Tour würden wir gerne mit euch fahren:
`;
    bodyText += `Werk: ${werkLabel}

`;

    bodyText += `Optionen: ${tourLabel()} / ${unloadCountLabel(stops)}
`;
    bodyText += `Abholdatum: ${extra.pickupDate}
`;
    bodyText += `Liefertermin: ${extra.deliveryDate}
`;
    bodyText += `Gesamtgewicht: ${formatKgNoDecimals(totalWeight(stops))}
`;
    bodyText += `Paletten: ${palletsDisplay}
`;
    if(extra.freeText) bodyText += `Hinweis: ${extra.freeText}
`;

    for(const s of stops){
      const palText = s.pallets ? ` / ${formatPallets(s.pallets)} Paletten` : '';
      bodyText += `
Stopp${s.idx}:
`;
      bodyText += `PLZ${s.idx}: ${s.plz || '-'} / Gewicht${s.idx}: ${Number.isFinite(s.weight) ? formatKgNoDecimals(s.weight) : '-'}${palText}
`;
    }

    bodyText += `
Vielen Dank und kurze Rückmeldung.`;

    window.location.href = `mailto:${to}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  };

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      updateStopVisibility();
      $('chk2')?.addEventListener('change', updateStopVisibility);
      $('chk3')?.addEventListener('change', updateStopVisibility);
      $('btnCalc')?.addEventListener('click', calculate);
      $('btnReset')?.addEventListener('click', resetAll);
      $('tbody')?.addEventListener('click', (event) => {
        const btn = event.target.closest('.email-btn[data-forwarder]');
        if(btn) window.createGerwingEmail(btn.dataset.forwarder, 'availability');
      });
      renderTable([], {baustelle:false, stop2:false, stop3:false});
      await loadData();
    }catch(err){
      console.error(err);
      showErr(err?.message || String(err));
    }
  });
})();
