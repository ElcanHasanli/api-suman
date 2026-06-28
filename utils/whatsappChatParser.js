/**
 * WhatsApp export (.txt) parser — kuryer qrupu müştəri qeydləri.
 */
import { normalizePhone } from './phone.js';
import { parseCustomerName } from './customerName.js';

const MSG_HEADER =
  /^\[(\d{2})\.(\d{2})\.(\d{2}), (\d{2}):(\d{2}):(\d{2})\] ([^:]+): (.*)$/;

const BIDON_RE = /(\d+)\s*b[iı]don/i;
const BOS_RE = /(\d+)\s*b[oö][sş]/i;
const VAR_RE = /var\s*(\d+)/i;

const SKIP_BLOCK_RE =
  /^(su doldurma|su dolum|\d{2}_\d{2}\.\d{2}\.\d{4}|dolu\.|bos\.|satis\.|xerc|masinda|dolumda|qeyd|qalıq|qaliq|novbeti|odenilib|cemi|yanacaq|pompa|abi |ok bax|location:|https?:\/\/|waze|google\.com|messages and calls|created this group|added you)/i;

const CUSTOMER_HINT_RE =
  /(var\s*\d+|b[iı]don|b[oö][sş]|qiymet|qiymət|nisye|niste|nişye|borc)/i;

const WAREHOUSE_FIRST_LINE_RE = /^su doldurma|^su dolum/i;

const PHONE_RE =
  /(?:^|\s|\()((?:0\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})|(?:\+994[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}))(?=\s|$|\)|[^\d])/gi;

const PHONE_LINE_RE =
  /(?:^|\s|\()((?:0\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})|(?:\+994[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}))(?=\s|$|\)|[^\d])/;

function parseMessageDate(d, m, y, hh, mm, ss) {
  const year = 2000 + Number(y);
  return new Date(year, Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
}

export function splitWhatsappMessages(raw) {
  const lines = raw.replace(/\u202f/g, ' ').split(/\r?\n/);
  const messages = [];
  let current = null;

  for (const line of lines) {
    const cleaned = line.replace(/^[\u200e\u200f\ufeff]+/, '');
    const m = cleaned.match(MSG_HEADER);
    if (m) {
      if (current) messages.push(current);
      const [, d, mo, y, hh, mm, ss, sender, firstLine] = m;
      current = {
        date: parseMessageDate(d, mo, y, hh, mm, ss),
        sender: sender.trim(),
        lines: firstLine ? [firstLine] : [],
      };
    } else if (current && line.trim()) {
      current.lines.push(
        line
          .trim()
          .replace(/\s*<This message was edited>.*$/i, '')
          .replace(/\s*‎.*$/, '')
          .trim()
      );
    }
  }
  if (current) messages.push(current);
  return messages;
}

function extractPhones(text) {
  const found = [];
  let match;
  const re = new RegExp(PHONE_RE.source, PHONE_RE.flags);
  while ((match = re.exec(text)) !== null) {
    const raw = match[1].replace(/\s+/g, ' ').trim();
    const normalized = normalizePhone(raw);
    if (normalized.length >= 12) {
      found.push({ display: raw.replace(/\s+/g, ' ').trim(), normalized });
    }
  }
  const unique = [];
  const seen = new Set();
  for (const p of found) {
    if (!seen.has(p.normalized)) {
      seen.add(p.normalized);
      unique.push(p);
    }
  }
  return unique;
}

function parseMoney(label, text) {
  const re = new RegExp(`${label}\\s*(\\d+((?:[.,]\\d+)?))\\s*azn`, 'gi');
  let last = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    last = Number(String(m[1]).replace(',', '.'));
  }
  return last;
}

function parseDebt(text, lines) {
  const re = /(?:nisye|niste|nişye|nişə)\s*(\d+(?:[.,]\d+)?)(?:\s*azn)?/gi;
  let last = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    last = Number(String(m[1]).replace(',', '.'));
  }
  if (last != null) return last;

  last =
    parseMoney('kohne nisye', text) ??
    parseMoney('kohne niste', text);
  if (last != null) return last;

  for (let i = 0; i < lines.length; i++) {
    if (/^(?:nisye|niste|nişye|nişə)\s*$/i.test(lines[i].trim())) {
      const next = lines[i + 1]?.trim();
      if (next && /^(\d+(?:[.,]\d+)?)$/.test(next)) {
        return Number(next.replace(',', '.'));
      }
    }
  }

  let pastPrice = false;
  for (const line of lines) {
    if (/^(?:qiymet|qiymət)/i.test(line.trim())) pastPrice = true;
    const t = line.trim();
    if (pastPrice && /^(\d+(?:[.,]\d+)?)$/.test(t)) {
      last = Number(t.replace(',', '.'));
    }
  }
  return last ?? 0;
}

function parseStandalonePrice(lines) {
  let pastVar = false;
  let sawPriceLabel = false;
  for (const line of lines) {
    if (/^(?:qiymet|qiymət)/i.test(line.trim())) {
      sawPriceLabel = true;
      break;
    }
    if (VAR_RE.test(line)) pastVar = true;
    const t = line.trim();
    if (pastVar && /^(\d+(?:[.,]\d+)?)$/.test(t)) {
      return Number(t.replace(',', '.'));
    }
  }
  if (sawPriceLabel) return null;
  return null;
}

