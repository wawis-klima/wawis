import {
  PROTOCOL_SAVE_STEP_TIMEOUT_MS,
  PROTOCOL_SAVE_UPLOAD_TIMEOUT_MS,
  withProtocolSaveTimeout,
} from "./protocol-save-timeout.js";

const PROTOCOLS_TABLE = "job_protocols";
const PROTOCOLS_BUCKET = "job-protocols";
const PDF_MIME_TYPE = "application/pdf";
const PROTOCOL_RECORD_COLUMNS = "id, job_id, storage_path, file_name, file_size_bytes, signed_at, created_at, created_by";
const PROTOCOL_CLEANUP_TIMEOUT_MS = 5_000;
const PRINT_IMAGE_MIME_TYPE = "image/png";
const PRINT_IMAGE_WIDTH = 1800;
const PRINT_IMAGE_MAX_PIXELS = 24_000_000;
const PRINT_IMAGE_PAGE_GAP = 24;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeRecord(record) {
  if (!record?.id || !record?.storage_path) return null;
  return {
    ...record,
    file_name: normalizeText(record.file_name) || "wawis-protokol.pdf",
    storage_path: normalizeText(record.storage_path),
  };
}

export function isMissingProtocolBackendError(error) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message).toLowerCase();
  return code === "42P01"
    || code === "PGRST205"
    || message.includes("job_protocols") && (message.includes("does not exist") || message.includes("schema cache"))
    || message.includes("bucket not found");
}

function assertCompletedJob(job) {
  if (normalizeText(job?.status) !== "Zakończone") {
    throw new Error("Protokół można utworzyć dopiero po zakończeniu zlecenia.");
  }
  if (!normalizeText(job?.id)) {
    throw new Error("Brakuje identyfikatora zlecenia.");
  }
}

async function getAuthenticatedUserId(supabase, timeoutMs = PROTOCOL_SAVE_STEP_TIMEOUT_MS) {
  const { data, error } = await withProtocolSaveTimeout(
    supabase.auth.getSession(),
    { phase: "session", timeoutMs },
  );
  if (error) throw error;
  const userId = normalizeText(data?.session?.user?.id);
  if (!userId) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  return userId;
}

function getProtocolStoragePath(jobId, signedAt) {
  const timestamp = signedAt.toISOString().replace(/[:.]/g, "-");
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);
  return `${jobId}/protocol-${timestamp}-${suffix}.pdf`;
}

function addAbortSignal(query, controller) {
  if (!controller || typeof query?.abortSignal !== "function") return query;
  return query.abortSignal(controller.signal);
}

async function runTimedProtocolQuery(query, { phase, timeoutMs = PROTOCOL_SAVE_STEP_TIMEOUT_MS } = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const abortableQuery = addAbortSignal(query, controller);
  return withProtocolSaveTimeout(abortableQuery, {
    phase,
    timeoutMs,
    onTimeout: () => controller?.abort(),
  });
}

function removeProtocolFilesBestEffort(supabase, paths = []) {
  const safePaths = paths.map(normalizeText).filter(Boolean);
  if (!supabase || !safePaths.length) return;
  try {
    void withProtocolSaveTimeout(
      supabase.storage.from(PROTOCOLS_BUCKET).remove(safePaths),
      { phase: "cleanup", timeoutMs: PROTOCOL_CLEANUP_TIMEOUT_MS },
    ).catch(() => null);
  } catch {
    // Sprzątanie nie może zatrzymać ani zablokować zapisu protokołu.
  }
}

export async function loadJobProtocolRecord({ supabase, jobId, timeoutMs = PROTOCOL_SAVE_STEP_TIMEOUT_MS }) {
  const normalizedJobId = normalizeText(jobId);
  if (!supabase || !normalizedJobId) return { record: null, backendAvailable: true };

  const query = supabase
    .from(PROTOCOLS_TABLE)
    .select(PROTOCOL_RECORD_COLUMNS)
    .eq("job_id", normalizedJobId)
    .maybeSingle();
  const { data, error } = await runTimedProtocolQuery(query, { phase: "load-record", timeoutMs });

  if (error) {
    if (isMissingProtocolBackendError(error)) {
      return { record: null, backendAvailable: false, error };
    }
    throw error;
  }

  return { record: normalizeRecord(data), backendAvailable: true };
}

