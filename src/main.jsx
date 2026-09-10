import React from 'react'
import ReactDOM from 'react-dom/client'
import './mobile791/v1031-overrides.css'
import './mobile791/v1044-overrides.css'

function registerOfflineWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  let reloadingForWorkerUpdate = false
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForWorkerUpdate) return
      reloadingForWorkerUpdate = true
      window.location.reload()
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
  const useMobile791 = isMobileRuntime()
  const [appModule, , , diagnosticsModule] = await Promise.all([
    useMobile791 ? import('./mobile791/App.jsx') : import('./App.jsx'),
    useMobile791 ? import('./mobile791/styles.css') : import('./styles.css'),
    useMobile791 ? import('./mobile791/styles/desktop-jobs-table.css') : import('./styles/desktop-jobs-table.css'),
    useMobile791 ? import('./mobile791/modules/diagnostics.js') : import('./modules/diagnostics.js'),
  ])

  diagnosticsModule.installDiagnosticConsoleCapture()
  diagnosticsModule.installGlobalDiagnosticHandlers()
  diagnosticsModule.logDiagnostic('app.boot', { runtime: useMobile791 ? 'mobile' : 'desktop' })

  const App = appModule.default
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

boot().catch((error) => {
  console.error('Nie udało się uruchomić aplikacji Wawis.', error)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = '<div style="font-family:system-ui;padding:24px;color:#991b1b">Nie udało się uruchomić aplikacji. Odśwież stronę albo sprawdź konsolę błędów.</div>'
  }
})

registerOfflineWorker()
