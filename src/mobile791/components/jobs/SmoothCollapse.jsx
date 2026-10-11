import React from "react";

// Legacy device rows stay in the DOM while collapsed; photo, note, installer
// and comment contents are unmounted after the closing transition, as before.
export default function SmoothCollapse({ open, id, children, keepMounted = false }) {
  const [mounted, setMounted] = React.useState(Boolean(open || keepMounted));
  const [expanded, setExpanded] = React.useState(Boolean(open));

  React.useEffect(() => {
    let frame = 0;
    let timer = 0;
    if (open) {
      setMounted(true);
      frame = window.requestAnimationFrame(() => setExpanded(true));
    } else {
      setExpanded(false);
      if (keepMounted) setMounted(true);
      else timer = window.setTimeout(() => setMounted(false), 490);
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, [open, keepMounted]);

  return (
    <div id={mounted ? id : undefined} className={"wawisSmoothCollapse" + (expanded ? " isOpen" : "")}
      aria-hidden={!open} inert={open ? undefined : ""}>
      <div className="wawisSmoothCollapseInner">{mounted ? children : null}</div>
    </div>
  );
}
