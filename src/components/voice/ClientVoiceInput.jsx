import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createClientSpeechRecognition,
  formatVoiceCity,
  formatVoiceStreet,
  getClientSpeechErrorMessage,
  isClientSpeechRecognitionSupported,
  normalizeVoiceEmail,
  normalizeVoicePhone,
  parseClientVoiceTranscript,
} from '../../modules/client-voice-input.js';

function MicGlyph() {
  return <span aria-hidden="true">🎤</span>;
}

function joinTranscriptParts(parts = [], interim = '') {
  return [...parts, interim].map((part) => String(part || '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function appendVoiceNoteText(existingValue, newValue) {
  const existing = String(existingValue || '').trim();
  const addition = String(newValue || '').trim();
  if (!addition) return existing;
  if (!existing) return addition;
  return `${existing}\n${addition}`;
}


export function VoiceNoteButton({ label, onValue, disabled = false }) {
  const recognitionRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const manualStopRef = useRef(false);
  const finalPartsRef = useRef([]);
  const interimRef = useRef('');
  const restartTimerRef = useRef(null);
  const finalizeTimerRef = useRef(null);
  const finalizedRef = useRef(false);
  const restartFailuresRef = useRef(0);

  const [listening, setListening] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState('');
  const supported = useMemo(() => isClientSpeechRecognitionSupported(), []);

  function clearTimers() {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
    restartTimerRef.current = null;
    finalizeTimerRef.current = null;
  }

  useEffect(() => () => {
    manualStopRef.current = true;
    sessionActiveRef.current = false;
    clearTimers();
    try { recognitionRef.current?.abort?.(); } catch {}
    recognitionRef.current = null;
  }, []);

  function finishCapture() {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    clearTimers();
    const transcript = joinTranscriptParts(finalPartsRef.current, interimRef.current);
    recognitionRef.current = null;
    sessionActiveRef.current = false;
    setListening(false);
    setLiveTranscript(transcript);

    if (!transcript) {
      setError('Nie usłyszałem komentarza. Naciśnij mikrofon i spróbuj ponownie.');
      return;
    }

    onValue?.(transcript);
    setDialogOpen(false);
    setError('');
  }

  function scheduleRestart() {
    if (!sessionActiveRef.current || manualStopRef.current) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (sessionActiveRef.current && !manualStopRef.current) startRecognitionSegment();
    }, 450);
  }

  function startRecognitionSegment() {
    if (!sessionActiveRef.current || manualStopRef.current || recognitionRef.current) return;

    const recognition = createClientSpeechRecognition({
      continuous: true,
      interimResults: true,
      onResult: (_transcript, detail) => {
        restartFailuresRef.current = 0;
        if (detail?.finalTranscript) {
          finalPartsRef.current.push(detail.finalTranscript);
          interimRef.current = detail?.interimTranscript || '';
        } else {
          interimRef.current = detail?.interimTranscript || '';
        }
        setLiveTranscript(joinTranscriptParts(finalPartsRef.current, interimRef.current));
      },
      onError: (code) => {
        if (code === 'aborted' && manualStopRef.current) return;
        if (code === 'no-speech') return;
        if (code === 'audio-capture' && sessionActiveRef.current && restartFailuresRef.current < 2) {
          restartFailuresRef.current += 1;
          return;
        }
        setError(getClientSpeechErrorMessage(code));
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'network' || code === 'audio-capture') {
          manualStopRef.current = true;
          sessionActiveRef.current = false;
          setListening(false);
        }
      },
      onEnd: () => {
        recognitionRef.current = null;
        if (manualStopRef.current || !sessionActiveRef.current) {
          finishCapture();
          return;
        }
        scheduleRestart();
      },
    });

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (errorValue) {
      recognitionRef.current = null;
      if (sessionActiveRef.current && restartFailuresRef.current < 2) {
        restartFailuresRef.current += 1;
        scheduleRestart();
        return;
      }
      setError(getClientSpeechErrorMessage(errorValue?.name || 'unknown'));
      manualStopRef.current = true;
      sessionActiveRef.current = false;
      setListening(false);
    }
  }

  function start() {
    setError('');
    setLiveTranscript('');
    setDialogOpen(true);

    if (!supported) {
      setListening(false);
      setError('Ta przeglądarka nie obsługuje natywnego dyktowania. Na komputerze użyj Chrome lub Edge. Na iPhonie użyj Safari.');
      return;
    }

    clearTimers();
    try { recognitionRef.current?.abort?.(); } catch {}
    recognitionRef.current = null;
    finalPartsRef.current = [];
    interimRef.current = '';
    finalizedRef.current = false;
    restartFailuresRef.current = 0;
    manualStopRef.current = false;
    sessionActiveRef.current = true;
    setListening(true);
    startRecognitionSegment();
  }

  function stop() {
    manualStopRef.current = true;
    sessionActiveRef.current = false;
    setListening(false);
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (!recognitionRef.current) {
      finishCapture();
      return;
    }
    try { recognitionRef.current.stop?.(); } catch {}
    finalizeTimerRef.current = setTimeout(() => finishCapture(), 1200);
  }

  function close() {
    manualStopRef.current = true;
    sessionActiveRef.current = false;
    clearTimers();
    try { recognitionRef.current?.abort?.(); } catch {}
    recognitionRef.current = null;
    setListening(false);
    setDialogOpen(false);
    setError('');
  }

  return (
    <>
      <button
        type="button"
        className={`voiceFieldMicBtn${listening ? ' isListening' : ''}`}
        onClick={start}
        disabled={disabled || listening}
        aria-label={`Nagraj głosowo: ${label}`}
        title={`Nagraj głosowo: ${label}`}
      >
        <MicGlyph />
      </button>

      {dialogOpen ? (
        <div className="voiceClientOverlay voiceNoteOverlay" role="presentation">
          <section className="voiceClientDialog voiceNoteDialog" role="dialog" aria-modal="true" aria-label={`Nagrywanie: ${label}`}>
            <div className="voiceClientDialogHeader">
              <div>
                <strong>Nagrywanie komentarza</strong>
                <span>Mów normalnie. Gdy skończysz, naciśnij „Zakończ nagrywanie”.</span>
              </div>
              {!listening ? <button type="button" className="voiceClientCloseBtn" onClick={close} aria-label="Zamknij">×</button> : null}
            </div>

            {error ? <div className="voiceClientError" role="status">{error}</div> : null}

            <div className="voiceClientListeningCard" role="status">
              <div className="voiceClientListeningIcon"><MicGlyph /></div>
              <div>
                <strong>{listening ? 'Nagrywanie trwa — mów dalej' : 'Nagrywanie zatrzymane'}</strong>
                <span>Rozpoznany tekst zostanie wpisany do pola „{label}” po zakończeniu nagrywania.</span>
              </div>
            </div>

            <div className="voiceClientTranscript voiceClientTranscriptLive">
              <span>Usłyszano:</span> {liveTranscript ? `„${liveTranscript}”` : 'czekam na pierwsze słowa…'}
            </div>

            <div className="voiceClientDialogActions voiceClientListeningActions">
              {listening ? (
                <button type="button" className="btn primary" onClick={stop}>Zakończ nagrywanie</button>
              ) : (
                <button type="button" className="btn primary" onClick={start}>Nagraj ponownie</button>
              )}
              <button type="button" className="btn ghostBtn" onClick={close}>Anuluj</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
export function VoiceFieldButton({ label, onValue, transformValue = (value) => value, disabled = false }) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const supported = useMemo(() => isClientSpeechRecognitionSupported(), []);

  useEffect(() => () => {
    try { recognitionRef.current?.abort?.(); } catch {}
    recognitionRef.current = null;
  }, []);

  function start() {
    setError('');
    if (!supported) {
      setError('Ta przeglądarka nie obsługuje natywnego dyktowania. Na komputerze otwórz aplikację w Chrome lub Edge. Na iPhonie użyj Safari.');
      return;
    }
    if (recognitionRef.current || listening) return;

    const recognition = createClientSpeechRecognition({
      onResult: (transcript, detail) => {
        const value = detail?.finalTranscript || transcript;
        const nextValue = transformValue(value);
        if (nextValue) onValue?.(nextValue);
      },
      onError: (code) => {
        if (code !== 'aborted') setError(getClientSpeechErrorMessage(code));
      },
      onEnd: () => {
        recognitionRef.current = null;
        setListening(false);
      },
    });
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch (errorValue) {
      recognitionRef.current = null;
      setListening(false);
      setError(getClientSpeechErrorMessage(errorValue?.name || 'unknown'));
    }
  }

  return (
    <>
      <button
        type="button"
        className={`voiceFieldMicBtn${listening ? ' isListening' : ''}`}
        onClick={start}
        disabled={disabled || listening}
        aria-label={listening ? `Słucham: ${label}` : `Wprowadź głosowo: ${label}`}
        title={listening ? 'Słucham…' : `Wprowadź głosowo: ${label}`}
      >
        <MicGlyph />
      </button>
      {error ? <span className="voiceFieldError" role="status">{error}</span> : null}
    </>
  );
}

function PreviewField({ label, value, onChange, placeholder = '', transformValue }) {
  return (
    <label className="voiceClientPreviewField">
      <span>{label}</span>
      <div className="voiceClientPreviewInputRow">
        <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
        <VoiceFieldButton label={label} onValue={onChange} transformValue={transformValue || ((next) => next)} />
      </div>
    </label>
  );
}

export default function ClientVoiceInput({ onApply, buttonLabel = 'Wprowadź głosowo', disabled = false }) {
  const recognitionRef = useRef(null);
  const sessionActiveRef = useRef(false);
  const manualStopRef = useRef(false);
  const finalPartsRef = useRef([]);
  const interimRef = useRef('');
  const restartTimerRef = useRef(null);
  const finalizeTimerRef = useRef(null);
  const captureTimeoutRef = useRef(null);
  const finalizedRef = useRef(false);
  const restartFailuresRef = useRef(0);

  const [listening, setListening] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [captureStage, setCaptureStage] = useState('review');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState('');
  const [values, setValues] = useState(() => parseClientVoiceTranscript(''));
  const supported = useMemo(() => isClientSpeechRecognitionSupported(), []);

  function clearTimers() {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
    if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    restartTimerRef.current = null;
    finalizeTimerRef.current = null;
    captureTimeoutRef.current = null;
  }

  useEffect(() => () => {
    sessionActiveRef.current = false;
    manualStopRef.current = true;
    clearTimers();
    try { recognitionRef.current?.abort?.(); } catch {}
    recognitionRef.current = null;
  }, []);

  function updateValue(field, value) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function finalizeCapture(forcedTranscript = '') {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    clearTimers();
    const transcript = String(forcedTranscript || joinTranscriptParts(finalPartsRef.current, interimRef.current)).trim();
    setLiveTranscript(transcript);
    setValues(parseClientVoiceTranscript(transcript));
    setCaptureStage('review');
    setListening(false);
    sessionActiveRef.current = false;
    recognitionRef.current = null;
    if (!transcript && !error) setError('Nie usłyszałem danych. Naciśnij „Powiedz od początku” i spróbuj ponownie.');
  }

  function scheduleRestart() {
    if (!sessionActiveRef.current || manualStopRef.current) return;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (sessionActiveRef.current && !manualStopRef.current) startRecognitionSegment();
    }, 450);
  }

  function startRecognitionSegment() {
    if (!sessionActiveRef.current || manualStopRef.current || recognitionRef.current) return;

    const recognition = createClientSpeechRecognition({
      continuous: true,
      interimResults: true,
      onResult: (_transcript, detail) => {
        restartFailuresRef.current = 0;
        if (detail?.finalTranscript) {
          finalPartsRef.current.push(detail.finalTranscript);
          interimRef.current = '';
        } else {
          interimRef.current = detail?.interimTranscript || '';
        }
        setLiveTranscript(joinTranscriptParts(finalPartsRef.current, interimRef.current));
      },
      onError: (code) => {
        if (code === 'aborted' && manualStopRef.current) return;
        if (code === 'no-speech') return;
        if (code === 'audio-capture' && sessionActiveRef.current && restartFailuresRef.current < 2) {
          restartFailuresRef.current += 1;
          return;
        }
        setError(getClientSpeechErrorMessage(code));
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'network' || code === 'audio-capture') {
          sessionActiveRef.current = false;
          manualStopRef.current = true;
        }
      },
      onEnd: () => {
        recognitionRef.current = null;
        if (manualStopRef.current || !sessionActiveRef.current) {
          finalizeCapture();
          return;
        }
        scheduleRestart();
      },
    });

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (errorValue) {
      recognitionRef.current = null;
      if (sessionActiveRef.current && restartFailuresRef.current < 2) {
        restartFailuresRef.current += 1;
        scheduleRestart();
        return;
      }
      setError(getClientSpeechErrorMessage(errorValue?.name || 'unknown'));
      sessionActiveRef.current = false;
      manualStopRef.current = true;
      finalizeCapture();
    }
  }

  function startFullCapture() {
    setError('');
    if (!supported) {
      setPreviewOpen(true);
      setCaptureStage('review');
      setError('Ta przeglądarka nie obsługuje natywnego dyktowania. Na komputerze otwórz aplikację w Chrome lub Edge. Na iPhonie użyj Safari i upewnij się, że Siri jest włączona.');
      return;
    }

    clearTimers();
    try { recognitionRef.current?.abort?.(); } catch {}
    recognitionRef.current = null;
    finalPartsRef.current = [];
    interimRef.current = '';
    finalizedRef.current = false;
    restartFailuresRef.current = 0;
    manualStopRef.current = false;
    sessionActiveRef.current = true;
    setValues(parseClientVoiceTranscript(''));
    setLiveTranscript('');
    setCaptureStage('listening');
    setPreviewOpen(true);
    setListening(true);

    startRecognitionSegment();
    captureTimeoutRef.current = setTimeout(() => {
      if (sessionActiveRef.current && !manualStopRef.current) stopFullCapture();
    }, 60000);
  }

  function stopFullCapture() {
    if (!sessionActiveRef.current && !recognitionRef.current) {
      finalizeCapture();
      return;
    }
    manualStopRef.current = true;
    sessionActiveRef.current = false;
    setListening(false);
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (!recognitionRef.current) {
      finalizeCapture();
      return;
    }
    try { recognitionRef.current?.stop?.(); } catch {}
    finalizeTimerRef.current = setTimeout(() => finalizeCapture(), 1200);
  }

  function closePreview() {
    manualStopRef.current = true;
    sessionActiveRef.current = false;
    clearTimers();
    try { recognitionRef.current?.abort?.(); } catch {}
    recognitionRef.current = null;
    setListening(false);
    setPreviewOpen(false);
    setError('');
  }

  function apply() {
    const payload = {
      ...values,
      clientName: values.clientName.trim(),
      phone: normalizeVoicePhone(values.phone),
      email: normalizeVoiceEmail(values.email),
      postalCode: values.postalCode.trim(),
      city: values.city.trim(),
      streetName: values.streetName.trim(),
      houseNumber: values.houseNumber.trim(),
      apartmentNumber: values.apartmentNumber.trim(),
    };
    payload.formattedCity = formatVoiceCity(payload);
    payload.formattedStreet = formatVoiceStreet(payload);
    onApply?.(payload);
    setPreviewOpen(false);
    setError('');
  }

  return (
    <div className="voiceClientInput">
      <button type="button" className={`btn voiceClientMainBtn${listening ? ' isListening' : ''}`} onClick={startFullCapture} disabled={disabled || listening}>
        <MicGlyph />
        <span>{listening ? 'Słucham…' : buttonLabel}</span>
      </button>

      {previewOpen ? (
        <div className="voiceClientOverlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && captureStage !== 'listening') closePreview();
        }}>
          <section className="voiceClientDialog" role="dialog" aria-modal="true" aria-label={captureStage === 'listening' ? 'Dyktowanie danych klienta' : 'Rozpoznane dane klienta'}>
            <div className="voiceClientDialogHeader">
              <div>
                <strong>{captureStage === 'listening' ? 'Dyktuj dane klienta' : 'Rozpoznane dane'}</strong>
                <span>{captureStage === 'listening' ? 'Powiedz dane normalnym zdaniem. Nie musisz mówić „telefon”, „e-mail”, „miasto” ani innych nazw pól.' : 'Sprawdź dane przed zastosowaniem.'}</span>
              </div>
              <button type="button" className="voiceClientCloseBtn" onClick={closePreview} aria-label="Zamknij">×</button>
            </div>

            {error ? <div className="voiceClientError" role="status">{error}</div> : null}

            {captureStage === 'listening' ? (
              <>
                <div className="voiceClientListeningCard" role="status">
                  <div className="voiceClientListeningIcon"><MicGlyph /></div>
                  <div>
                    <strong>{listening ? 'Słucham — mów dalej' : 'Kończę nasłuchiwanie…'}</strong>
                    <span>Przeglądarka może dzielić wypowiedź na kilka fragmentów. Aplikacja będzie je łączyć w jedną całość.</span>
                  </div>
                </div>
                <div className="voiceClientTranscript voiceClientTranscriptLive">
                  <span>Usłyszano do tej pory:</span> {liveTranscript ? `„${liveTranscript}”` : 'czekam na pierwsze słowa…'}
                </div>
                <div className="voiceClientDialogActions voiceClientListeningActions">
                  <button type="button" className="btn" onClick={stopFullCapture}>Zakończ i sprawdź</button>
                  <button type="button" className="btn ghostBtn" onClick={closePreview}>Anuluj</button>
                </div>
              </>
            ) : (
              <>
                {values.transcript ? <div className="voiceClientTranscript"><span>Usłyszano:</span> „{values.transcript}”</div> : null}
                {values.warnings?.map((warning) => <div key={warning} className="voiceClientWarning" role="status">{warning}</div>)}

                <div className="voiceClientPreviewGrid">
                  <PreviewField label="Imię i nazwisko / nazwa firmy" value={values.clientName} onChange={(value) => updateValue('clientName', value)} placeholder="Jan Kowalski" />
                  <PreviewField label="Telefon" value={values.phone} onChange={(value) => updateValue('phone', value)} placeholder="501 234 567" transformValue={normalizeVoicePhone} />
                  <PreviewField label="Email" value={values.email} onChange={(value) => updateValue('email', value)} placeholder="adres@email.pl" transformValue={normalizeVoiceEmail} />
                  <PreviewField label="Kod pocztowy" value={values.postalCode} onChange={(value) => updateValue('postalCode', value)} placeholder="42-400" />
                  <PreviewField label="Miejscowość" value={values.city} onChange={(value) => updateValue('city', value)} placeholder="Zawiercie" />
                  <PreviewField label="Ulica" value={values.streetName} onChange={(value) => updateValue('streetName', value)} placeholder="Sienkiewicza" />
                  <PreviewField label="Numer domu" value={values.houseNumber} onChange={(value) => updateValue('houseNumber', value)} placeholder="12" />
                  <PreviewField label="Numer lokalu" value={values.apartmentNumber} onChange={(value) => updateValue('apartmentNumber', value)} placeholder="4" />
                </div>

                <div className="voiceClientDialogActions">
                  <button type="button" className="btn" onClick={apply}>Zastosuj dane</button>
                  <button type="button" className="btn secondary" onClick={startFullCapture}>Powiedz od początku</button>
                  <button type="button" className="btn ghostBtn" onClick={closePreview}>Anuluj</button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
