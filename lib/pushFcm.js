import pool from '../config/database.js';

let messaging = null;
let initAttempted = false;

async function getMessaging() {
  if (initAttempted) return messaging;
  initAttempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) {
    return null;
  }

  try {
    const { default: admin } = await import('firebase-admin');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(raw)),
      });
    }

    messaging = admin.messaging();
    console.log('✅ Firebase Cloud Messaging aktiv');
  } catch (err) {
    console.warn('⚠️ Firebase init uğursuz (push deaktiv):', err.message);
    messaging = null;
  }

  return messaging;
}

function stringifyData(data = {}) {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v == null ? '' : String(v)])
  );
}

async function removeInvalidTokens(tokens) {
  for (const token of tokens) {
    await pool.query('DELETE FROM device_tokens WHERE token = $1', [token]);
    await pool.query('DELETE FROM push_device_tokens WHERE token = $1', [token]).catch(() => {});
  }
}

/**
 * Bir neçə tokenə multicast push.
 */
export async function sendPushMulticast(tokens, { title, body, data = {} }) {
  const fcm = await getMessaging();
  const unique = [...new Set(tokens.filter(Boolean))];

  if (!fcm) return { sent: 0, skipped: 'firebase_not_configured' };
  if (unique.length === 0) return { sent: 0, skipped: 'no_tokens' };

  const payload = {
    notification: { title, body },
    data: stringifyData(data),
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  };

  try {
    const batch = await fcm.sendEachForMulticast({
      tokens: unique,
      ...payload,
    });

    const invalid = [];
    batch.responses.forEach((res, i) => {
      if (!res.success) {
        const code = res.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalid.push(unique[i]);
        }
      }
    });

    if (invalid.length) await removeInvalidTokens(invalid);

    return { sent: batch.successCount, failed: batch.failureCount };
  } catch (err) {
    console.warn('FCM multicast xətası:', err.message);
    return { sent: 0, error: err.message };
  }
}

export async function sendPushToUser(userId, { title, body, data = {}, app }) {
  const tokensResult = await pool.query(
    `SELECT token FROM device_tokens WHERE user_id = $1 AND ($2::text IS NULL OR app = $2)
     UNION
     SELECT token FROM push_device_tokens WHERE user_id = $1`,
    [userId, app ?? null]
  );

  const tokens = tokensResult.rows.map((r) => r.token);
  return sendPushMulticast(tokens, { title, body, data });
}
