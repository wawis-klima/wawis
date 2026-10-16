// Dane szczegółów są ładowane osobno od listy zleceń.
// Spóźniony snapshot listy nie może cofnąć już pobranych zdjęć i komentarzy.
export function preserveLatestLoadedJobDetails(incomingJobs = [], latestJobs = []) {
  const latestById = new Map(
    (Array.isArray(latestJobs) ? latestJobs : [])
      .filter((job) => job?.id && job.detailsLoaded)
      .map((job) => [String(job.id), job]),
  );
  return (Array.isArray(incomingJobs) ? incomingJobs : []).map((job) => {
    const latest = latestById.get(String(job?.id || ''));
    if (!latest) return job;

    const incomingTime = Date.parse(job?.detailsLoadedAt || '') || 0;
    const latestTime = Date.parse(latest.detailsLoadedAt || '') || 0;
    if (job.detailsLoaded && incomingTime > latestTime) return job;
    return {
      ...job, // Zachowaj nowszy status i pozostałe dane montażu.
      comments: Array.isArray(latest.comments) ? latest.comments : [],
      photos: Array.isArray(latest.photos) ? latest.photos : [],
      detailsLoaded: true,
      detailsLoadedAt: latest.detailsLoadedAt || job?.detailsLoadedAt || null,
      detailsLoadError: '',
    };
  });
}
