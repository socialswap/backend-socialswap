# Backend Project Details – SocialSwap

This is the backend server for **SocialSwap**, a platform for buying and selling verified YouTube channels.

---

## 🛠️ Technology Stack
- **Runtime Environment:** Node.js
- **Web Framework:** Express.js
- **Database:** MongoDB (via Mongoose ODM)
- **Authentication:** JWT (JSON Web Tokens), Google OAuth2, Email OTP
- **Image Hosting:** ImgBB API Integration (for banners and avatars)
- **Security Middleware:** CORS, Helmet (for custom CSP and strict security headers)
- **Utilities:** Multer (for form-data file memory storage), NodeMailer (for OTP delivery), BcryptJS (for password hashing)

---

## 📂 Project Structure

```text
backend-socialswap/
├── config/
│   └── db.js                 # MongoDB database connection configuration
├── controllers/
│   ├── admin/
│   │   └── admin.js          # Admin-specific user, channel, and transaction APIs
│   ├── bannerController.js   # Banner management (create, update, delete)
│   ├── blogs.js              # Blog posts CRUD
│   ├── cart.js               # Buyer shopping cart logic
│   ├── channelController.js  # Channel listings, searches, and verification
│   ├── emailOtpAuth.js       # OTP generation, dispatch, and verification
│   ├── googleAuth.js         # Google login token parsing and user syncing
│   ├── login.js              # Standard password email login
│   ├── orders.js             # Order transactions and status tracking
│   ├── payment.js            # Payment processing and gateway integrations
│   ├── profile.js            # User profile, role, status updates, and deletion
│   └── signup.js             # User registration
├── middleware/
│   ├── auth.js               # JWT security and role validation middleware
│   └── multer.js             # File parsing configurations
├── models/
│   ├── banner.js             # Dashboard promotional banners
│   ├── blog.js               # Blog schema
│   ├── cart.js               # Shopping cart item references
│   ├── channel.js            # YouTube channel metadata (subs, views, monetized)
│   ├── payment.js            # Payment/invoice status records
│   └── user.js               # User accounts (role, auth provider, status)
├── routes/
│   ├── bannerRoutes.js       # Banner routes mapping
│   └── routes.js             # Main router mapping for auth, channels, profile, blogs, and cart
├── .env                      # Environment variables
├── index.js                  # App main entry point
└── package.json              # Backend dependencies
```

---

## 🔒 Security Policies

### User Status Restriction
All authentication flows (Email OTP verification, standard login, and Google OAuth) strictly verify user accounts. If a user's status is anything other than `active` (`suspended`, `disabled`, or `deleted`), login attempts are rejected with a `403 Forbidden` response.

### Protected API Routes
User management endpoints (`/users`, `/users/:userId`, etc.), channel creation, cart modification, and transaction history are protected by the JWT check middleware. Only verified users can access them, with critical user-management actions restricted strictly to accounts with the `admin` role.

---

## 🚀 Getting Started

### Prerequisites
- Node.js installed locally.
- A running MongoDB instance (or Mongo Atlas connection string).

### Setup Environment
Create a `.env` file in the root directory:
```env
PORT=8090
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
SMTP_HOST=your_smtp_host
SMTP_PORT=your_smtp_port
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
IMGBB_API_KEY=your_imgbb_api_key
```

### Run Server
```bash
# Install dependencies
npm install

# Run in development mode (with nodemon auto-restart)
npm run dev

# Run in production mode
npm start
```
The server will boot up by default on port `8090`.
