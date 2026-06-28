const admin = require('firebase-admin');

// ── Init Firebase Admin ──
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

const db = admin.database();

console.log('✅ Push server started — listening to Firebase RTDB...');

// ── Track pesan yang sudah dinotif (cegah duplikat) ──
const notified = new Set();

// ── Listen ke semua pesan baru ──
db.ref('messages').on('child_added', async (snap) => {
  const msg = snap.val();
  const key = snap.key;

  if (!msg || !msg.from || !msg.text || !msg.ts) return;
  if (notified.has(key)) return;
  notified.add(key);

  // Jangan notif pesan lama (lebih dari 30 detik)
  if (Date.now() - msg.ts > 30000) return;

  const sender = msg.from;        // 'humam' atau 'rama'
  const receiver = sender === 'humam' ? 'rama' : 'humam';

  console.log(`📨 Pesan baru dari ${sender} ke ${receiver}: "${msg.text?.slice(0, 40)}"`);

  // Ambil FCM token penerima
  try {
    const tokenSnap = await db.ref(`tokens/${receiver}`).once('value');
    const tokenData = tokenSnap.val();

    if (!tokenData || !tokenData.token) {
      console.log(`⚠️  Token ${receiver} tidak ditemukan`);
      return;
    }

    const fcmToken = tokenData.token;

    // Nama display pengirim
    const senderDisplay = sender === 'humam' ? 'Humam' : 'Rama';

    // Kirim notif FCM
    const message = {
      token: fcmToken,
      notification: {
        title: senderDisplay,
        body: msg.text.length > 100 ? msg.text.slice(0, 97) + '...' : msg.text,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'wechat_messages',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      data: {
        from: sender,
        msgKey: key,
        ts: String(msg.ts),
      },
    };

    await admin.messaging().send(message);
    console.log(`✅ Notif terkirim ke ${receiver}`);

  } catch (err) {
    console.error(`❌ Gagal kirim notif:`, err.message);
  }
});

// ── Keep alive (Render free tier butuh HTTP port) ──
const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Push server aktif ✅');
}).listen(PORT, () => {
  console.log(`🌐 HTTP ping server running on port ${PORT}`);
});
