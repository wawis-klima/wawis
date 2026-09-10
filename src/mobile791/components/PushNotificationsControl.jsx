import React from "react";

function getMandatoryStatusLabel(pushState) {
  if (!pushState?.vapidConfigured) return "PUSH obowiązkowy · brak konfiguracji";
  if (!pushState?.supported) return "PUSH obowiązkowy · niedostępny na tym urządzeniu";
  if (pushState.permission === "denied") return "PUSH obowiązkowy · zablokowany w systemie";
  if (pushState.ready) return "PUSH włączony na stałe";
  if (pushState.permission === "granted") return "PUSH włączony · trwa samonaprawa";
  return "PUSH włączony · oczekuje na zgodę systemu";
}

export default function PushNotificationsControl({ pushState, busy, compact = false }) {
  const label = busy ? "PUSH włączony · synchronizacja" : getMandatoryStatusLabel(pushState);

  if (compact) {
    return (
      <div className="wawisPushMini isOn isMandatory" title={label} role="status" aria-label={label}>
        <span className="wawisPushMiniTitle">PUSH</span>
        <div className="wawisPushMiniRow">
          <span className="wawisPushMiniSwitch wawisPushMiniSwitchLocked" aria-hidden="true">
            <span className="wawisPushMiniKnob" aria-hidden="true" />
          </span>
          <span className="wawisPushMiniState">ON</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pushControl pushControlMandatory" title={label}>
      <div className="pushControlMain">
        <div className="pushControlText">
          <div className="pushControlTitle">Push</div>
          <div className="pushControlStatus">{label}</div>
        </div>
        <span className="pushMandatoryBadge" aria-label="PUSH włączony na stałe">ON</span>
      </div>
    </div>
  );
}
