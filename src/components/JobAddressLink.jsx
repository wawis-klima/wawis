import React from "react";
import { getGoogleMapsUrl, getJobAddress } from "../utils/jobHelpers.jsx";

export default function JobAddressLink({
  job,
  className = "",
  emptyLabel = "Brak adresu",
  onClick,
  title = "Otwórz adres w Google Maps",
  ariaLabel,
}) {
  const address = getJobAddress(job);
  const mapsUrl = getGoogleMapsUrl(address);

  if (!mapsUrl) {
    return <span className={className}>{emptyLabel}</span>;
  }

  return (
    <a
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
