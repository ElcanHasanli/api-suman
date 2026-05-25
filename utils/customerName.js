/** Tək input: "Ad Soyad" və ya yalnız ad. */
export function parseCustomerName(body) {
  if (body.full_name != null && String(body.full_name).trim()) {
    const parts = String(body.full_name).trim().split(/\s+/);
    return {
      name: parts[0],
      surname: parts.length > 1 ? parts.slice(1).join(' ') : null,
    };
  }

  const name = body.name != null ? String(body.name).trim() : '';
  const surname = body.surname != null ? String(body.surname).trim() : null;

  if (!name) return null;

  if (!surname && name.includes(' ')) {
    const parts = name.split(/\s+/);
    return {
      name: parts[0],
      surname: parts.length > 1 ? parts.slice(1).join(' ') : null,
    };
  }

  return { name, surname: surname || null };
}

export function formatCustomerDisplay(row) {
  return [row.name, row.surname].filter(Boolean).join(' ').trim();
}
