require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // For adding security headers
const connectDB = require('./config/db');
const youtubeChannelRoutes = require('./routes/routes');
const payment = require('./controllers/payment');
const admin = require('./controllers/admin/admin');
const order = require('./controllers/orders')
const app = express();
const path = require('path');
const multer = require('multer');
const webpush = require('web-push');
const PushSubscription = require('./models/pushSubscription');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@socialswap.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);
connectDB();

// Cache control helper
const cacheControl = (seconds) => (req, res, next) => {
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`);
  next();
};
const { uploadToR2 } = require('./config/r2');

const corsOptions = {

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  // allowedHeaders: ['Content-Type', 'Authorization'],
 
  maxAge: 86400 // 24 hours
};

// ImgBB API key from environment variables
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '338c0d8da9a3175d9b6e43e47959c3dc';
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Enable Cross-Origin Resource Sharing (CORS)
app.use(cors());

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', '*'], // Allow images from any source
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://*'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));

// Set custom headers for enhanced security
app.use((req, res, next) => {
  // Set stricter security headers
  res.set({
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  });
  next();
});

// Bot detection middleware - adds SEO-friendly headers for crawlers
app.use((req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const botPatterns = [
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
    'yandexbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'whatsapp', 'telegrambot', 'applebot', 'prerender'
  ];
  const isBot = botPatterns.some(bot => userAgent.toLowerCase().includes(bot));
  req.isBot = isBot;
  next();
});

// Middleware for parsing JSON bodies
app.use(express.json());


// Image upload route
app.post('/uploads', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No image uploaded');
  }

  try {
    const imageUrl = await uploadToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
    return res.status(200).send({
      message: 'Image uploaded successfully!',
      imageUrl,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send('An error occurred: ' + error.message);
  }
});

// app.use('/uploads',  express.static(path.join('/tmp', 'uploads'), {
//   setHeaders: (res, path, stat) => {
//     // Allow cross-origin access to files
//     res.set('Access-Control-Allow-Origin', '*');
//     res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
//     res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
//     // Set caching headers
//     res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
//     // Set content type header based on file extension
//     if (path.endsWith('.png')) {
//       res.set('Content-Type', 'image/png');
//     } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
//       res.set('Content-Type', 'image/jpeg');
//     }
//   }
// }));
// Middleware for parsing application/x-www-form-urlencoded bodies
app.use(express.urlencoded({ extended: false }));

// Serve sitemap at root level
app.get('/sitemap.xml', async (req, res) => {
  const { getSitemap } = require('./controllers/sitemapController');
  getSitemap(req, res);
});

// Serve robots.txt at root level
app.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /user/
Disallow: /edit-channel/
Disallow: /confirmation/
Disallow: /payment/
Disallow: /unauthorized

Sitemap: https://www.socialswap.in/sitemap.xml`);
});

// Route for handling API requests
app.use('/api', youtubeChannelRoutes);
app.use('/api', payment);
app.use('/api', admin);
app.use('/api', order);

// Create HTTP server and initialize Socket.IO
const http = require('http');
const { Server } = require('socket.io');
const Conversation = require('./models/chat');
const Message = require('./models/message');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust appropriately in production
    methods: ["GET", "POST"]
  }
});

