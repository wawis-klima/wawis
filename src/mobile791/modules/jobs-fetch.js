import { normalizeStatus as normalizeJobStatus } from "../utils/jobPermissions.js";
import { getNameplatePhotoMetadata, getPhotoStoragePath, isLocalQueuedPhoto } from "./photos.js";

const DETAILS_PHOTO_URL_MODE = 'lazy-full-v969';

function isTransientReadError(error) {
  const status = Number(error?.status || error?.code || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 0 || status === 500 || status === 502 || status === 503 || status === 504 || message.includes("networkerror") || message.includes("failed to fetch") || message.includes("fetch resource") || message.includes("timeout") || message.includes("failed to connect");
}

async function safeRead(queryPromiseFactory, fallbackValue) {
  const result = await queryPromiseFactory();
  if (!result?.error) return result;
  if (isTransientReadError(result.error)) {
    return { data: fallbackValue, error: null, stale: true };
  }
  return result;
}

async function getCurrentProfile({ supabase, user, existingProfile = null }) {
  const fallback = existingProfile || {
    id: user.id,
    full_name: user.user_metadata?.full_name || user.email || 'Użytkownik',
    email: user.email,
    role: user.user_metadata?.role || 'Pracownik',
  };

  const result = await safeRead(
    () => supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', user.id)
      .maybeSingle(),
    fallback,
  );
  if (result.error) throw result.error;

  let me = result.data || fallback;
  if (!result.data && !result.stale) {
    const upsertResult = await supabase.from('profiles').upsert(fallback);
    if (upsertResult.error && !isTransientReadError(upsertResult.error)) throw upsertResult.error;
    me = fallback;
  }

  return me;
}

async function getTeamProfiles({ supabase, existingProfiles }) {
  const { data, error } = await safeRead(
    () => supabase.from('profiles').select('id, full_name, email, role').order('full_name', { ascending: true }),
    existingProfiles,
  );
  if (error) throw error;
  return data || [];
}

function isMissingJobCompletionColumnsError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (message.includes('completed_at') || message.includes('completed_by'))
    && (message.includes('does not exist') || message.includes('schema cache') || message.includes('column'));
}

const JOB_SUMMARY_BASE_FIELDS = 'id, title, client, email, phone, city, street, location, status, installation_date, device_model, device_serial_number, admin_note, created_at, created_by, main_technician_id, contractor_id, contractor_address_id, sms_consent, sms_reminder_enabled, service_due_date, last_sms_sent_at, last_sms_status, last_sms_error, sms_recipient_phone';
const JOB_SUMMARY_COMPLETION_FIELDS = `${JOB_SUMMARY_BASE_FIELDS}, completed_at, completed_by`;

async function getJobsData({ supabase }) {
  const baseFields = JOB_SUMMARY_BASE_FIELDS;
  const completionFields = JOB_SUMMARY_COMPLETION_FIELDS;

  let jobsFields = completionFields;
  let result = await supabase
    .from('jobs')
    .select(jobsFields)
    .order('created_at', { ascending: false });

  if (result.error && isMissingJobCompletionColumnsError(result.error)) {
    jobsFields = baseFields;
    result = await supabase
      .from('jobs')
      .select(jobsFields)
      .order('created_at', { ascending: false });
  }

  if (result.error) throw result.error;
  return { jobsData: result.data || [], jobsFields };
}

export async function loadJobSummaryData({ supabase, jobId }) {
  const targetId = String(jobId || '').trim();
  if (!supabase || !targetId) return { job: null, viewers: [] };

  let jobResult = await supabase
    .from('jobs')
    .select(JOB_SUMMARY_COMPLETION_FIELDS)
    .eq('id', targetId)
    .maybeSingle();

  if (jobResult.error && isMissingJobCompletionColumnsError(jobResult.error)) {
    jobResult = await supabase
      .from('jobs')
      .select(JOB_SUMMARY_BASE_FIELDS)
      .eq('id', targetId)
      .maybeSingle();
  }
  if (jobResult.error) throw jobResult.error;

  if (!jobResult.data) return { job: null, viewers: [], missing: true };

  const accessResult = await supabase
    .from('job_access')
    .select('id, job_id, user_id')
    .eq('job_id', targetId);
  if (accessResult.error) throw accessResult.error;

  return {
    job: jobResult.data,
    viewers: accessResult.data || [],
    missing: false,
  };
}

