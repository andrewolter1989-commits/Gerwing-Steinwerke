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