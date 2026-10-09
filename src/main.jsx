import React from 'react'
import ReactDOM from 'react-dom/client'
import { APP_VERSION } from './version.js'
import { requestUpdateReload } from './modules/update-reload-guard.js'

const IS_DESIGN_LAB = import.meta.env.VITE_WAWIS_DESIGN_LAB === '1'

function prepareDesignLabSession() {
  if (!IS_DESIGN_LAB || typeof window === 'undefined') return
  try {
    // Użytkownik z istniejącego fixture obu mocków; żadnego rzeczywistego loginu.
    window.localStorage.setItem('klima-mock-supabase-session', JSON.stringify({
      access_token: 'mock-token-mock-admin-1',
      user: { id: 'mock-admin-1' },
    }))
  } catch {
    // Brak pamięci przeglądarki nie przełącza na produkcyjny backend.
  }
  // W LAB linki i nowe okna nie mogą prowadzić do zewnętrznych dostawców.
  window.open = () => null
  document.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a[href]')
    if (!anchor) return
    try {
      const url = new URL(anchor.getAttribute('href'), window.location.href)
      if (url.origin !== window.location.origin) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  }, true)
}

prepareDesignLabSession()

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
      requestUpdateReload('service-worker-controllerchange')
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

async function boot() {
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

if (!IS_DESIGN_LAB) {
  registerOfflineWorker()
  installVersionResumeGuard()
}
