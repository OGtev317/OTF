// A small stand-in for supabase-js query builders: filters, ordering and ranges over fixture rows.
// Rows without a filtered column (fixtures often omit family_id) are kept.
export function query(rows) {
  const filters = [], sort = [];
  let from = 0, to = Infinity;
  const missing = (row, key) => !(key in row);
  const builder = {
    select: () => builder,
    eq: (key, value) => (filters.push((r) => missing(r, key) || r[key] === value), builder),
    neq: (key, value) => (filters.push((r) => (r[key] ?? "pending") !== value), builder),
    in: (key, values) => (filters.push((r) => values.includes(r[key])), builder),
    gte: (key, value) => (filters.push((r) => r[key] >= value), builder),
    lt: (key, value) => (filters.push((r) => r[key] < value), builder),
    order: (key, { ascending = true } = {}) => (sort.push([key, ascending]), builder),
    range: (a, b) => ((from = a), (to = b), builder),
    limit: (n) => ((to = from + n - 1), builder),
    then(resolve, reject) {
      try {
        const data = structuredClone(rows()).filter((r) => filters.every((f) => f(r)));
        data.sort((a, b) => {
          for (const [key, up] of sort) {
            const c = String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
            if (c) return up ? c : -c;
          }
          return 0;
        });
        resolve({ data: data.slice(from, to + 1), error: null });
      } catch (error) {
        reject(error);
      }
    },
  };
  return builder;
}
