export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

export function getNextSortValue(currentSort, field) {
  if (currentSort === `${field}_asc`) return `${field}_desc`;
  if (currentSort === `${field}_desc`) return `${field}_asc`;
  return `${field}_asc`;
}

export function getSortLabel(sortBy, field, label) {
  if (sortBy === `${field}_asc`) return `${label} ↑`;
  if (sortBy === `${field}_desc`) return `${label} ↓`;
  return label;
}

export function getVisibleJobs({
  jobs,
  profile,
  query,
  isAdmin,
  showAssignedJobsOnly,
  desktopStatusFilter,
  sortBy,
  normalizeStatus,
}) {
  if (!profile) return [];

  const normalizedQuery = query.trim().toLowerCase();
  const hasActiveQuery = normalizedQuery.length > 0;

  const filtered = jobs.filter((job) => {
    const hay = `${job.client || ''} ${job.city || ''} ${job.street || ''} ${job.email || ''} ${job.phone || ''} ${job.device_model || ''} ${job.device_serial_number || ''}`.toLowerCase();
    const matchesQuery = hay.includes(normalizedQuery);
    const isAssignedToCurrentUser = job.main_technician_id === profile.id || job.viewers.some((viewer) => viewer.user_id === profile.id);
    const shouldIgnoreStatusFilter = !isAdmin && showAssignedJobsOnly;
    const matchesStatus = hasActiveQuery || shouldIgnoreStatusFilter ? true : normalizeStatus(job.status) === desktopStatusFilter;
    const matchesAssignedFilter = isAdmin || !showAssignedJobsOnly ? true : isAssignedToCurrentUser;
    return matchesQuery && matchesStatus && matchesAssignedFilter;
  });

  return [...filtered].sort((a, b) => {
    if (sortBy === 'client_asc') return (a.client || a.title || '').localeCompare(b.client || b.title || '', 'pl');
    if (sortBy === 'client_desc') return (b.client || b.title || '').localeCompare(a.client || a.title || '', 'pl');
    if (sortBy === 'date_desc') return new Date(b.installation_date || 0) - new Date(a.installation_date || 0);
    if (sortBy === 'date_asc') return new Date(a.installation_date || 0) - new Date(b.installation_date || 0);
    if (sortBy === 'city_asc') return (a.city || '').localeCompare(b.city || '', 'pl');
    if (sortBy === 'city_desc') return (b.city || '').localeCompare(a.city || '', 'pl');
    if (sortBy === 'street_asc') return (a.street || '').localeCompare(b.street || '', 'pl');
    if (sortBy === 'street_desc') return (b.street || '').localeCompare(a.street || '', 'pl');
    return 0;
  });
}