export async function storeJobProtocol({
  supabase,
  job,
  pdfBlob,
  fileName,
  signedAt = new Date(),
  replaceExisting = false,
  timeoutMs = PROTOCOL_SAVE_STEP_TIMEOUT_MS,
  uploadTimeoutMs = PROTOCOL_SAVE_UPLOAD_TIMEOUT_MS,
}) {
  if (!supabase) throw new Error("Brak połączenia z bazą aplikacji.");
  assertCompletedJob(job);
  if (!(pdfBlob instanceof Blob) || !pdfBlob.size) throw new Error("Nie udało się przygotować pliku PDF.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Do zapisania protokołu potrzebne jest połączenie z internetem.");
  }

  const existing = await loadJobProtocolRecord({ supabase, jobId: job.id, timeoutMs });
  if (!existing.backendAvailable) {
    throw new Error("Obsługa protokołów nie jest jeszcze włączona w bazie aplikacji.");
  }
  if (existing.record && !replaceExisting) return existing.record;

  const createdBy = await getAuthenticatedUserId(supabase, timeoutMs);
  const storagePath = getProtocolStoragePath(job.id, signedAt);
  const normalizedFileName = normalizeText(fileName) || "wawis-protokol.pdf";
  const uploadResult = await withProtocolSaveTimeout(
    supabase.storage
      .from(PROTOCOLS_BUCKET)
      .upload(storagePath, pdfBlob, {
        cacheControl: "3600",
        contentType: PDF_MIME_TYPE,
        upsert: false,
      }),
    { phase: "upload", timeoutMs: uploadTimeoutMs },
  );
  if (uploadResult.error) throw uploadResult.error;

  const row = {
    job_id: job.id,
    storage_path: storagePath,
    file_name: normalizedFileName,
    file_size_bytes: pdfBlob.size,
    signed_at: signedAt.toISOString(),
    created_by: createdBy,
  };
  let writeResult;
  if (existing.record) {
    const updateQuery = supabase
      .from(PROTOCOLS_TABLE)
      .update(row)
      .eq("id", existing.record.id)
      .select(PROTOCOL_RECORD_COLUMNS)
      .single();
    writeResult = await runTimedProtocolQuery(updateQuery, { phase: "update-record", timeoutMs });
    if (writeResult.error) {
      removeProtocolFilesBestEffort(supabase, [storagePath]);
      throw writeResult.error;
    }
    if (existing.record.storage_path !== storagePath) {
      removeProtocolFilesBestEffort(supabase, [existing.record.storage_path]);
    }
  } else {
    const insertQuery = supabase
      .from(PROTOCOLS_TABLE)
      .insert(row)
      .select(PROTOCOL_RECORD_COLUMNS)
      .single();
    writeResult = await runTimedProtocolQuery(insertQuery, { phase: "insert-record", timeoutMs });
    if (writeResult.error) {
      removeProtocolFilesBestEffort(supabase, [storagePath]);
      const racedRecord = await loadJobProtocolRecord({ supabase, jobId: job.id, timeoutMs }).catch(() => ({ record: null }));
      if (racedRecord.record) return racedRecord.record;
      throw writeResult.error;
    }
  }

  const savedRecord = normalizeRecord(writeResult?.data);
  if (!savedRecord) throw new Error("Plik został wysłany, ale zapis protokołu nie zwrócił potwierdzenia.");
  return savedRecord;
}

async function downloadProtocolBlob({ supabase, record }) {
  if (!supabase || !record?.storage_path) throw new Error("Nie znaleziono zapisanego protokołu.");
  const { data, error } = await supabase.storage.from(PROTOCOLS_BUCKET).download(record.storage_path);
  if (error) throw error;
  if (!(data instanceof Blob)) throw new Error("Nie udało się pobrać pliku protokołu.");
  return data;
}

export async function getStoredJobProtocolBlob({ supabase, record }) {
  return downloadProtocolBlob({ supabase, record });
}

function triggerBrowserDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = normalizeText(fileName) || "wawis-protokol.pdf";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadStoredJobProtocol({ supabase, record }) {
  const blob = await downloadProtocolBlob({ supabase, record });
  triggerBrowserDownload(blob, record.file_name);
  return { fileName: record.file_name };
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Nie udało się przygotować obrazu protokołu do wydruku."));
    }, type);
  });
}

function getPrintImageFileName(pdfFileName) {
  const baseName = (normalizeText(pdfFileName) || "wawis-protokol.pdf").replace(/\.pdf$/i, "");
  return `${baseName}-druk.png`;
}

