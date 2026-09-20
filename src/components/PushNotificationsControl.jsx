import React from "react";

function getPushStatusLabel(pushState) {
  if (!pushState?.vapidConfigured) return "PUSH · brak konfiguracji";
  if (!pushState?.supported) return pushState?.diagnostics?.reason || "PUSH · niedostępny na tym urządzeniu";
  if (pushState.permission === "denied") return "PUSH · zablokowany w ustawieniach systemowych";
  if (pushState?.userEnabled === false) return "PUSH wyłączony";
  if (pushState.ready) return "PUSH włączony";
  if (pushState.permission === "granted") return "PUSH · wymaga synchronizacji";
  return "PUSH wyłączony · dotknij, aby włączyć";
}

export default function PushNotificationsControl({
  pushState,
  busy,
  compact = false,
  onToggle,
}) {
  const isOn = Boolean(pushState?.ready && pushState?.userEnabled !== false);
  const label = busy ? "PUSH · synchronizacja" : getPushStatusLabel(pushState);
  const actionLabel = isOn ? "Wyłącz PUSH" : "Włącz PUSH";

  if (compact) {
    return (
      <button
        type="button"
        className={`wawisPushMini ${isOn ? "isOn" : "isOff"}`}
        title={label}
        aria-label={`${label}. ${actionLabel}.`}
        aria-pressed={isOn}
        onClick={onToggle}
        disabled={busy || typeof onToggle !== "function"}
      >
        <span className="wawisPushMiniTitle">PUSH</span>
        <span className="wawisPushMiniRow">
          <span className="wawisPushMiniSwitch" aria-hidden="true">
            <span className="wawisPushMiniKnob" aria-hidden="true" />
          </span>
          <span className="wawisPushMiniState">{busy ? "…" : isOn ? "ON" : "OFF"}</span>
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
          disabled={busy || typeof onToggle !== "function"}
          aria-pressed={isOn}
        >
          {busy ? "…" : isOn ? "Wyłącz" : "Włącz"}
        </button>
      </div>
    </div>
  );
}
