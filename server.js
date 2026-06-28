const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();
console.log('✅ Push server started — listening to Firebase RTDB...');

const notified = new Set();

db.ref('messages').on('child_added', async (snap) => {
  const msg = snap.val();
  const key = snap.key;

  if (!msg || !msg.from || !msg.text || !msg.ts) return;
  if (notified.has(key)) return;
  notified.add(key);

  if (Date.now() - msg.ts > 30000) return;

  const sender = msg.from;
  const receiver = sender === 'humam' ? 'rama' : 'humam';

  // Skip kalau penerima sedang online
  try {
    const presSnap = await db.ref(`presence/${receiver}`).once('value');
    const pres = presSnap.val();
    if (pres && pres.online) {
      console.log(`⏭️  ${receiver} online, skip notif`);
      return;
    }
  } catch(e) {}

  const senderDisplay = sender === 'humam' ? 'Humam' : 'Rama';
  const bodyText = msg.text.length > 100 ? msg.text.slice(0, 97) + '...' : msg.text;

  try {
    const tokenSnap = await db.ref(`tokens/${receiver}`).once('value');
    const tokenData = tokenSnap.val();
    if (!tokenData || !tokenData.token) return;

    await admin.messaging().send({
      token: tokenData.token,
      notification: {
        title: senderDisplay,
        body: bodyText,
      },
      android: {
        priority: 'high',
        collapseKey: `chat_${receiver}`,
        notification: {
          sound: 'default',
          channelId: 'wechat_messages',
          tag: `chat_${receiver}`,
          clickAction: 'OPEN_CHAT',
          actions: [
            { action: 'REPLY', title: 'Balas' },
            { action: 'MARK_READ', title: 'Tandai Dibaca' },
          ],
        },
      },
      data: {
        type: 'message',
        sender,
        senderDisplay,
        msgKey: key,
        ts: String(msg.ts),
        body: bodyText,
      },
    });
    console.log(`✅ Notif terkirim ke ${receiver}`);
  } catch (err) {
    console.error(`❌ Gagal:`, err.message);
  }
});

// ── Handle aksi MARK_READ dari notif (via Firebase) ──
// App tulis ke RTDB saat user tap "Tandai Dibaca" dari notif
db.ref('notifActions').on('child_added', async (snap) => {
  const action = snap.val();
  if (!action) return;

  if (action.type === 'markRead' && action.user && db) {
    try {
      await db.ref(`readAt/${action.user}`).set({ ts: Date.now() });
      await snap.ref.remove();
      console.log(`✅ Mark read untuk ${action.user}`);
    } catch(e) {}
  }
});

// ── Keep alive ──
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Push server aktif ✅');
}).listen(PORT, () => {
  console.log(`🌐 HTTP ping server running on port ${PORT}`);
});