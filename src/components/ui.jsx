import React from "react";

export function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" className="topbarIcon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

export function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" className="topbarIcon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20 6v6h-6" />
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
    </svg>
  );
}

export function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" className="inlineIcon">
      <path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconUser() {
  return (
    <svg viewBox="0 0 24 24" className="inlineIcon">
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20a8 8 0 0 1 16 0" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function IconLogout() {
  return (
    <svg viewBox="0 0 24 24" className="topbarIcon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
