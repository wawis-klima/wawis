import React from "react";

const MODULES = [
  { id: "jobs", label: "Montaże" },
  { id: "contractors", label: "Kontrahenci" },
  { id: "fuel", label: "Paliwo" },
  { id: "sms", label: "SMS" },
];

export default function ModuleSwitcher({ activeModule, setActiveModule, isAdmin }) {
  const visibleModules = MODULES.filter((module) => (
    isAdmin ? true : ["jobs", "fuel"].includes(module.id)
  ));

  return (
    <div className="moduleSwitcher" aria-label="Przełączanie modułów aplikacji">
      {visibleModules.map((module) => (
        <button
          key={module.id}
          type="button"
          className={`moduleSwitcherBtn ${activeModule === module.id ? "active" : ""}`}
          onClick={() => setActiveModule(module.id)}
        >
          {module.label}
        </button>
      ))}
    </div>
  );
}
