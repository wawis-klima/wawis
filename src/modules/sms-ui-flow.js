export async function refreshSmsMutation({
  reloadSmsData,
  refreshAll,
  afterRefresh,
} = {}) {
  const tasks = [];
  if (typeof reloadSmsData === 'function') {
    tasks.push(Promise.resolve().then(() => reloadSmsData({ silent: true })));
  }
  if (typeof refreshAll === 'function') {
    tasks.push(Promise.resolve().then(() => refreshAll()));
  }

  await Promise.allSettled(tasks);

  if (typeof afterRefresh === 'function') {
    return afterRefresh();
  }
  return undefined;
}

export async function refreshSmsMutationWithHistory({
  reloadSmsData,
  refreshAll,
  loadFullHistoryPage,
  afterRefresh,
} = {}) {
  await refreshSmsMutation({ reloadSmsData, refreshAll });

  if (typeof loadFullHistoryPage === 'function') {
    await loadFullHistoryPage(1);
  }

  if (typeof afterRefresh === 'function') {
    return afterRefresh();
  }
  return undefined;
}

export async function refreshSmsMutationForVisibleHistory({
  showHistory = false,
  reloadSmsData,
  refreshAll,
  loadFullHistoryPage,
  afterRefresh,
} = {}) {
  if (showHistory) {
    return refreshSmsMutationWithHistory({
      reloadSmsData,
      refreshAll,
      loadFullHistoryPage,
      afterRefresh,
    });
  }
  return refreshSmsMutation({
    reloadSmsData,
    refreshAll,
    afterRefresh,
  });
}
