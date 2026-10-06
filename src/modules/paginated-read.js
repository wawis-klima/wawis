export async function fetchAllOrderedTableRows({
  supabase,
  table,
  fields,
  pageSize = 500,
  orderBy = 'created_at',
  ascending = false,
} = {}) {
  if (!supabase || !table || !fields) {
    return { data: [], error: new Error('Brak parametrów paginowanego odczytu.') };
  }

  const normalizedPageSize = Math.min(1000, Math.max(1, Number(pageSize) || 500));
  const rows = [];

  for (let from = 0; ; from += normalizedPageSize) {
    let request = supabase
      .from(table)
      .select(fields)
      .order(orderBy, { ascending });

    if (orderBy !== 'id') {
      request = request.order('id', { ascending });
    }

    const result = await request.range(from, from + normalizedPageSize - 1);
    if (result?.error) return { data: rows, error: result.error };

    const page = Array.isArray(result?.data) ? result.data : [];
    rows.push(...page);
    if (page.length < normalizedPageSize) break;
  }

  return { data: rows, error: null };
}
