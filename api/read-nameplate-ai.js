function send(res, status, payload) {
  res.status(status).json(payload);
}

function extractOutputText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text;
    }
  }
  return '';
}

async function verifySupabaseUser(req) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Brak aktywnej sesji administratora.'), { status: 401 });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw Object.assign(new Error('Brak konfiguracji Supabase po stronie serwera.'), { status: 500 });
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!response.ok) throw Object.assign(new Error('Sesja wygasła. Zaloguj się ponownie.'), { status: 401 });
  const user = await response.json();
  let role = String(user?.user_metadata?.role || user?.app_metadata?.role || '').toLowerCase();
  if (!['admin', 'administrator'].includes(role)) {
    const profileResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey, Accept: 'application/json' },
    });
    if (profileResponse.ok) {
      const profiles = await profileResponse.json();
      role = String(profiles?.[0]?.role || '').toLowerCase();
    }
  }
  if (!['admin', 'administrator'].includes(role)) {
    throw Object.assign(new Error('Odczyt AI jest dostępny wyłącznie dla administratora.'), { status: 403 });
  }
  return user;
}

const resultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    manufacturer: { type: 'string' },
    model_code: { type: 'string' },
    model_family: { type: 'string' },
    power_kw: { type: 'string' },
    serial_number: { type: 'string' },
    ean: { type: 'string' },
    unit_type: { type: 'string', enum: ['indoor', 'outdoor', 'unknown'] },
    raw_text: { type: 'string' },
    uncertain_characters: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
    confidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        manufacturer: { type: 'number', minimum: 0, maximum: 1 },
        model: { type: 'number', minimum: 0, maximum: 1 },
        power: { type: 'number', minimum: 0, maximum: 1 },
        serial_number: { type: 'number', minimum: 0, maximum: 1 },
        ean: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['manufacturer', 'model', 'power', 'serial_number', 'ean'],
    },
  },
  required: [
    'manufacturer', 'model_code', 'model_family', 'power_kw', 'serial_number',
    'ean', 'unit_type', 'raw_text', 'uncertain_characters', 'notes', 'confidence',
  ],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    await verifySupabaseUser(req);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      send(res, 503, { error: 'Brak OPENAI_API_KEY w ustawieniach Vercel.' });
      return;
    }
    const { imageDataUrl, barcodeValues = [], barcodeDetections = [], targetUnit = '' } = req.body || {};
    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(String(imageDataUrl || ''))) {
      send(res, 400, { error: 'Brakuje prawidłowego obrazu tabliczki.' });
      return;
    }
    const model = process.env.OPENAI_NAMEPLATE_MODEL || 'gpt-5.6';
    const barcodeEvidence = Array.isArray(barcodeValues)
      ? barcodeValues.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 12)
      : [];
    const structuredBarcodeEvidence = Array.isArray(barcodeDetections)
      ? barcodeDetections.slice(0, 12).map((item) => ({
        value: String(item?.value || '').trim(),
        format: String(item?.format || '').trim().toLowerCase(),
        roleHint: String(item?.roleHint || '').trim().toLowerCase(),
      })).filter((item) => item.value)
      : [];
    const barcodeEvidenceText = structuredBarcodeEvidence.length
      ? structuredBarcodeEvidence.map((item) => `${item.format || 'kod'}=${item.value}${item.roleHint ? ` [${item.roleHint}]` : ''}`).join(', ')
      : barcodeEvidence.join(', ');

    const instructions = [
      'Jesteś precyzyjnym czytnikiem wizualnym tabliczek znamionowych klimatyzatorów. Twoim zadaniem jest transkrypcja widocznych danych, nie zgadywanie.',
      'Najważniejsze pola: producent, dokładny kod modelu, moc, numer seryjny i EAN/GTIN, jeśli rzeczywiście jest widoczny.',
      'Najpierw obejrzyj cały kadr, szczególnie krótki nadruk nad lub obok kodu kreskowego. Na małych etykietach Rotenso właśnie tam często znajduje się jedyny kod modelu, np. EO50Xo R17.',
      'Jeżeli widzisz krótki kod urządzenia zakończony Xi, Xo albo Xm (z opcjonalną rewizją Rxx), zawsze przepisz go do model_code, nawet gdy na etykiecie nie ma osobnego napisu MODEL.',
      'Kod modelu przepisz dokładnie z nadruku, zachowując litery Xi/Xo/Xm oraz rewizję Rxx, np. R35Xi R18 albo I35Xo R14.',
      'Dla kodów Rotenso możesz uzupełnić manufacturer=Rotenso, model_family i power_kw na podstawie pewnego kodu modelu: EO oznacza zewnętrzną jednostkę Elis, a liczba 50 oznacza klasę 5,0 kW. Nie zgaduj tych pól, jeżeli kod nie jest czytelny.',
      'Nie wymyślaj rodziny modelu. model_family wpisz tylko, gdy nazwa jest widoczna; w przeciwnym razie może pozostać pusta.',
      'EAN jest osobnym polem. Zwróć go tylko wtedy, gdy widzisz EAN/PC-EAN/GTIN albo czytnik kodów dostarczył format ean_13. Nigdy nie twórz EAN-u z numeru seryjnego.',
      'Numer seryjny jest osobnym polem. Jeżeli czytnik kodów dostarczył Code 128 z alfanumerycznym numerem, potraktuj ten wynik jako twardy SN i przepisz go bez zmian.',
      'Nie mieszaj numeru seryjnego, EAN-u i kodu modelu. Każde pole ma własne źródło.',
      'Jeżeli znak jest niepewny, pozostaw pole puste albo zaznacz niepewność w uncertain_characters. Nie zastępuj niepewnego znaku innym na podstawie podobieństwa.',
      'Pole unit_type opisuje to, co rzeczywiście wynika z kodu/modelu: indoor, outdoor albo unknown. Informacja o otwartej JW/JZ jest tylko kontekstem i nie może wymusić wyniku.',
      `Otwarta pozycja w aplikacji: ${String(targetUnit || 'nieokreślona')}.`,
      barcodeEvidenceText
        ? `Twarde wyniki czytnika kodów: ${barcodeEvidenceText}. Zachowaj je bez zmian; format ean_13 oznacza EAN, a Code 128 może być numerem seryjnym.`
        : 'Czytnik kodów nie zwrócił pewnego wyniku. Odczytaj dane wyłącznie z obrazu.',
    ].join('\n');

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        store: false,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: instructions },
            { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
          ],
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'nameplate_reading',
            strict: true,
            schema: resultSchema,
          },
        },
      }),
    });
    const payload = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      send(res, openaiResponse.status, {
        error: payload?.error?.message || 'Usługa AI nie odczytała tabliczki.',
      });
      return;
    }
    const outputText = extractOutputText(payload);
    if (!outputText) {
      send(res, 502, { error: 'Analiza AI nie zwróciła danych.' });
      return;
    }
    let result;
    try { result = JSON.parse(outputText); } catch (_) {
      send(res, 502, { error: 'Analiza AI zwróciła nieprawidłowy format danych.' });
      return;
    }
    send(res, 200, { ok: true, model, result });
  } catch (error) {
    send(res, error?.status || 500, { error: error?.message || 'Nie udało się przeanalizować tabliczki.' });
  }
}
