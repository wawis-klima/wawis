import React from "react";
import { isPushDisplayOn } from "../utils/pushState.js";

function getPushStatusLabel(pushState) {
  const statusKnown = pushState?.statusKnown === true || pushState?.userEnabled === false;
  if (!statusKnown) return "PUSH · sprawdzanie";
  if (!pushState?.vapidConfigured) return "PUSH · brak konfiguracji";
  if (!pushState?.supported) return pushState?.diagnostics?.reason || "PUSH · niedostępny na tym urządzeniu";
  if (pushState.permission === "denied") return "PUSH · zablokowany w ustawieniach systemowych";
  if (pushState?.userEnabled === false) return "PUSH wyłączony";
  if (pushState.ready) return "PUSH włączony";
  if (isPushDisplayOn(pushState)) return "PUSH włączony · synchronizacja w tle";
  if (pushState.permission === "granted") return "PUSH · wymaga synchronizacji";
  return "PUSH wyłączony · dotknij, aby włączyć";
}

export default function PushNotificationsControl({
  pushState,
  busy,
  compact = false,
  onToggle,
}) {
  const statusKnown = pushState?.statusKnown === true || pushState?.userEnabled === false;
  const isOn = Boolean(statusKnown && isPushDisplayOn(pushState));
  const isChecking = !statusKnown;
  const label = busy ? "PUSH · synchronizacja" : getPushStatusLabel(pushState);
  const actionLabel = isChecking ? "Sprawdzanie PUSH" : isOn ? "Wyłącz PUSH" : "Włącz PUSH";

  if (compact) {
    return (
      <button
        type="button"
        className={`wawisPushMini ${isChecking ? "isChecking" : isOn ? "isOn" : "isOff"}`}
        title={label}
        aria-label={`${label}. ${actionLabel}.`}
        aria-pressed={isOn}
        onClick={onToggle}
        disabled={busy || isChecking || typeof onToggle !== "function"}
      >
        <span className="wawisPushMiniTitle">PUSH</span>
        <span className="wawisPushMiniRow">
          <span className="wawisPushMiniSwitch" aria-hidden="true">
            <span className="wawisPushMiniKnob" aria-hidden="true" />
          </span>
          <span className="wawisPushMiniState">{busy || isChecking ? "…" : isOn ? "ON" : "OFF"}</span>
        </span>
      </button>
    );
  }

  return (
    <div className="pushControl" title={label}>
      <div className="pushControlMain">
        <div className="pushControlText">
          <div className="pushControlTitle">Push</div>
          <div className="pushControlStatus">{label}</div>
        </div>
        <button
          type="button"
          className={`pushControlButton ${isOn ? "secondary" : ""}`}
          onClick={onToggle}
          disabled={busy || isChecking || typeof onToggle !== "function"}
          aria-pressed={isOn}
        >
          {busy || isChecking ? "…" : isOn ? "Wyłącz" : "Włącz"}
        </button>
      </div>
    </div>
  );
}
