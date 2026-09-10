const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

(async () => {
  const moduleUrl = pathToFileURL(path.join(root, 'src/modules/client-voice-input.js')).href;
  const voice = await import(moduleUrl);

  const parsed = voice.parseClientVoiceTranscript('Jan Kowalski, Zawiercie, ulica Sienkiewicza 12 mieszkanie 4, telefon 501 234 567');
  assert(parsed.clientName === 'Jan Kowalski', `Błędna nazwa klienta: ${parsed.clientName}`);
  assert(parsed.city === 'Zawiercie', `Błędna miejscowość: ${parsed.city}`);
  assert(parsed.streetName === 'Sienkiewicza', `Błędna ulica: ${parsed.streetName}`);
  assert(parsed.houseNumber === '12', `Błędny numer domu: ${parsed.houseNumber}`);
  assert(parsed.apartmentNumber === '4', `Błędny numer lokalu: ${parsed.apartmentNumber}`);
  assert(parsed.phone === '501 234 567', `Błędny telefon: ${parsed.phone}`);
  assert(voice.formatVoiceStreet(parsed) === 'Sienkiewicza 12/4', 'Niepoprawne składanie ulicy i lokalu');

  const parsedPostal = voice.parseClientVoiceTranscript('klient Anna Nowak, telefon pięć zero dwa jeden jeden jeden dwa dwa dwa, kod pocztowy 42-400, miasto Zawiercie, ulica 3 Maja 18/6');
  assert(parsedPostal.phone === '502 111 222', `Niepoprawna zamiana cyfr mówionych: ${parsedPostal.phone}`);
  assert(parsedPostal.postalCode === '42-400', `Niepoprawny kod pocztowy: ${parsedPostal.postalCode}`);
  assert(voice.formatVoiceCity(parsedPostal) === '42-400 Zawiercie', 'Kod pocztowy nie jest składany z miejscowością');
  assert(voice.formatVoiceStreet(parsedPostal) === '3 Maja 18/6', 'Adres 18/6 nie został poprawnie złożony');

  // Realny scenariusz użytkownika: bez słów „telefon”, „email”, „miasto”.
  const naturalCase = voice.parseClientVoiceTranscript('Piotr Wasik Widna 19 przez 19 Zawiercie wasik p małpa e kropka pe el 606 606 909');
  assert(naturalCase.clientName === 'Piotr Wasik', `Naturalny test: błędna nazwa klienta: ${naturalCase.clientName}`);
  assert(naturalCase.streetName === 'Widna', `Naturalny test: błędna ulica: ${naturalCase.streetName}`);
  assert(naturalCase.houseNumber === '19', `Naturalny test: błędny numer domu: ${naturalCase.houseNumber}`);
  assert(naturalCase.apartmentNumber === '19', `Naturalny test: błędny numer lokalu: ${naturalCase.apartmentNumber}`);
  assert(naturalCase.city === 'Zawiercie', `Naturalny test: błędne miasto: ${naturalCase.city}`);
  assert(naturalCase.email === 'wasikp@e.pl', `Naturalny test: błędny email: ${naturalCase.email}`);
  assert(naturalCase.phone === '606 606 909', `Naturalny test: błędny telefon: ${naturalCase.phone}`);
  assert(voice.formatVoiceStreet(naturalCase) === 'Widna 19/19', 'Naturalny test: niepoprawne składanie 19 przez 19');

  // Dokładny tekst ze screena 9.04. Najważniejsze: 19/19 nie może zostać doklejone do telefonu.
  const screenshotCase = voice.parseClientVoiceTranscript('Piotr Wasik ulica Widna 19 przez 19 Zawiercie Wasik P @. Pl 606 606 909');
  assert(screenshotCase.clientName === 'Piotr Wasik', `Screen 9.04: błędna nazwa klienta: ${screenshotCase.clientName}`);
  assert(screenshotCase.streetName === 'Widna', `Screen 9.04: błędna ulica: ${screenshotCase.streetName}`);
  assert(screenshotCase.houseNumber === '19', `Screen 9.04: błędny numer domu: ${screenshotCase.houseNumber}`);
  assert(screenshotCase.apartmentNumber === '19', `Screen 9.04: błędny numer lokalu: ${screenshotCase.apartmentNumber}`);
  assert(screenshotCase.city === 'Zawiercie', `Screen 9.04: błędne miasto: ${screenshotCase.city}`);
  assert(screenshotCase.phone === '606 606 909', `Screen 9.04: telefon zawiera cyfry adresu: ${screenshotCase.phone}`);
  assert(screenshotCase.email === '', `Screen 9.04: nie wolno zgadywać niepełnego e-maila: ${screenshotCase.email}`);
  assert(screenshotCase.warnings.length === 1, 'Screen 9.04: brak ostrzeżenia o niepewnym e-mailu');

  const labelledCase = voice.parseClientVoiceTranscript('Piotr Wasik ulica Widna 19 przez 19 Zawiercie wasik p małpa e kropka pe el telefon 606 606 909');
  assert(labelledCase.email === 'wasikp@e.pl', `Test zgodności z etykietą: błędny email: ${labelledCase.email}`);
  assert(labelledCase.phone === '606 606 909', `Test zgodności z etykietą: błędny telefon: ${labelledCase.phone}`);
  assert(voice.normalizeVoiceEmail('wasik p małpa e kropka pe el') === 'wasikp@e.pl', 'Niepoprawna normalizacja mówionego emaila');

  // Sam numer domu/lokalu nie może wyglądać jak telefon.
  const addressOnly = voice.parseClientVoiceTranscript('Piotr Wasik ulica Widna 19 przez 19 Zawiercie');
  assert(addressOnly.phone === '', `Adres 19/19 został błędnie uznany za telefon: ${addressOnly.phone}`);

  const moduleSource = read('src/modules/client-voice-input.js');
  assert(moduleSource.includes('recognition.continuous = Boolean(continuous)'), 'Brak trybu ciągłego rozpoznawania mowy');
  assert(moduleSource.includes('interimResults = Boolean(interimResults)'), 'Brak wyników tymczasowych podczas dłuższego dyktowania');
  assert(moduleSource.includes('recognition.maxAlternatives = 5'), 'Brak wyboru lepszej alternatywy rozpoznawania Safari');
  assert(moduleSource.includes('łamane\\s+)?przez'), 'Brak obsługi adresu typu „19 przez 19”');
  assert(moduleSource.includes('Nie zbieramy wszystkich cyfr z całego zdania'), 'Brak zabezpieczenia przed doklejaniem cyfr adresu do telefonu');

  const mobileModule = read('src/mobile791/modules/client-voice-input.js');
  assert(mobileModule.includes('recognition.maxAlternatives = 5'), 'Mobile: brak aktualnego parsera głosowego 9.05');
  assert(mobileModule.includes('findPhoneCandidate'), 'Mobile: brak izolowanego wykrywania telefonu');

  const component = read('src/components/voice/ClientVoiceInput.jsx');
  assert(component.includes('Zakończ i sprawdź'), 'Brak ręcznego zakończenia pełnego dyktowania');
  assert(component.includes('Przeglądarka może dzielić wypowiedź na kilka fragmentów'), 'Brak komunikatu o łączeniu fragmentów rozpoznawania');
  assert(component.includes('scheduleRestart'), 'Brak automatycznego wznowienia po zakończeniu fragmentu przez Safari');
  assert(component.includes('Powiedz od początku'), 'Brak możliwości ponownego dyktowania');
  assert(component.includes('VoiceFieldButton'), 'Brak mikrofonu dla pojedynczych pól');
  assert(component.includes('label="Email"'), 'Brak pola email w podglądzie głosowym');
  assert(!component.includes('Mów naturalnie, bez komend i bez podawania nazw pól'), 'Stary opis pod przyciskiem głosowym nadal zajmuje miejsce');
  assert(component.includes('voiceClientWarning'), 'Brak ostrzeżenia zamiast zgadywania niepewnego e-maila');

  assert(component.includes('Chrome lub Edge'), 'Brak jasnej informacji dla desktopu bez natywnego SpeechRecognition');
  assert(!component.includes('MediaRecorder'), 'Dyktowanie klienta nie może korzystać z MediaRecorder/OpenAI fallbacku');
  assert(!component.includes("fetch('/api/transcribe-client-voice'"), 'Dyktowanie klienta nadal wywołuje płatny endpoint transkrypcji');
  assert(!fs.existsSync(path.join(root, 'api/transcribe-client-voice.js')), 'Płatny endpoint transkrypcji głosu nadal znajduje się w wydaniu');

  for (const rel of [
    'src/components/modals/JobFormModal.jsx',
    'src/mobile791/components/modals/JobFormModal.jsx',
    'src/components/contractors/ContractorsPanel.jsx',
    'src/mobile791/components/contractors/ContractorsPanel.jsx',
  ]) {
    const source = read(rel);
    assert(source.includes('ClientVoiceInput'), `${rel}: brak pełnego wprowadzania głosowego`);
    assert(source.includes('VoiceFieldButton'), `${rel}: brak mikrofonów przy polach`);
    assert(source.includes('normalizeVoiceEmail'), `${rel}: brak obsługi głosowego emaila`);
    assert(source.includes('email: data.email || prev.email'), `${rel}: email z dyktowania nie trafia do formularza`);
  }

  for (const rel of ['src/styles.css', 'src/mobile791/styles.css']) {
    const css = read(rel);
    assert(css.includes('.voiceClientOverlay'), `${rel}: brak stylu podglądu głosowego`);
    assert(css.includes('.voiceFieldMicBtn'), `${rel}: brak stylu mikrofonu pola`);
    assert(css.includes('.voiceClientListeningCard'), `${rel}: brak stylu sesji długiego dyktowania`);
    assert(css.includes('.voiceClientWarning'), `${rel}: brak stylu ostrzeżenia dla niepewnych danych`);
  }

  console.log('Client voice input smoke OK');
})().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
