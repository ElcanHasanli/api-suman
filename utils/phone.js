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

/** WhatsApp mesaj linki (wa.me) */
export function whatsAppUrl(phone) {
  const normalized = normalizePhone(phone);
  return normalized ? `https://wa.me/${normalized}` : null;
}

/** Inputda yazılanı saxlayır, unikal yoxlama üçün normalized qaytarır. */
export function parsePhoneFields(phone) {
  const display = String(phone ?? '').trim();
  const normalized = normalizePhone(display);
  if (!normalized) return null;
  return { display, normalized };
}
