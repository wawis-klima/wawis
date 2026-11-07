import React from 'react'
import ReactDOM from 'react-dom/client'
import { APP_VERSION } from './version.js'
import { requestUpdateReload } from './modules/update-reload-guard.js'
import { readQrCodeFromLocation } from './modules/qr-stickers.js'
import { shouldShowPublicQrPage } from './public-qr/public-qr-api.js'

// WAWIS 14.20: klient (bez sesji pracownika) po zeskanowaniu naklejki QR widzi publiczną stronę zgłoszenia,
// a nie ekran logowania. Bez service workera i sprawdzania wersji — to nie jest instalacja aplikacji.
const publicQrCode = typeof window !== 'undefined' ? readQrCodeFromLocation() : ''
const publicQrMode = typeof window !== 'undefined' && (() => {
  try {
    return shouldShowPublicQrPage({ code: publicQrCode, storage: window.localStorage, session: window.sessionStorage })
  } catch {
    return false
  }
})()

const VERSION_CHECK_COOLDOWN_MS = 5000
let versionCheckInFlight = false
let lastVersionCheckAt = 0

async function checkLiveVersion(reason = 'resume') {
  if (typeof window === 'undefined' || document.visibilityState === 'hidden') return
  const now = Date.now()
  if (versionCheckInFlight || now - lastVersionCheckAt < VERSION_CHECK_COOLDOWN_MS) return
  versionCheckInFlight = true
  lastVersionCheckAt = now

  try {
    const response = await fetch(`/app-version.json?wawis_version_check=${now}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!response.ok) return
    const payload = await response.json()
    const liveVersion = String(payload?.version || '').trim()
    if (!liveVersion || liveVersion === APP_VERSION) return

    const markerKey = 'wawis-version-reload-marker'
    let previousMarker = null
    try {
      previousMarker = JSON.parse(sessionStorage.getItem(markerKey) || 'null')
    } catch {
      previousMarker = null
    }
    if (previousMarker?.version === liveVersion && now - Number(previousMarker?.at || 0) < 15000) return
    sessionStorage.setItem(markerKey, JSON.stringify({ version: liveVersion, at: now, reason }))

    try {
      const registration = await navigator.serviceWorker?.getRegistration?.()
      await registration?.update?.()
    } catch {
      // Reload nadal pobierze najnowszy HTML i nowe hashowane assety.
    }

    requestUpdateReload(`live-version:${liveVersion}`, { delayMs: 150 })
  } catch {
    // Brak sieci nie może blokować pracy offline.
  } finally {
    versionCheckInFlight = false
  }
}

/** true tylko przy potwierdzonej zgodności wersji strony z serwerem; brak sieci lub błąd = false (bezpieczne przeładowanie). */
async function pageMatchesLiveVersion() {
  try {
    const response = await fetch(`/app-version.json?wawis_version_check=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
    if (!response.ok) return false
    const payload = await response.json()
    const liveVersion = String(payload?.version || '').trim()
    return Boolean(liveVersion) && liveVersion === APP_VERSION
  } catch {
    return false
  }
}

function installVersionResumeGuard() {
  if (typeof window === 'undefined') return
  const run = (reason) => { checkLiveVersion(reason).catch(() => {}) }
  window.addEventListener('pageshow', () => run('pageshow'))
  window.addEventListener('focus', () => run('focus'))
  window.addEventListener('online', () => run('online'))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run('visible')
  })
  window.setTimeout(() => run('startup'), 800)
}

function registerOfflineWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  let reloadingForWorkerUpdate = false
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForWorkerUpdate) return
      reloadingForWorkerUpdate = true
      // 14.05: strona startowa jest pobierana z sieci (network-first), więc przy pierwszym otwarciu po
      // wdrożeniu działa już w nowej wersji, a nowy service worker przejmuje kontrolę kilka sekund później.
      // Przeładowanie było wtedy zbędne i cofało użytkownika do pierwszego ekranu.
      // Przeładowujemy tylko, gdy strona jest starsza niż serwer albo nie da się tego sprawdzić.
      pageMatchesLiveVersion().then((current) => {
        if (current) {
          reloadingForWorkerUpdate = false
          window.dispatchEvent?.(new CustomEvent('wawis:update-reload-skipped', { detail: { reason: 'service-worker-controllerchange', version: APP_VERSION } }))
          return
        }
        requestUpdateReload('service-worker-controllerchange')
      })
    })
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/push-sw.js')
      .then((registration) => {
        registration.update().catch(() => {})
        return navigator.serviceWorker.ready
      })
      .then((registration) => {
        const loadedAssets = performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin))
        registration.active?.postMessage({ type: 'WAWIS_CACHE_LOADED_ASSETS', urls: loadedAssets })
      })
      .catch((error) => {
        console.warn('Nie udało się uruchomić obsługi offline i powiadomień.', error?.message || error)
      })
  }, { once: true })
}