function isDeliveryLine(line) {
  return BIDON_RE.test(line) || BOS_RE.test(line) || VAR_RE.test(line);
}

function parseCustomerBlock(msg) {
  const text = msg.lines.join('\n');
  const firstLine = msg.lines[0] ?? '';

  if (SKIP_BLOCK_RE.test(firstLine.trim())) return null;
  if (WAREHOUSE_FIRST_LINE_RE.test(firstLine.trim())) return null;
  if (!CUSTOMER_HINT_RE.test(text)) return null;

  const phones = extractPhones(text);
  if (!phones.length) return null;

  let nameLine = firstLine
    .replace(/\s*-\s*(yeni unvan|yeni musteri|yeni müştəri).*$/i, '')
    .replace(/\s*-\s*$/, '')
    .trim();

  if (!nameLine || nameLine.length < 2) return null;

  const phoneLineIdx = msg.lines.findIndex((l) => PHONE_LINE_RE.test(l));
  const addressLines =
    phoneLineIdx > 0
      ? msg.lines.slice(1, phoneLineIdx).filter((l) => !CUSTOMER_HINT_RE.test(l) && !/^\(.*\)$/.test(l))
      : msg.lines.slice(1).filter((l) => {
          if (PHONE_LINE_RE.test(l)) return false;
          if (/^\(.*\)$/.test(l)) return false;
          if (/^(qiymet|qiymət|nisye|niste|nişye|kohne|borc|odenildi|odenilib|pompa|sonlandi)/i.test(l))
            return false;
          if (isDeliveryLine(l)) return false;
          return true;
        });

  const parsedName = parseCustomerName({ full_name: nameLine });
  if (!parsedName?.name) return null;

  const bidonMatch = text.match(BIDON_RE);
  const bosMatch = text.match(BOS_RE);
  const varMatch = text.match(VAR_RE);

  const price =
    parseMoney('qiymet', text) ??
    parseMoney('qiymət', text) ??
    parseMoney('Qiymet', text) ??
    parseStandalonePrice(msg.lines) ??
    0;

  const debt = parseDebt(text, msg.lines);

  const activeBidons = varMatch ? Number(varMatch[1]) : 0;

  return {
    date: msg.date,
    sender: msg.sender,
    name: parsedName.name,
    surname: parsedName.surname,
    address: addressLines.join(', ').trim() || 'Ünvan qeyd olunmayıb',
    phone: phones[0].display,
    phone_normalized: phones[0].normalized,
    phone2: phones[1]?.display ?? null,
    phone2_normalized: phones[1]?.normalized ?? null,
    active_bidons: activeBidons,
    debt,
    price,
    raw_preview: text.slice(0, 120),
    last_delivery: {
      full_bidons: bidonMatch ? Number(bidonMatch[1]) : null,
      empty_bidons: bosMatch ? Number(bosMatch[1]) : null,
    },
  };
}

export function mergeWhatsappCustomers(lists) {
  const byPhone = new Map();
  for (const customers of lists) {
    for (const c of customers) {
      const existing = byPhone.get(c.phone_normalized);
      if (!existing || c.date > existing.date) {
        byPhone.set(c.phone_normalized, c);
      }
    }
  }
  return [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name, 'az'));
}

export function parseWhatsappCustomers(raw) {
  const messages = splitWhatsappMessages(raw);
  const byPhone = new Map();

  for (const msg of messages) {
    const customer = parseCustomerBlock(msg);
    if (!customer) continue;

    const existing = byPhone.get(customer.phone_normalized);
    if (!existing || customer.date > existing.date) {
      byPhone.set(customer.phone_normalized, customer);
    }
  }

  return [...byPhone.values()].sort((a, b) => a.name.localeCompare(b.name, 'az'));
}

export function mergeWhatsappWarehouse(lists) {
  return lists.flat().sort((a, b) => a.date - b.date);
}

export function parseWhatsappWarehouse(raw) {
  const messages = splitWhatsappMessages(raw);
  const entries = [];

  for (const msg of messages) {
    const firstLine = (msg.lines[0] ?? '').trim();
    if (!WAREHOUSE_FIRST_LINE_RE.test(firstLine)) continue;

    const text = msg.lines.join('\n');

    const emptyIn =
      text.match(/giri[wş]\s*(\d+)\s*b[oö][sş]\s*(\d+)\s*dolu/i) ??
      text.match(/(\d+)\s*b[oö][sş]\s*(\d+)\s*dolu/i);
    const fullOut = text.match(/\+\s*(\d+)\s*dolu/i);
    const exitFull = text.match(/cix[iw][sş]?\s*(\d+)\s*(?:dolu|bidon)?/i);
    const remaining = text.match(/(?:yerde\s+)?qald[iı]\s*(\d+)/i);

    if (!remaining) continue;

    entries.push({
      date: msg.date,
      empty_in: emptyIn ? Number(emptyIn[1]) : 0,
      full_in: emptyIn ? Number(emptyIn[2]) : 0,
      full_out: fullOut ? Number(fullOut[1]) : 0,
      exit_full: exitFull ? Number(exitFull[1]) : null,
      remaining_full: Number(remaining[1]),
    });
  }

  return entries;
}
