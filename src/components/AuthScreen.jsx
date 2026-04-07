import React, { useRef } from "react";

import { APP_VERSION } from "../version";

function RegisterFields({ registerForm, setRegisterForm, registerUser, busy }) {
  return (
    <>
      <input className="input" placeholder="Imię i nazwisko" value={registerForm.fullName} onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })} />
      <input className="input" placeholder="Email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} />
      <input className="input" type="password" placeholder="Hasło" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
      <select className="input" value={registerForm.role} onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}>
        <option value="Pracownik">Pracownik</option>
        <option value="Administrator">Administrator</option>
      </select>
      <button className="btn authBtn registerBtn" onClick={registerUser} disabled={busy}>Utwórz konto</button>
    </>
  );
}

export default function AuthScreen({
  loginForm,
  setLoginForm,
  registerForm,
  setRegisterForm,
  login,
  registerUser,
  busy,
  showRegisterModal,
  setShowRegisterModal,
  errorMsg,
}) {
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  const syncLoginField = (field, value) => {
    setLoginForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleLoginSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const emailValue = String(emailRef.current?.value || formData.get("email") || loginForm.email || "").trim();
    const passwordValue = String(passwordRef.current?.value || formData.get("password") || loginForm.password || "");
    syncLoginField("email", emailValue);
    syncLoginField("password", passwordValue);
    login({
      email: emailValue,
      password: passwordValue,
    });
  };

  return (
    <div className="page">
      <div className="auth">
        <div className="card hero premiumHero">
          <img src="/logo.png" alt="Wawis logo" className="brandLogo" />
          <h1>Wawis Klimatyzacja</h1>
        </div>
        <div className="stack premiumStack">
          <div className="card authCard">
            <div className="sectionPill">Panel logowania</div><h2>Logowanie</h2>
            <form className="authForm" onSubmit={handleLoginSubmit}>
              <input className="input" ref={emailRef} name="email" autoComplete="username email" placeholder="Email" defaultValue={loginForm.email} onChange={(e) => syncLoginField("email", e.target.value)} onInput={(e) => syncLoginField("email", e.target.value)} />
              <input className="input" ref={passwordRef} name="password" autoComplete="current-password" type="password" placeholder="Hasło" defaultValue={loginForm.password} onChange={(e) => syncLoginField("password", e.target.value)} onInput={(e) => syncLoginField("password", e.target.value)} />
              <div className="authButtonRow">
                <button className="btn primary authBtn authRowBtn" type="submit" disabled={busy}>Zaloguj</button>
                <button className="btn authBtn authRowBtn mobileRegisterBtn" type="button" onClick={() => setShowRegisterModal(true)} disabled={busy}>Nowe konto</button>
              </div>
            </form>
            <div className="loginVersionTag">Wersja {APP_VERSION}</div>
          </div>
          <div className="card premiumCard desktopRegisterCard">
            <h2>Nowe konto</h2>
            <RegisterFields registerForm={registerForm} setRegisterForm={setRegisterForm} registerUser={registerUser} busy={busy} />
          </div>
          {showRegisterModal ? (
            <div className="overlay mobileRegisterOverlay" onClick={() => setShowRegisterModal(false)}>
              <div className="card modal mobileRegisterModal" onClick={(e) => e.stopPropagation()}>
                <div className="jobHead">
                  <h2>Nowe konto</h2>
                  <button className="btn" onClick={() => setShowRegisterModal(false)}>Zamknij</button>
                </div>
                <RegisterFields registerForm={registerForm} setRegisterForm={setRegisterForm} registerUser={registerUser} busy={busy} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {errorMsg ? <div className="errorBox">{errorMsg}</div> : null}
    </div>
  );
}