async function syncStaleJobsStatus({ supabase, jobsData, jobsFields, normalizeStatus = normalizeJobStatus, isOlderThan30Days }) {
  const staleNewJobs = (jobsData || []).filter((job) => normalizeStatus(job.status) === 'Nowe' && isOlderThan30Days(job.created_at));
  if (!staleNewJobs.length) return jobsData || [];

  const { error: staleJobsError } = await supabase
    .from('jobs')
    .update({ status: 'Niezrealizowane' })
    .in('id', staleNewJobs.map((job) => job.id));
  if (staleJobsError) {
    if (isTransientReadError(staleJobsError)) return jobsData || [];
    throw staleJobsError;
  }

  const refreshedJobsResponse = await supabase
    .from('jobs')
    .select(jobsFields)
    .order('created_at', { ascending: false });
  if (refreshedJobsResponse.error) {
    if (isTransientReadError(refreshedJobsResponse.error)) return jobsData || [];
    throw refreshedJobsResponse.error;
  }

  return refreshedJobsResponse.data || [];
}

function getExistingAccessData(existingJobs = []) {
  const seen = new Set();
  const access = [];
  for (const job of Array.isArray(existingJobs) ? existingJobs : []) {
    for (const viewer of Array.isArray(job?.viewers) ? job.viewers : []) {
      const id = String(viewer?.id || `${viewer?.job_id || job?.id || ''}:${viewer?.user_id || ''}`);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      access.push({ ...viewer, job_id: viewer?.job_id || job?.id || '' });
    }
  }
  return access;
}

async function getAccessData({ supabase, existingJobs = [] }) {
  const fallbackAccess = getExistingAccessData(existingJobs);
  const { data, error } = await safeRead(
    () => supabase.from('job_access').select('id, job_id, user_id'),
    fallbackAccess,
  );
  if (error) throw error;
  return data || fallbackAccess;
}

