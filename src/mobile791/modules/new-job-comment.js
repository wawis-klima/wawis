// New mobile job: administrator note and worker comment have separate storage.
export function getNewJobCommentConfig(isAdmin) {
  return isAdmin
    ? { field: 'admin_note', label: 'Komentarz administratora', placeholder: 'Komentarz administratora', voiceLabel: 'Komentarz administratora' }
    : { field: 'worker_comment', label: 'Komentarz', placeholder: 'Komentarz do montażu', voiceLabel: 'Komentarz do montażu' };
}