export async function createProtocolPrintImage(pdfBlob, pdfFileName) {
  if (!(pdfBlob instanceof Blob) || typeof document === "undefined" || typeof File !== "function") {
    throw new Error("Ten telefon nie pozwala przygotować obrazu protokołu do wydruku.");
  }

  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const loadingTask = getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()) });
  const pdf = await loadingTask.promise;

  try {
    const pages = [];
    let widestPage = 0;
    let totalPageHeight = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      pages.push({ page, baseViewport });
      widestPage = Math.max(widestPage, baseViewport.width);
      totalPageHeight += baseViewport.height;
    }

    if (!pages.length || !widestPage || !totalPageHeight) {
      throw new Error("Protokół PDF nie zawiera strony możliwej do wydrukowania.");
    }

    let scale = PRINT_IMAGE_WIDTH / widestPage;
    const gapCount = Math.max(0, pages.length - 1);
    const estimatedWidth = Math.ceil(widestPage * scale);
    const estimatedHeight = Math.ceil(totalPageHeight * scale) + gapCount * PRINT_IMAGE_PAGE_GAP;
    const estimatedPixels = estimatedWidth * estimatedHeight;
    if (estimatedPixels > PRINT_IMAGE_MAX_PIXELS) {
      scale *= Math.sqrt(PRINT_IMAGE_MAX_PIXELS / estimatedPixels);
    }

    const viewports = pages.map(({ page }) => page.getViewport({ scale }));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(Math.max(...viewports.map((viewport) => viewport.width)));
    canvas.height = Math.ceil(viewports.reduce((sum, viewport) => sum + viewport.height, 0))
      + gapCount * PRINT_IMAGE_PAGE_GAP;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Nie udało się uruchomić podglądu wydruku na tym telefonie.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    let offsetY = 0;
    for (let index = 0; index < pages.length; index += 1) {
      const { page } = pages[index];
      const viewport = viewports[index];
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = Math.ceil(viewport.width);
      pageCanvas.height = Math.ceil(viewport.height);
      const pageContext = pageCanvas.getContext("2d", { alpha: false });
      if (!pageContext) throw new Error("Nie udało się przygotować strony protokołu do wydruku.");

      await page.render({
        canvasContext: pageContext,
        viewport,
        background: "#ffffff",
      }).promise;

      const offsetX = Math.floor((canvas.width - pageCanvas.width) / 2);
      context.drawImage(pageCanvas, offsetX, offsetY);
      offsetY += pageCanvas.height + PRINT_IMAGE_PAGE_GAP;
      page.cleanup();
      pageCanvas.width = 1;
      pageCanvas.height = 1;
    }

    const imageBlob = await canvasToBlob(canvas, PRINT_IMAGE_MIME_TYPE);
    canvas.width = 1;
    canvas.height = 1;
    return new File([imageBlob], getPrintImageFileName(pdfFileName), { type: PRINT_IMAGE_MIME_TYPE });
  } finally {
    await pdf.destroy().catch(() => null);
  }
}

export async function shareStoredJobProtocol({
  supabase,
  record,
  intent = "print",
  createPrintImage = createProtocolPrintImage,
}) {
  if (intent !== "print") throw new Error("Wysyłkę e-mail realizuje zabezpieczony serwer WAWIS.");
  const pdfBlob = await downloadProtocolBlob({ supabase, record });
  const file = await createPrintImage(pdfBlob, record.file_name);

  if (file && typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
    // M832 przyjmuje z menu iOS obrazy, ale nie deklaruje obsługi zewnętrznych
    // plików PDF. Do Phomemo trafia więc wyłącznie tymczasowy obraz wydruku.
    await navigator.share({ files: [file] });
    return { method: "share-image" };
  }

  throw new Error("Ten telefon nie pozwala przekazać obrazu protokołu bezpośrednio do aplikacji Phomemo.");
}

export async function printStoredJobProtocol({ supabase, record }) {
  if (typeof window === "undefined" || typeof window.open !== "function") {
    throw new Error("Drukowanie protokołu jest dostępne w przeglądarce.");
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Przeglądarka zablokowała okno wydruku. Zezwól aplikacji na otwieranie nowych okien.");
  }

  printWindow.opener = null;
  printWindow.document.title = "Przygotowanie protokołu do druku";
  printWindow.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">Przygotowuję protokół do druku…</p>';

  try {
    const blob = await downloadProtocolBlob({ supabase, record });
    const url = URL.createObjectURL(blob);
    printWindow.addEventListener("load", () => {
      window.setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } catch {
          // Wbudowany podgląd PDF nadal udostępnia własny przycisk drukowania.
        }
      }, 900);
    }, { once: true });
    printWindow.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
    return { method: "browser-print" };
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

export function formatStoredProtocolDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const JOB_PROTOCOLS_TABLE = PROTOCOLS_TABLE;
export const JOB_PROTOCOLS_BUCKET = PROTOCOLS_BUCKET;
