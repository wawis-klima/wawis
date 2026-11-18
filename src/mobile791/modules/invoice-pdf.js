import { getFakturowniaInvoicePdf } from '../../modules/fakturownia.js';

/**
 * 14.46: PDF potwierdzonej faktury z Fakturowni na telefonie (tylko administrator — sprawdza też serwer).
 * Karta otwierana od razu po dotknięciu (jak protokół szczelności), więc Safari nie blokuje okna;
 * plik trafia do niej po pobraniu. Bez karty (blokada okien) — zwykłe pobranie pliku.
 */
export async function openFakturowniaInvoicePdf({ supabase, jobId }) {
  const previewWindow = typeof window !== 'undefined' && typeof window.open === 'function' ? window.open('', '_blank') : null;
  try {
    if (previewWindow) {
      // Bez „opener = null”: WebKit nie otwiera wtedy pliku blob: z aplikacji (jak w protokole szczelności).
      previewWindow.document.title = 'Faktura VAT';
      previewWindow.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">Pobieram fakturę z Fakturowni…</p>';
    }
    const { blob, fileName } = await getFakturowniaInvoicePdf({ supabase, jobId });
    const url = URL.createObjectURL(blob);
    if (previewWindow) {
      previewWindow.location.replace(url);
    } else {
      const link = document.createElement('a');
      link.href = url; link.download = fileName; link.rel = 'noopener';
      document.body.appendChild(link); link.click(); link.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 600_000);
    return { fileName };
  } catch (error) {
    try { previewWindow?.close(); } catch {}
    throw error;
  }
}

/** Numer potwierdzonej faktury — osobne zapytanie tylko dla administratora (dane pracownika bez zmian). */
export async function loadConfirmedInvoiceInfo({ supabase, jobId }) {
  if (!supabase || !jobId) return null;
  const { data, error } = await supabase.from('jobs')
    .select('id, vat_invoice_fakturownia_confirmed, vat_invoice_fakturownia_invoice_number')
    .eq('id', jobId).maybeSingle();
  if (error) throw error;
  if (data?.vat_invoice_fakturownia_confirmed !== true) return null;
  return { invoiceNumber: String(data.vat_invoice_fakturownia_invoice_number || '').trim() };
}
