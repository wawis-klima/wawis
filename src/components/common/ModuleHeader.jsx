import React from 'react';

export default function ModuleHeader({ eyebrow = '', title, description = '', actions = null, metrics = [] }) {
  return (
    <section className="desktopModuleHeader card premiumCard">
      <div className="desktopModuleHeaderCopy">
        {eyebrow ? <div className="sectionPill">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions || metrics.length ? (
        <div className="desktopModuleHeaderAside">
          {metrics.length ? (
            <div className="desktopModuleHeaderMetrics">
              {metrics.map((metric) => (
                <div key={metric.label} className="desktopModuleHeaderMetric">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          {actions ? <div className="desktopModuleHeaderActions">{actions}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
