const ADMIN_CATEGORIES = new Set([
  'payroll',
  'fuel',
  'rent',
  'supplies',
  'equipment',
  'other',
]);

export function isValidAdminCategory(category) {
  if (!category) return true;
  return ADMIN_CATEGORIES.has(String(category).toLowerCase());
}

export function formatExpenseRow(row) {
  const source = row.source || (row.courier_id ? 'courier' : 'admin');
  return {
    ...row,
    source,
    courier_name:
      row.courier_name ??
      (source === 'admin' ? 'Admin' : null),
  };
}
