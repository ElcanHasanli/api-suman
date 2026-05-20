/** Platform sahibi — bütün şirkətlərə çıxış. */
export function isOwner(user) {
  return user?.role === 'owner';
}

export function requireCompanyId(user) {
  if (isOwner(user)) return null;
  return user?.company_id ?? null;
}

/**
 * SQL: AND alias.company_id = $n
 * Owner üçün filter tətbiq olunmur (owner panel ayrı route-dadır).
 */
export function appendCompanyFilter(user, alias, params) {
  if (isOwner(user) || !user.company_id) {
    return { clause: '', params };
  }
  const idx = params.length + 1;
  return {
    clause: ` AND ${alias}.company_id = $${idx}`,
    params: [...params, user.company_id],
  };
}

export function assertSameCompany(user, resourceCompanyId) {
  if (isOwner(user)) return true;
  return Number(user.company_id) === Number(resourceCompanyId);
}