function isMobileRuntime() {
  if (typeof window === 'undefined') return false
  const widthLooksMobile = window.innerWidth <= 700
  const userAgent = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const phoneUserAgent = /Android.+Mobile|iPhone|iPod|Windows Phone|IEMobile|Opera Mini|Mobi/i.test(userAgent)
  const iPhoneLike = /iPhone|iPod/i.test(platform)
  return widthLooksMobile || phoneUserAgent || iPhoneLike
}

async function bootPublicQr() {
  window.__wawisBootTrace?.mark?.('imports')
  const { default: PublicQrPage } = await import('./public-qr/PublicQrPage.jsx')
  window.__wawisBootTrace?.mark?.('render-requested')
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <PublicQrPage code={publicQrCode} />
    </React.StrictMode>
  )
}

async function boot() {
  if (publicQrMode) return bootPublicQr()
  window.__wawisBootTrace?.mark?.('imports')
  const useMobile791 = isMobileRuntime()
  const [appModule, , , diagnosticsModule] = await Promise.all([
    useMobile791 ? import('./mobile791/App.jsx') : import('./App.jsx'),
    useMobile791 ? import('./mobile791/styles.css') : import('./styles.css'),
    useMobile791 ? import('./mobile791/styles/desktop-jobs-table.css') : import('./styles/desktop-jobs-table.css'),
    useMobile791 ? import('./mobile791/modules/diagnostics.js') : import('./modules/diagnostics.js'),
  ])

  window.__wawisBootTrace?.mark?.('modules-ready')
  if (useMobile791) {
    await import('./mobile791/mobile.css')
    await import('./mobile791/v1048-runtime-fix.css')
    await import('./mobile791/v1055-new-job-polish.css')
    await import('./mobile791/v1057-new-job-form-fix.css')
    await import('./mobile791/v1062-contractors-mobile.css')
    await import('./mobile791/v1064-contractors-compact.css')
    await import('./mobile791/v1090-details-width.css')
    await import('./mobile791/v1091-mobile-details-hardening.css')
    await import('./mobile791/v1092-inline-width.css')
    await import('./mobile791/v1198-new-job-compact.css')
    await import('./mobile791/v1295-worker-ui.css')
    await import('./mobile791/v1297-admin-edit.css')
    await import('./mobile791/v1323-mobile-protocol-actions.css')
    // WAWIS 13.33: styl menu po wszystkich legacy mobile CSS, PRZED pierwszym renderem.
    await import('./mobile791/components/pricelist/pricelist-mobile.css')
    // 5 zakładek wyłącznie administratora; CSS ładowany przed pierwszym renderem.
    await import('./mobile791/components/devices/ServiceAdminPanel.css')
    // 14.30: okno podpisu protokołów szczelności. CSS importowany przez komponenty z mobile791/App.jsx nie
    // dociera do telefonu po buildzie (wspólna lista zależności z App komputera) — style telefonu tylko tutaj.
    await import('./mobile791/components/leak-tests/leak-test-sign.css')
  }

  window.__wawisBootTrace?.mark?.('styles-ready')
  diagnosticsModule.installDiagnosticConsoleCapture()
  diagnosticsModule.installGlobalDiagnosticHandlers()
  diagnosticsModule.logDiagnostic('app.boot', { runtime: useMobile791 ? 'mobile' : 'desktop' })

  window.__wawisBootTrace?.mark?.('diagnostics-ready')
  const App = appModule.default
  window.__wawisBootTrace?.mark?.('render-requested')
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

boot().catch((error) => {
  window.__wawisBootTrace?.fail?.('boot-failed')
  console.error('Nie udało się uruchomić aplikacji Wawis.', error)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = '<div style="font-family:system-ui;padding:24px;color:#991b1b">Nie udało się uruchomić aplikacji. Odśwież stronę albo pobierz raport startu. <button type="button" id="wawis-boot-report">Pobierz raport startu</button></div>'
    document.getElementById('wawis-boot-report')?.addEventListener('click', () => window.__wawisBootTrace?.download?.())
  }
})

if (!publicQrMode) {
  registerOfflineWorker()
  installVersionResumeGuard()
}