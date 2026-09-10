function findEndOfCentralDirectory(bytes) {
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  throw new Error('Nie udało się odczytać struktury pliku XLSX. Sprawdź, czy wskazany plik jest poprawnym arkuszem Excel.');
}

function readUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

function normalizeZipPath(path) {
  return String(path || '').replace(/^\//, '');
}

function resolveZipPath(basePath, relativePath) {
  const baseParts = normalizeZipPath(basePath).split('/').slice(0, -1);
  const relativeParts = normalizeZipPath(relativePath).split('/');
  const resolved = [...baseParts];

  for (const part of relativeParts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }

  return resolved.join('/');
}

async function inflateRaw(data) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Ta przeglądarka nie obsługuje importu XLSX. Otwórz aplikację w aktualnym Chrome lub Edge.');
  }

  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function extractZipFiles(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const centralDirectoryOffset = readUint32(bytes, eocdOffset + 16);
  const totalEntries = readUint16(bytes, eocdOffset + 10);
  const files = new Map();

  let cursor = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (
      bytes[cursor] !== 0x50 ||
      bytes[cursor + 1] !== 0x4b ||
      bytes[cursor + 2] !== 0x01 ||
      bytes[cursor + 3] !== 0x02
    ) {
      throw new Error('Uszkodzony katalog pliku XLSX. Nie udało się odczytać wpisów ZIP.');
    }

    const compressionMethod = readUint16(bytes, cursor + 10);
    const compressedSize = readUint32(bytes, cursor + 20);
    const fileNameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentLength = readUint16(bytes, cursor + 32);
    const localHeaderOffset = readUint32(bytes, cursor + 42);
    const fileName = decodeUtf8(bytes.slice(cursor + 46, cursor + 46 + fileNameLength));

    const localFileNameLength = readUint16(bytes, localHeaderOffset + 26);
    const localExtraLength = readUint16(bytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const compressedData = bytes.slice(dataStart, dataStart + compressedSize);

    let content;
    if (compressionMethod === 0) {
      content = compressedData;
    } else if (compressionMethod === 8) {
      content = await inflateRaw(compressedData);
    } else {
      throw new Error(`Nieobsługiwany sposób kompresji w XLSX (${compressionMethod}).`);
    }

    files.set(normalizeZipPath(fileName), content);
    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return files;
}

function parseXmlText(xmlText) {
  return new DOMParser().parseFromString(xmlText, 'application/xml');
}

function getXmlEntry(files, path) {
  const entry = files.get(normalizeZipPath(path));
  if (!entry) return null;
  return decodeUtf8(entry);
}

function readSharedStrings(files) {
  const sharedStringsXml = getXmlEntry(files, 'xl/sharedStrings.xml');
  if (!sharedStringsXml) return [];

  const doc = parseXmlText(sharedStringsXml);
  return Array.from(doc.getElementsByTagName('si')).map((item) => item.textContent || '');
}

function getFirstWorksheetPath(files) {
  const workbookXml = getXmlEntry(files, 'xl/workbook.xml');
  if (!workbookXml) {
    throw new Error('W pliku XLSX brakuje skoroszytu workbook.xml.');
  }

  const relsXml = getXmlEntry(files, 'xl/_rels/workbook.xml.rels');
  if (!relsXml) {
    throw new Error('W pliku XLSX brakuje relacji workbook.xml.rels.');
  }

  const workbookDoc = parseXmlText(workbookXml);
  const relsDoc = parseXmlText(relsXml);
  const firstSheet = workbookDoc.getElementsByTagName('sheet')[0];
  if (!firstSheet) {
    throw new Error('Arkusz XLSX nie zawiera żadnej zakładki do importu.');
  }

  const relationshipId = firstSheet.getAttribute('r:id') || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const relationship = Array.from(relsDoc.getElementsByTagName('Relationship')).find((item) => item.getAttribute('Id') === relationshipId);
  if (!relationship) {
    throw new Error('Nie udało się znaleźć relacji pierwszego arkusza XLSX.');
  }

  const target = relationship.getAttribute('Target') || '';
  return normalizeZipPath(target.startsWith('/') ? target.slice(1) : resolveZipPath('xl/workbook.xml', target));
}

function getCellColumnIndex(reference) {
  const match = String(reference || '').match(/[A-Z]+/i);
  if (!match) return 0;

  return match[0]
    .toUpperCase()
    .split('')
    .reduce((total, char) => total * 26 + (char.charCodeAt(0) - 64), 0) - 1;
}

function readCellValue(cell, sharedStrings) {
  const type = cell.getAttribute('t') || '';
  const valueNode = cell.getElementsByTagName('v')[0];
  const inlineNode = cell.getElementsByTagName('is')[0];
  const rawValue = valueNode?.textContent || '';

  if (type === 's') {
    return sharedStrings[Number(rawValue)] || '';
  }

  if (type === 'inlineStr') {
    return inlineNode?.textContent || '';
  }

  if (type === 'b') {
    return rawValue === '1' ? 'TAK' : 'NIE';
  }

  return rawValue;
}

function extractWorksheetRows(files, worksheetPath, sharedStrings) {
  const worksheetXml = getXmlEntry(files, worksheetPath);
  if (!worksheetXml) {
    throw new Error(`Nie udało się odczytać arkusza XLSX: ${worksheetPath}`);
  }

  const doc = parseXmlText(worksheetXml);
  const rows = [];
  const rowNodes = Array.from(doc.getElementsByTagName('row'));

  for (const rowNode of rowNodes) {
    const rowValues = [];
    const cellNodes = Array.from(rowNode.getElementsByTagName('c'));
    for (const cell of cellNodes) {
      const reference = cell.getAttribute('r') || '';
      const columnIndex = getCellColumnIndex(reference);
      rowValues[columnIndex] = String(readCellValue(cell, sharedStrings) || '').trim();
    }
    rows.push(rowValues.map((value) => value ?? ''));
  }

  return rows;
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HEADER_ALIASES = new Map([
  ['nazwa', 'company_name'],
  ['nazwa kontrahenta', 'company_name'],
  ['kontrahent', 'company_name'],
  ['firma', 'company_name'],
  ['klient', 'company_name'],
  ['company', 'company_name'],
  ['company name', 'company_name'],
  ['company_name', 'company_name'],
  ['name', 'company_name'],
  ['osoba kontaktowa', 'contact_person'],
  ['kontakt', 'contact_person'],
  ['contact', 'contact_person'],
  ['contact person', 'contact_person'],
  ['opiekun', 'contact_person'],
  ['telefon', 'phone'],
  ['telefon kontaktowy', 'phone'],
  ['nr telefonu', 'phone'],
  ['numer telefonu', 'phone'],
  ['tel', 'phone'],
  ['phone', 'phone'],
  ['mobile', 'phone'],
  ['e mail', 'email'],
  ['email', 'email'],
  ['mail', 'email'],
  ['miasto', 'city'],
  ['miejscowosc', 'city'],
  ['city', 'city'],
  ['ulica', 'street'],
  ['adres', 'street'],
  ['street', 'street'],
  ['adresy json', 'addresses_json'],
  ['adresy', 'addresses_json'],
  ['addresses json', 'addresses_json'],
  ['nip', 'nip'],
  ['tax id', 'nip'],
  ['tax_id', 'nip'],
  ['notatki', 'notes'],
  ['uwagi', 'notes'],
  ['notes', 'notes'],
]);

export async function parseXlsxContractorsFile(file) {
  if (!file) {
    throw new Error('Nie wybrano pliku XLSX do importu.');
  }

  const buffer = await file.arrayBuffer();
  const files = await extractZipFiles(buffer);
  const sharedStrings = readSharedStrings(files);
  const worksheetPath = getFirstWorksheetPath(files);
  const rows = extractWorksheetRows(files, worksheetPath, sharedStrings);

  if (!rows.length) {
    return [];
  }

  const [headerRow = [], ...dataRows] = rows;
  const normalizedHeaders = headerRow.map((header) => HEADER_ALIASES.get(normalizeHeader(header)) || null);

  return dataRows
    .map((row) => {
      const record = {
        company_name: '',
        contact_person: '',
        phone: '',
        email: '',
        city: '',
        street: '',
        addresses_json: '',
        addresses: [],
        nip: '',
        notes: '',
        is_active: true,
      };

      row.forEach((cellValue, index) => {
        const field = normalizedHeaders[index];
        if (!field) return;
        record[field] = String(cellValue || '').trim();
      });

      if (record.addresses_json) {
        try {
          const parsed = JSON.parse(record.addresses_json);
          if (Array.isArray(parsed)) record.addresses = parsed;
        } catch {
          record.addresses = [];
        }
      }
      delete record.addresses_json;
      return record;
    })
    .filter((record) => Object.values(record).some((value) => String(value || '').trim()));
}


const DEVICE_HEADER_ALIASES = new Map([
  ['kontrahent', 'contractor_name'],
  ['nazwa kontrahenta', 'contractor_name'],
  ['nazwa klienta', 'contractor_name'],
  ['klient', 'contractor_name'],
  ['firma', 'contractor_name'],
  ['company', 'contractor_name'],
  ['company name', 'contractor_name'],
  ['company_name', 'contractor_name'],
  ['model', 'model'],
  ['model urządzenia', 'model'],
  ['model urzadzenia', 'model'],
  ['urzadzenie', 'model'],
  ['urządzenie', 'model'],
  ['device model', 'model'],
  ['serial', 'serial_number'],
  ['serial number', 'serial_number'],
  ['numer seryjny', 'serial_number'],
  ['nr seryjny', 'serial_number'],
  ['device serial number', 'serial_number'],
  ['data montażu', 'installation_date'],
  ['data montazu', 'installation_date'],
  ['installation date', 'installation_date'],
  ['montaż', 'installation_date'],
  ['montaz', 'installation_date'],
  ['status', 'status'],
  ['status urządzenia', 'status'],
  ['status urzadzenia', 'status'],
  ['notatki', 'notes'],
  ['uwagi', 'notes'],
  ['notes', 'notes'],
]);

export async function parseXlsxDevicesFile(file) {
  if (!file) {
    throw new Error('Nie wybrano pliku XLSX do importu urządzeń.');
  }

  const buffer = await file.arrayBuffer();
  const files = await extractZipFiles(buffer);
  const sharedStrings = readSharedStrings(files);
  const worksheetPath = getFirstWorksheetPath(files);
  const rows = extractWorksheetRows(files, worksheetPath, sharedStrings);

  if (!rows.length) {
    return [];
  }

  const [headerRow = [], ...dataRows] = rows;
  const normalizedHeaders = headerRow.map((header) => DEVICE_HEADER_ALIASES.get(normalizeHeader(header)) || null);

  return dataRows
    .map((row) => {
      const record = {
        contractor_name: '',
        model: '',
        serial_number: '',
        installation_date: '',
        status: '',
        notes: '',
      };

      row.forEach((cellValue, index) => {
        const field = normalizedHeaders[index];
        if (!field) return;
        record[field] = String(cellValue || '').trim();
      });

      return record;
    })
    .filter((record) => Object.values(record).some((value) => String(value || '').trim()));
}
