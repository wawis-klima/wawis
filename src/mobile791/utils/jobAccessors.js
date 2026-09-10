import {
  canAddJobComment,
  canEditJob,
  canManageJobViewers,
  canModifyJobPhotos,
  canWorkerFinishJob,
  isWorkerLockedCompletedJob,
} from "./jobPermissions.js";

export function findResolvedJob(jobOrId, jobs, selectedJob) {
  if (typeof jobOrId !== "string") return jobOrId || null;
  return jobs.find((item) => item.id === jobOrId) || (selectedJob?.id === jobOrId ? selectedJob : null);
}

export function createJobAccessors({ jobs, selectedJob, isAdmin }) {
  const getResolvedJob = (jobOrId) => findResolvedJob(jobOrId, jobs, selectedJob);

  return {
    getResolvedJob,
    isCompletedJobLockedForWorker: (jobOrId) => isWorkerLockedCompletedJob(getResolvedJob(jobOrId), isAdmin),
    canEditResolvedJob: (jobOrId) => canEditJob(getResolvedJob(jobOrId), isAdmin),
    canModifyResolvedJobPhotos: (jobOrId) => canModifyJobPhotos(getResolvedJob(jobOrId), isAdmin),
    canAddResolvedJobComment: (jobOrId) => canAddJobComment(getResolvedJob(jobOrId), isAdmin),
    canManageResolvedJobViewers: (jobOrId) => canManageJobViewers(getResolvedJob(jobOrId), isAdmin),
    canWorkerCompleteJob: (jobOrId) => canWorkerFinishJob(getResolvedJob(jobOrId), isAdmin),
  };
}
