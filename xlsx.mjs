const encoder = new TextEncoder();
function concatBytes(chunks) {
  const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
const writeUInt16 = (bytes, value, offset = 0) => new DataView(bytes.buffer).setUint16(offset, value, true);
const writeUInt32 = (bytes, value, offset = 0) => new DataView(bytes.buffer).setUint32(offset, value, true);

// Minimal OOXML workbook using uncompressed ZIP entries; no external dependencies.
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const table = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zip(entries) {
  const chunks = [], directory = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = encoder.encode(name), body = encoder.encode(text), crc = crc32(body);
    const header = new Uint8Array(30); writeUInt32(header, 0x04034b50); writeUInt16(header, 20, 4); writeUInt32(header, crc, 14); writeUInt32(header, body.length, 18); writeUInt32(header, body.length, 22); writeUInt16(header, filename.length, 26);
    chunks.push(header, filename, body);
    const central = new Uint8Array(46); writeUInt32(central, 0x02014b50); writeUInt16(central, 20, 4); writeUInt16(central, 20, 6); writeUInt32(central, crc, 16); writeUInt32(central, body.length, 20); writeUInt32(central, body.length, 24); writeUInt16(central, filename.length, 28); writeUInt32(central, offset, 42);
    directory.push(central, filename); offset += header.length + filename.length + body.length;
  }
  const central = concatBytes(directory), end = new Uint8Array(22); writeUInt32(end, 0x06054b50); writeUInt16(end, Object.keys(entries).length, 8); writeUInt16(end, Object.keys(entries).length, 10); writeUInt32(end, central.length, 12); writeUInt32(end, offset, 16);
  return concatBytes([...chunks, central, end]);
}
function column(n) { let result = ''; while (n >= 0) { result = String.fromCharCode(n % 26 + 65) + result; n = Math.floor(n / 26) - 1; } return result; }
export function workbook(rows) {
  const contents = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => typeof cell === 'number' ? `<c r="${column(c)}${r + 1}"><v>${cell}</v></c>` : `<c r="${column(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(cell)}</t></is></c>`).join('')}</row>`).join('');
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="积分定期存款" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="14" width="22" customWidth="1"/></cols><sheetData>${contents}</sheetData><autoFilter ref="A1:${column(rows[0].length - 1)}${rows.length}"/></worksheet>`,
  });
}
