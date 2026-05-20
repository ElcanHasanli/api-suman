/** Telefonu müqayisə üçün vahid formata gətirir (məs: 994501234567). */
export function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10 && digits.startsWith('0')) {
    return '994' + digits.slice(1);
  }
  if (digits.length === 9) {
    return '994' + digits;
  }
  return digits;
}

export const DUPLICATE_PHONE_ERROR =
  'Bu telefon nömrəsi artıq başqa müştəriyə aid edilib';
