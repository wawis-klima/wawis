import React from "react";

const MODULES = [
  { id: "jobs", label: "Montaże" },
  { id: "contractors", label: "Kontrahenci" },
  { id: "fuel", label: "Paliwo" },
];

export default function ModuleSwitcher({ activeModule, setActiveModule, isAdmin }) {
  const visibleModules = MODULES.filter((module) => (
    isAdmin ? true : ["jobs", "fuel"].includes(module.id)
  ));

  return (
    <div
      className={`moduleSwitcher moduleSwitcherMobile ${isAdmin ? "isAdmin" : "isWorker"}`}
      style={{ gridTemplateColumns: `repeat(${visibleModules.length}, minmax(0, 1fr))` }}
      aria-label="Przełączanie modułów aplikacji"
    >
      {visibleModules.map((module) => (
        <button
          key={module.id}
          type="button"
          data-module={module.id}
          className={`moduleSwitcherBtn ${activeModule === module.id ? "active" : ""}`}
          onClick={() => setActiveModule(module.id)}
        >
          <span className="moduleSwitcherLabel">{module.label}</span>
        </button>
      ))}
    </div>
  );
}
