import React, { useEffect, useState } from "react";

// The entire installation detail panel must exist in its collapsed state first.
// After two frames it grows to its measured content height via grid 0fr → 1fr.
// Closing reverses the same transition; the parent retains children briefly.
export default function InlineJobDetailsMotion({ open, jobId, children }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) {
      setExpanded(false);
      return undefined;
    }

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setExpanded(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [open]);

  return (
    <div
      className={"wawisInlineJobMotion" + (expanded ? " isOpen" : "")}
      data-inline-motion-job={jobId}
      aria-hidden={!open}
      inert={open ? undefined : ""}
    >
      <div className="wawisInlineJobMotionInner">{children}</div>
    </div>
  );
}
