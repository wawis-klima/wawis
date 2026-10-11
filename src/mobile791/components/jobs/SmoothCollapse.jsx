import React from "react";

// Animate both directions, then unmount collapsed content. Existing WAWIS
// callers rely on collapsed photos/comments being absent from the DOM.
export default function SmoothCollapse({ open, id, children }) {
  const [mounted, setMounted] = React.useState(Boolean(open));
  const [expanded, setExpanded] = React.useState(Boolean(open));

  React.useEffect(() => {
    let frame = 0;
    let timer = 0;
    if (open) {
      setMounted(true);
      frame = window.requestAnimationFrame(() => setExpanded(true));
    } else {
      setExpanded(false);
      timer = window.setTimeout(() => setMounted(false), 310);
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <div id={id} className={"wawisSmoothCollapse" + (expanded ? " isOpen" : "")}
      aria-hidden={!open} inert={open ? undefined : ""}>
      <div className="wawisSmoothCollapseInner">{mounted ? children : null}</div>
    </div>
  );
}
