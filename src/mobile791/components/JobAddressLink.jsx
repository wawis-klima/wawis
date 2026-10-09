import React from "react";
import { getGoogleMapsUrl, getJobAddress, getJobDisplayAddress } from "../utils/jobHelpers.jsx";

export default function JobAddressLink({
  job,
  className = "",
  emptyLabel = "Brak adresu",
  onClick,
  title = "Otwórz adres w Google Maps",
  ariaLabel,
  linkRef,
}) {
  const address = getJobDisplayAddress(job);
  const mapsUrl = getGoogleMapsUrl(getJobAddress(job));

  if (!mapsUrl) {
    return <span ref={linkRef} className={className}>{emptyLabel}</span>;
  }

  return (
    <a
      ref={linkRef}
      href={mapsUrl}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || `Otwórz adres w Google Maps: ${address}`}
    >
      {address}
    </a>
  );
}
