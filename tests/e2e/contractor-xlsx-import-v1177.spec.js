import { expect, test } from '@playwright/test';

async function roundTripContractorXlsx(page, importPath, exportPath) {
  await page.goto('/');
  return page.evaluate(async ({ importPath, exportPath }) => {
    const importer = await import(importPath);
    const exporter = await import(exportPath);
    const { blob } = exporter.exportContractorsToXlsx([{
      id: 'fixture-1',
      company_name: 'Żółta Firma',
      contact_person: 'Łukasz Test',
      phone: '0500123456',
      email: 'test@example.test',
      city: 'Łódź',
      street: 'Próbna 7',
      addresses: [
        { id: 'addr-main', label: 'Główny', city: 'Łódź', street: 'Próbna 7', notes: '', is_primary: true },
        { id: 'addr-2', label: 'Magazyn', city: 'Zgierz', street: 'Druga 2', notes: 'Brama B', is_primary: false },
      ],
      nip: '1234567890',
      notes: 'Polskie znaki: ąęłńóśżź',
      is_active: false,
    }]);
    const file = new File([blob], 'contractors-roundtrip.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    return importer.parseXlsxContractorsFile(file);
  }, { importPath, exportPath });
}

test('K11 desktop: XLSX round-trip zachowuje status Nieaktywny i adresy', async ({ page }) => {
  const rows = await roundTripContractorXlsx(page, '/src/utils/xlsxImport.js', '/src/utils/xlsxExport.js');
  expect(rows).toHaveLength(1);
  expect(rows[0].company_name).toBe('Żółta Firma');
  expect(rows[0].phone).toBe('0500123456');
  expect(rows[0].is_active).toBe(false);
  expect(rows[0].addresses).toHaveLength(2);
  expect(rows[0].addresses[1].city).toBe('Zgierz');
  expect(rows[0].__parse_errors).toEqual([]);
});

test('K11 mobile: XLSX round-trip zachowuje status Nieaktywny i adresy @mobile', async ({ page }) => {
  const rows = await roundTripContractorXlsx(page, '/src/mobile791/utils/xlsxImport.js', '/src/mobile791/utils/xlsxExport.js');
  expect(rows).toHaveLength(1);
  expect(rows[0].company_name).toBe('Żółta Firma');
  expect(rows[0].is_active).toBe(false);
  expect(rows[0].addresses).toHaveLength(2);
  expect(rows[0].__parse_errors).toEqual([]);
});
