const webpush = require('web-push');
const PushSubscription = require('../models/pushSubscription');
const User = require('../models/user');

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:official@socialswap.in', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('Push: VAPID keys missing, push notifications are off.');
}

/**
 * Sends one notification to every browser/device the given users have subscribed.
 * payload: { title, body, url, tag?, alwaysShow? } (read by public/sw.js).
 * Never throws: a failed push must not break the chat message or payment that caused it.
 */
const sendPushToUsers = async (userIds, payload) => {
  if (!pushEnabled) return 0;
  const ids = (Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean);
  if (!ids.length) return 0;

  try {
    const subscriptions = await PushSubscription.find({ userId: { $in: ids } }).lean();
    const body = JSON.stringify(payload);

    const results = await Promise.all(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
        return true;
      } catch (err) {
        // 404/410: the browser dropped this subscription, so forget it
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          console.error('Push send failed:', err.statusCode, err.body || err.message);
        }
        return false;
      }
    }));
    return results.filter(Boolean).length;
  } catch (err) {
    console.error('Push lookup failed:', err.message);
    return 0;
  }
};

const sendPushToAdmins = async (payload) => {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id').lean();
    return sendPushToUsers(admins.map(a => a._id), payload);
  } catch (err) {
    console.error('Push admin lookup failed:', err.message);
    return 0;
  }
};

module.exports = { sendPushToUsers, sendPushToAdmins };
