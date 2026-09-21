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

async function verifyFuelUser(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw Object.assign(new Error('Brak aktywnej sesji administratora.'), { status: 401 });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw Object.assign(new Error('Brak konfiguracji Supabase po stronie serwera.'), { status: 500 });
  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${token}`, apikey: anonKey, Accept: 'application/json' };

  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, { headers });
  if (!userResponse.ok) throw Object.assign(new Error('Sesja wygasła. Zaloguj się ponownie.'), { status: 401 });
  const user = await userResponse.json();

  const profileResponse = await fetch(
    `${baseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`,
    { headers },
  );
  if (!profileResponse.ok) throw Object.assign(new Error('Nie udało się potwierdzić roli administratora.'), { status: 403 });
  const profiles = await profileResponse.json();
  const role = String(profiles?.[0]?.role || '').toLowerCase();
  if (!['administrator', 'pracownik'].includes(role)) {
    throw Object.assign(new Error('Nie masz dostępu do modułu tankowań.'), { status: 403 });
  }
}

const resultSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    odometer_km: { type: ['integer', 'null'], minimum: 0, maximum: 5000000 },
    visible_digits: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    display_kind: { type: 'string', enum: ['odometer', 'trip', 'unknown'] },
    notes: { type: 'string' },
  },
  required: ['odometer_km', 'visible_digits', 'confidence', 'display_kind', 'notes'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    await verifyFuelUser(req);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      send(res, 503, { error: 'Brak OPENAI_API_KEY w ustawieniach serwera.' });
      return;
    }

    const imageDataUrl = String(req.body?.imageDataUrl || '');
    if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
      send(res, 400, { error: 'Brakuje prawidłowego zdjęcia licznika.' });
      return;
    }
    if (imageDataUrl.length > 4_500_000) {
      send(res, 413, { error: 'Zdjęcie licznika jest zbyt duże. Zrób zdjęcie ponownie.' });
      return;
    }

    const instructions = [
      'Odczytaj całkowity przebieg samochodu ze zdjęcia zestawu wskaźników.',
      'Zwróć wyłącznie cyfry głównego licznika ODO lub TOTAL, nigdy licznika dziennego TRIP A/B.',
      'Jeśli widoczny jest ułamek kilometra, pomiń część dziesiętną i zwróć pełne kilometry.',
      'Nie zgaduj niewidocznych cyfr. Jeżeli główny przebieg nie jest jednoznacznie widoczny, zwróć odometer_km=null.',
      'visible_digits ma zawierać dokładnie znaki widoczne na wyświetlaczu, bez dopisywania jednostki.',
      'display_kind=odometer tylko gdy rozpoznajesz główny licznik; trip dla licznika dziennego; unknown w pozostałych przypadkach.',
    ].join('\n');

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_ODOMETER_MODEL || process.env.OPENAI_NAMEPLATE_MODEL || 'gpt-5.6',
        store: false,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: instructions },
            { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
          ],
        }],
        text: { format: { type: 'json_schema', name: 'odometer_reading', strict: true, schema: resultSchema } },
      }),
    });
    const payload = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      send(res, openaiResponse.status, { error: payload?.error?.message || 'Usługa AI nie odczytała licznika.' });
      return;
    }

    const outputText = extractOutputText(payload);
    if (!outputText) {
      send(res, 502, { error: 'Analiza AI nie zwróciła wyniku.' });
      return;
    }
    const result = JSON.parse(outputText);
    send(res, 200, { ok: true, result });
  } catch (error) {
    send(res, error?.status || 500, { error: error?.message || 'Nie udało się odczytać licznika.' });
  }
}