async function getNotificationsData({ supabase, user, existingNotifications = [] }) {
  const { data, error } = await safeRead(
    () => supabase
      .from('notifications')
      .select('id, user_id, title, body, is_read, created_at, link_job_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    existingNotifications,
  );
  if (error) throw error;
  return data || existingNotifications || [];
}

function buildNamesMap(team = []) {
  return new Map((team || []).map((person) => [person.id, person.full_name || person.email || 'Użytkownik']));
}

function getExistingJobDetailsMap(existingJobs = []) {
  return new Map((existingJobs || []).map((job) => {
    const photos = Array.isArray(job.photos) ? job.photos : [];
    const photoModeCompatible = photos.length === 0
      || photos.every((photo) => isLocalQueuedPhoto(photo) || photo?.photo_url_mode === DETAILS_PHOTO_URL_MODE || Boolean(photo?.thumbnail_image_url));
    return [String(job.id || ''), {
      comments: Array.isArray(job.comments) ? job.comments : [],
      photos,
      detailsLoaded: Boolean(job.detailsLoaded) && photoModeCompatible,
      detailsLoadedAt: job.detailsLoadedAt || null,
      detailsLoadError: String(job.detailsLoadError || '').trim(),
    }];
  }).filter(([id]) => id));
}

function buildCombinedJobs({ jobsData, accessData, existingJobs = [], preserveJobDetails = true }) {
  const existingDetails = getExistingJobDetailsMap(existingJobs);

  return (jobsData || []).map((job) => {
    const previousDetails = preserveJobDetails ? existingDetails.get(String(job.id)) : null;
    return {
      ...job,
      viewers: (accessData || []).filter((item) => item.job_id === job.id),
      comments: previousDetails?.detailsLoaded ? previousDetails.comments : [],
      photos: previousDetails?.detailsLoaded ? previousDetails.photos : [],
      detailsLoaded: previousDetails?.detailsLoaded || false,
      detailsLoadedAt: previousDetails?.detailsLoadedAt || null,
      detailsLoadError: previousDetails?.detailsLoadError || '',
    };
  });
}


function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function loadJobNameplatePhotosData({
  supabase,
  jobId,
  retryDelaysMs = [0, 350, 900],
}) {
  if (!supabase || !jobId) return { photos: [] };

  let lastError = null;
  for (const rawDelay of retryDelaysMs) {
    const delay = Math.max(0, Number(rawDelay) || 0);
    if (delay) await wait(delay);

    const result = await supabase
      .from('photos')
      .select('id, job_id, image_url, storage_path, uploaded_by, created_at, photo_kind, device_index, unit_ref')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (!result.error) {
      const photos = (result.data || []).map((item) => ({
        ...item,
        ...getNameplatePhotoMetadata(item),
        original_image_url: item.image_url || '',
      }));
      return { photos };
    }

    lastError = result.error;
    if (!isTransientReadError(result.error)) break;
  }

  throw lastError || new Error('Nie udało się pobrać zdjęć tabliczek.');
}

export async function loadJobDetailsData({
  supabase,
  jobId,
  team = [],
  getSignedPhotoUrl,
  supabaseUrl,
  signal = null,
  deferThumbnailSigning = false,
}) {
  if (!supabase || !jobId) return { comments: [], photos: [] };

  const names = buildNamesMap(team);

  let commentsPromise = supabase
    .from('comments')
    .select('id, job_id, author_id, type, text, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (signal && typeof commentsPromise.abortSignal === 'function') commentsPromise = commentsPromise.abortSignal(signal);

  let photosPromise = supabase
    .from('photos')
    .select('id, job_id, image_url, storage_path, uploaded_by, created_at, photo_kind, device_index, unit_ref')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (signal && typeof photosPromise.abortSignal === 'function') photosPromise = photosPromise.abortSignal(signal);

  const [commentsResult, photosResult] = await Promise.all([commentsPromise, photosPromise]);

  if (commentsResult.error) throw commentsResult.error;
  if (photosResult.error) throw photosResult.error;

  const comments = (commentsResult.data || []).map((item) => ({
    ...item,
    author_name: names.get(item.author_id) || 'Użytkownik',
  }));

  const normalizePhoto = (item, thumbnailSignedUrl = '') => {
    const storagePath = getPhotoStoragePath({ photo: item, supabaseUrl });
    return {
      ...item,
      ...getNameplatePhotoMetadata({ ...item, storage_path: storagePath || item.storage_path || '' }),
      storage_path: storagePath || item.storage_path || '',
      original_image_url: item.image_url || '',
      signed_url: '',
      image_url: '',
      preview_full_url: '',
      thumbnail_image_url: thumbnailSignedUrl || '',
      photo_url_mode: DETAILS_PHOTO_URL_MODE,
      uploader_name: names.get(item.uploaded_by) || 'Pracownik',
    };
  };

  const photos = deferThumbnailSigning
    ? (photosResult.data || []).map((item) => normalizePhoto(item, ''))
    : await Promise.all((photosResult.data || []).map(async (item) => {
      const storagePath = getPhotoStoragePath({ photo: item, supabaseUrl });
      const thumbnailSignedUrl = await getSignedPhotoUrl({
        storagePath,
        fallbackUrl: storagePath ? '' : item.image_url,
        supabase,
        transform: { width: 400, quality: 72, resize: 'contain' },
      });
      return normalizePhoto(item, thumbnailSignedUrl || '');
    }));

  return {
    comments,
    photos,
    detailsLoaded: true,
    detailsLoadedAt: new Date().toISOString(),
  };
}

export async function refreshAppData({
  supabase,
  user,
  normalizeStatus = normalizeJobStatus,
  isOlderThan30Days,
  existingProfile = null,
  existingProfiles = [],
  existingNotifications = [],
  existingJobs = [],
  preserveJobDetails = true,
  onJobsReady = null,
}) {
  if (!supabase || !user) return null;

  // Najważniejsza lista montaży startuje od razu i nie czeka na profile,
  // powiadomienia ani inne poboczne dane. Dzięki temu wolny Auth/profiles
  // nie może zablokować pokazania nowego montażu.
  const jobsPromise = getJobsData({ supabase });
  const accessPromise = getAccessData({ supabase, existingJobs });
  const profilePromise = getCurrentProfile({ supabase, user, existingProfile });
  const teamPromise = getTeamProfiles({ supabase, existingProfiles });
  const notificationsPromise = getNotificationsData({ supabase, user, existingNotifications });

  const { jobsData: initialJobsData, jobsFields } = await jobsPromise;
  const jobsData = await syncStaleJobsStatus({
    supabase,
    jobsData: initialJobsData,
    jobsFields,
    normalizeStatus,
    isOlderThan30Days,
  });

  // Provisional list uses the viewers already cached on the phone. It is
  // applied immediately; fresh job_access follows independently below.
  const provisionalJobs = buildCombinedJobs({
    jobsData,
    accessData: getExistingAccessData(existingJobs),
    existingJobs,
    preserveJobDetails,
  });
  if (typeof onJobsReady === 'function') {
    await onJobsReady(provisionalJobs);
  }

  const [me, team, accessData, notificationsData] = await Promise.all([
    profilePromise,
    teamPromise,
    accessPromise,
    notificationsPromise,
  ]);

  const combinedJobs = buildCombinedJobs({
    jobsData,
    accessData,
    existingJobs: provisionalJobs,
    preserveJobDetails,
  });

  return {
    sessionUser: user,
    profile: me,
    profiles: team,
    jobs: combinedJobs,
    notifications: notificationsData,
  };
}