// Socket.IO Connection Logic
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // User joins their specific chat thread
  socket.on('join_thread', (threadId) => {
    socket.join(threadId);
    console.log(`User ${socket.id} joined thread ${threadId}`);
  });

  // Global connection for notifications
  socket.on('global_connect', ({ userId, role }) => {
    if (role === 'admin') {
      socket.join('admins');
      console.log(`Admin joined global notifications: ${socket.id}`);
    } else if (userId) {
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined global notifications: ${socket.id}`);
    }
  });

  // Handle incoming messages
  socket.on('send_message', async (data) => {
    try {
      const { threadId, sender, text, imageUrl, isDealCard, dealId, isChannelCard, channelId, replyTo } = data;
      
      const thread = await Conversation.findById(threadId);
      if (thread) {
        const newMessage = new Message({
          conversationId: threadId,
          sender,
          type: isDealCard ? 'deal' : isChannelCard ? 'channel' : imageUrl ? 'image' : 'text',
          text,
          mediaUrl: imageUrl,
          isDeal: isDealCard || false,
          dealId,
          isChannel: isChannelCard || false,
          channelId,
          replyTo: replyTo || null
        });
        await newMessage.save();

        thread.lastMessage = newMessage._id;
        await thread.save();

        await newMessage.populate('sender', 'name avatar role');
        await newMessage.populate({
          path: 'dealId',
          populate: { path: 'channel', select: 'name price bannerUrl' }
        });
        await newMessage.populate('channelId', 'name price category subscriberCount imageUrls customUrl');
        await newMessage.populate('replyTo');
        await newMessage.populate('reactions.user', 'name avatar');

        io.to(threadId).emit('receive_message', newMessage);

        if (newMessage.sender.role !== 'admin') {
          io.to('admins').emit('global_notification', { threadId: thread._id, message: newMessage });
          
          // Send push to admins
          try {
            const adminUsers = await require('./models/user').find({ role: 'admin' });
            const adminIds = adminUsers.map(a => a._id);
            const subscriptions = await PushSubscription.find({ userId: { $in: adminIds } });
            
            const payload = JSON.stringify({
              title: `New message from ${newMessage.sender.name}`,
              body: newMessage.text || (newMessage.mediaUrl ? 'Sent an image' : 'Sent an update'),
              url: `/admin/chats` // Redirect URL for admin
            });
            
            for (let sub of subscriptions) {
              const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
              webpush.sendNotification(pushSub, payload).catch(err => {
                console.error('Webpush to admin error:', err.statusCode, err.body || err);
                if (err.statusCode === 410) {
                  PushSubscription.deleteOne({ _id: sub._id }).exec();
                }
              });
            }
          } catch(err) { console.error('Push error (admin loop):', err); }

        } else {
          const otherParticipant = thread.participants.find(p => p.toString() !== sender.toString());
          if (otherParticipant) {
            io.to(`user_${otherParticipant.toString()}`).emit('global_notification', { threadId: thread._id, message: newMessage });
            
            // Send push to the user
            try {
              const subscriptions = await PushSubscription.find({ userId: otherParticipant });
              const payload = JSON.stringify({
                title: `New message from Admin`,
                body: newMessage.text || (newMessage.mediaUrl ? 'Sent an image' : 'Sent an update'),
                url: `/user/chat` // Redirect URL for user
              });
              
              for (let sub of subscriptions) {
                const pushSub = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
                webpush.sendNotification(pushSub, payload).catch(err => {
                  console.error('Webpush to user error:', err.statusCode, err.body || err);
                  if (err.statusCode === 410) {
                    PushSubscription.deleteOne({ _id: sub._id }).exec();
                  }
                });
              }
            // Send email notification to the user so they get notified even when offline
            try {
              const recipientUser = await require('./models/user').findById(otherParticipant);
              if (recipientUser && recipientUser.email) {
                const { sendMailWithLogo } = require('./utils/mailer');
                const cleanText = newMessage.text 
                  ? newMessage.text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')
                  : (newMessage.mediaUrl ? '📷 [Image Attachment]' : 'New message from support');
                
                const emailHtml = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937; background-color: #f9fafb; border-radius: 16px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                      <img src="cid:socialswap-logo" alt="SocialSwap" style="height: 42px; width: auto;" />
                    </div>
                    <div style="background: #ffffff; border-radius: 16px; padding: 32px 28px; border: 1px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0,0,0,0.04);">
                      <div style="display: inline-block; padding: 4px 12px; background-color: #EDE9FE; color: #7C3AED; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px;">
                        💬 Support Message
                      </div>
                      <h2 style="color: #111827; margin: 0 0 12px 0; font-size: 20px; font-weight: 700;">
                        New Reply from SocialSwap Support
                      </h2>
                      <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 16px 0;">
                        Hello <strong>${recipientUser.name || 'there'}</strong>,
                      </p>
                      <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 20px 0;">
                        An agent replied to your inquiry on SocialSwap:
                      </p>
                      
                      <div style="background: #F5F3FF; border-left: 4px solid #7C3AED; padding: 16px 20px; border-radius: 10px; margin-bottom: 24px; font-size: 15px; line-height: 1.6; color: #374151;">
                        ${cleanText}
                      </div>

                      <div style="text-align: center; margin: 28px 0 12px 0;">
                        <a href="https://www.socialswap.in/user/chat" style="display: inline-block; background: linear-gradient(135deg, #7C3AED, #9333EA); color: #ffffff; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 15px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);">
                          Open Chat & Reply →
                        </a>
                      </div>
                    </div>
                    <p style="text-align: center; font-size: 12px; color: #9ca3af; margin-top: 24px;">
                      You received this email because you started a chat inquiry on <a href="https://www.socialswap.in" style="color: #7C3AED; text-decoration: none;">SocialSwap</a>.
                    </p>
                  </div>
                `;

                sendMailWithLogo(
                  recipientUser.email,
                  `New reply from SocialSwap Support: "${(newMessage.text || 'New message').substring(0, 45)}"`,
                  emailHtml
                ).then(sent => {
                  console.log(`[Chat Email] Notification sent to ${recipientUser.email}: ${sent}`);
                }).catch(err => {
                  console.error('[Chat Email] Error sending notification email:', err);
                });
              }
            } catch(mailErr) {
              console.error('[Chat Email] Lookup error:', mailErr);
            }
          }
        }
      }
    } catch (error) {
      console.error('Socket send_message error:', error);
    }
  });

  // Handle read receipts
  socket.on('mark_read', async ({ threadId, userId }) => {
    try {
      await Message.updateMany(
        { conversationId: threadId, sender: { $ne: userId }, read: false },
        { $set: { read: true, status: 'seen' } }
      );
    } catch (error) {
      console.error('Socket mark_read error:', error);
    }
  });

  // Handle message reactions
  socket.on('add_reaction', async ({ messageId, userId, reaction }) => {
    try {
      const msg = await Message.findById(messageId);
      if (msg) {
        msg.reactions = msg.reactions.filter(r => r.user.toString() !== userId);
        if (reaction) {
          msg.reactions.push({ user: userId, reaction });
        }
        await msg.save();
        await msg.populate('sender', 'name avatar role');
        await msg.populate('reactions.user', 'name avatar');
        await msg.populate('replyTo');
        io.to(msg.conversationId.toString()).emit('message_updated', msg);
      }
    } catch (error) {
      console.error('Socket add_reaction error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 8090;
server.listen(PORT, () => console.log(`Server running on port ${PORT} with Socket.IO`));
