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
    const credential = JSON.parse(raw);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credential),
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

/**
 * Kuryerin qeydiyyatlı cihazlarına push göndərir.
 */
export async function sendPushToUser(userId, { title, body, data = {} }) {
  const fcm = await getMessaging();
  if (!fcm) return { sent: 0, skipped: 'firebase_not_configured' };

  const tokensResult = await pool.query(
    'SELECT token FROM push_device_tokens WHERE user_id = $1',
    [userId]
  );

  if (tokensResult.rows.length === 0) {
    return { sent: 0, skipped: 'no_device_tokens' };
  }

  const tokens = tokensResult.rows.map((r) => r.token);
  let sent = 0;

  for (const token of tokens) {
    try {
      await fcm.send({
        token,
        notification: { title, body },
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
      sent += 1;
    } catch (err) {
      if (
        err.code === 'messaging/registration-token-not-registered' ||
        err.code === 'messaging/invalid-registration-token'
      ) {
        await pool.query(
          'DELETE FROM push_device_tokens WHERE user_id = $1 AND token = $2',
          [userId, token]
        );
      } else {
        console.warn('FCM send xətası:', err.message);
      }
    }
  }

  return { sent };
}
