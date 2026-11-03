// WAWIS 14.20 — strona dla klienta po zeskanowaniu naklejki QR (bez logowania).
// Pokazuje tylko: firmę, telefon firmy, model, datę montażu i termin przeglądu. Formularz: awaria / przegląd.
import React, { useEffect, useRef, useState } from 'react';
import { fetchPublicQrInfo, submitPublicQrRequest, STAFF_LOGIN_FLAG } from './public-qr-api.js';
import { formatQrStickerCode, QR_PENDING_STORAGE_KEY } from '../modules/qr-stickers.js';
import './public-qr.css';

const KINDS = {
  awaria: { label: 'Zgłoś awarię', title: 'Zgłoszenie awarii', descLabel: 'Co się dzieje z klimatyzatorem?', placeholder: 'Np. nie chłodzi, kapie woda, pokazuje kod błędu E5…', required: true },
  przeglad: { label: 'Umów przegląd', title: 'Umówienie przeglądu', descLabel: 'Uwagi (opcjonalnie)', placeholder: 'Np. pasują mi popołudnia, proszę o kontakt w środę…', required: false },
};

export default function PublicQrPage({ code }) {
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [kind, setKind] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState({ field: '', message: '' });
  const [sent, setSent] = useState(false);
  const formRef = useRef(null);

  const load = () => {
    setLoadError('');
    setInfo(null);
    fetchPublicQrInfo(code)
      .then((data) => setInfo(data))
      .catch((error) => setLoadError(error.status === 404 ? 'unknown' : (error.message || 'Nie udało się wczytać danych.')));
  };
  useEffect(load, [code]);
  useEffect(() => { document.title = 'WAWIS — zgłoszenie serwisu'; }, []);
  useEffect(() => {
    if (kind && formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [kind]);

  const staffLogin = () => {
    try {
      window.sessionStorage.setItem(STAFF_LOGIN_FLAG, '1');
      window.sessionStorage.setItem(QR_PENDING_STORAGE_KEY, code);
    } catch {
      // brak sessionStorage — aplikacja i tak otworzy kod z adresu
    }
    window.location.replace(`/?qr=${encodeURIComponent(code)}`);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const spec = KINDS[kind];
    if (!spec) return;
    if (spec.required && description.trim().length < 5) {
      setFormError({ field: 'description', message: 'Opisz krótko, co się dzieje z klimatyzatorem.' });
      return;
    }
    if (phone.replace(/\D/g, '').length < 9) {
      setFormError({ field: 'phone', message: 'Podaj numer telefonu (9 cyfr), żebyśmy mogli oddzwonić.' });
      return;
    }
    setBusy(true);
    setFormError({ field: '', message: '' });
    try {
      await submitPublicQrRequest({ code, kind, description: description.trim(), phone, website });
      setSent(true);
      window.scrollTo?.({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setFormError({ field: error.field || 'form', message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const phoneBlock = info?.phone ? (
    <a className="pqrCall" href={`tel:${info.phoneHref}`} data-testid="public-qr-call">
      <span className="pqrCallLabel">Zadzwoń do serwisu</span>
      <span className="pqrCallNumber">{info.phone}</span>
    </a>
  ) : null;

  return (
    <div className="pqrPage" data-testid="public-qr-page">
      <header className="pqrHeader">
        <img src="/logo.png" alt="" className="pqrLogo" />
        <div>
          <div className="pqrBrand">{info?.company || 'WAWIS Klimatyzacja'}</div>
          <div className="pqrTagline">Montaż i serwis klimatyzacji</div>
        </div>
      </header>

      <main className="pqrMain">
        {!info && !loadError ? <p className="pqrMuted" role="status">Wczytywanie…</p> : null}

        {loadError === 'unknown' ? (
          <section className="pqrCard" role="alert">
            <h1>Nie rozpoznaliśmy tej naklejki</h1>
            <p>Kod {formatQrStickerCode(code) || code} nie pochodzi z naklejek WAWIS. Sprawdź, czy zeskanowałeś właściwy kod.</p>
          </section>
        ) : null}
        {loadError && loadError !== 'unknown' ? (
          <section className="pqrCard" role="alert">
            <h1>Nie udało się wczytać</h1>
            <p>{loadError}</p>
            <button type="button" className="pqrBtn pqrBtnGhost" onClick={load}>Spróbuj ponownie</button>
          </section>
        ) : null}

        {info && sent ? (
          <section className="pqrCard pqrDone" role="status" data-testid="public-qr-sent">
            <div className="pqrDoneIcon" aria-hidden="true">✓</div>
            <h1>Dziękujemy, zgłoszenie dotarło</h1>
            <p>Oddzwonimy na podany numer, zwykle tego samego dnia roboczego. Jeśli sprawa jest pilna, zadzwoń.</p>
            {phoneBlock}
          </section>
        ) : null}

        {info && !sent ? (
          <>
            {info.assigned ? (
              <section className="pqrCard pqrDevice" aria-label="Twój klimatyzator">
                <div className="pqrEyebrow">Twój klimatyzator</div>
                <div className="pqrModel">{info.model || 'Klimatyzator'}</div>
                <dl className="pqrFacts">
                  {info.installationDate ? (<><dt>Montaż</dt><dd>{info.installationDate}</dd></>) : null}
                  {info.nextInspection ? (<><dt>Termin przeglądu</dt><dd className={info.inspectionDueNow ? 'pqrDue' : ''}>{info.nextInspection}</dd></>) : null}
                </dl>
                {info.inspectionDueNow ? <p className="pqrDueNote">Czas na przegląd — umów go, żeby zachować gwarancję.</p> : null}
              </section>
            ) : null}

            {phoneBlock}

            <section className="pqrCard" aria-label="Zgłoszenie">
              <h1 className="pqrQuestion">W czym możemy pomóc?</h1>
              <div className="pqrChoices" role="group" aria-label="Rodzaj zgłoszenia">
                {Object.entries(KINDS).map(([key, spec]) => (
                  <button key={key} type="button" className={`pqrChoice ${kind === key ? 'pqrChoiceActive' : ''}`}
                    aria-pressed={kind === key} onClick={() => { setKind(key); setFormError({ field: '', message: '' }); }}>
                    {spec.label}
                  </button>
                ))}
              </div>

              {kind ? (
                <form ref={formRef} className="pqrForm" onSubmit={submit} noValidate data-testid="public-qr-form">
                  <h2>{KINDS[kind].title}</h2>
                  <label htmlFor="pqr-description">{KINDS[kind].descLabel}</label>
                  <textarea id="pqr-description" rows={4} maxLength={1000} value={description}
                    placeholder={KINDS[kind].placeholder}
                    aria-invalid={formError.field === 'description'}
                    onChange={(e) => setDescription(e.target.value)} />
                  {formError.field === 'description' ? <p className="pqrError" role="alert">{formError.message}</p> : null}

                  <label htmlFor="pqr-phone">Twój numer telefonu</label>
                  <input id="pqr-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone}
                    placeholder="np. 600 100 200" aria-invalid={formError.field === 'phone'}
                    onChange={(e) => setPhone(e.target.value)} />
                  {formError.field === 'phone' ? <p className="pqrError" role="alert">{formError.message}</p> : null}

                  <div className="pqrTrap" aria-hidden="true">
                    <label htmlFor="pqr-website">Strona www</label>
                    <input id="pqr-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </div>

                  {formError.message && !['description', 'phone'].includes(formError.field) ? (
                    <p className="pqrError" role="alert">{formError.message}</p>
                  ) : null}
                  <button type="submit" className="pqrBtn" disabled={busy}>{busy ? 'Wysyłanie…' : 'Wyślij zgłoszenie'}</button>
                  <p className="pqrPrivacy">Numer telefonu wykorzystamy tylko do kontaktu w sprawie tego zgłoszenia.</p>
                </form>
              ) : null}
            </section>
          </>
        ) : null}
      </main>

      <footer className="pqrFooter">
        <span>Naklejka {formatQrStickerCode(code) || code}</span>
        <button type="button" className="pqrStaff" onClick={staffLogin}>Jestem pracownikiem WAWIS — zaloguj się</button>
      </footer>
    </div>
  );
}
