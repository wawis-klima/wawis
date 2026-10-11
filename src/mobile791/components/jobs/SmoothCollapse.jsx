import React from "react";

// Keep DOM mounted for smooth closing; collapsed controls are inert.
export default function SmoothCollapse({ open, id, children }) {
  return (
    <div id={id} className={"wawisSmoothCollapse" + (open ? " isOpen" : "")}
      aria-hidden={!open} inert={open ? undefined : ""}>
      <div className="wawisSmoothCollapseInner">{children}</div>
    </div>
  );
}
