# 🍑 Peach CRM — Donor Management System

Full-stack CRM for managing donors, payments, campaigns, telemarketing, and mailing.

---

## 🚀 Quick Start (Local)

### 1. Install PostgreSQL
```bash
# macOS
brew install postgresql && brew services start postgresql

# Ubuntu/Debian
sudo apt install postgresql postgresql-contrib
sudo service postgresql start
```

### 2. Create database
```bash
psql -U postgres -c "CREATE DATABASE peach_crm;"
psql -U postgres -c "CREATE USER peach_user WITH PASSWORD 'your_password';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE peach_crm TO peach_user;"
```

### 3. Setup project
```bash
cd peach-crm
npm install
cp .env.example .env
# Edit .env with your database credentials
```

### 4. Initialize database schema
```bash
npm run db:init
```

### 5. Start the server
```bash
npm run dev        # development (auto-restart)
npm start          # production
```

Server runs at: **http://localhost:3001**

### 6. Default login
- **Email:** admin@peach-crm.local
- **Password:** Admin1234! (change immediately after first login)

---

## 🌐 Deploy to Railway (Free)

1. Push to GitHub:
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR_USER/peach-crm.git
git push -u origin main
```

2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub

3. Add PostgreSQL plugin in Railway dashboard

4. Set environment variables:
```
DATABASE_URL=<Railway gives you this automatically>
JWT_SECRET=<generate a random 64-char string>
NODE_ENV=production
FRONTEND_URL=https://your-frontend.vercel.app
```

5. Done — Railway auto-deploys on every push.

---

## 🌐 Deploy to Render (Free)

1. Go to [render.com](https://render.com) → New Web Service
2. Connect GitHub repo
3. Settings:
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. Add PostgreSQL database from Render dashboard
5. Set environment variables (same as above)

---

## 📡 API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login → returns JWT token |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/users` | Create user (admin only) |

### Donors
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/donors` | List + search + filter |
| GET | `/api/donors/stats` | Dashboard KPIs |
| GET | `/api/donors/:id` | Full donor profile |
| POST | `/api/donors` | Create donor |
| PUT | `/api/donors/:id` | Update donor |
| DELETE | `/api/donors/:id` | Delete (admin only) |
| POST | `/api/donors/import` | Bulk import JSON array |
| POST | `/api/donors/:id/dedications` | Add dedication |

### Payments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/payments` | List transactions |
| GET | `/api/payments/summary` | Monthly/yearly totals |
| POST | `/api/payments` | Create transaction |
| PUT | `/api/payments/:id/status` | Update status |
| POST | `/api/payments/:id/receipt` | Generate receipt |
| GET | `/api/payments/export` | CSV export |

### Campaigns
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/campaigns` | List campaigns |
| GET | `/api/campaigns/:id` | Campaign details |
| POST | `/api/campaigns` | Create campaign |
| PUT | `/api/campaigns/:id` | Update campaign |

### Telemarketing
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/telemarketing/queue` | Prioritized call list |
| POST | `/api/telemarketing/calls` | Log call result |
| GET | `/api/telemarketing/calls` | Call history |
| GET | `/api/telemarketing/stats` | Monthly stats |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks` | List tasks |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |

### Mailing
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mailing` | List mailings |
| POST | `/api/mailing` | Create mailing |
| POST | `/api/mailing/:id/send` | Send mailing |
| GET | `/api/mailing/stats` | Stats |

---

## 🔌 Connecting the Frontend

In the CRM frontend (`index.html`), add before the closing `</body>`:
```html
<script>window.PEACH_API_URL = 'https://your-backend.railway.app/api';</script>
<script src="api.js"></script>
```

Then all frontend calls go through `window.peachAPI`:
```javascript
// Login
const { token, user } = await peachAPI.login('admin@peach-crm.local', 'Admin1234!');

// Get donors
const { data, total } = await peachAPI.getDonors({ q: 'אברהם', limit: 50 });

// Create payment
const txn = await peachAPI.createPayment({ donor_id: '...', amount: 150, type: 'standing_order' });
```

---

## 📦 Import your Excel data

Use the import endpoint to push your existing donor list:
```javascript
const donors = [
  { first_name: 'אבינועם', last_name: 'סימני', mobile: '+972503820022', email: 'law39961@gmail.com', monthly_standing_order: 150, payment_method: 'הו"ק', standing_order_active: true },
  // ... all 200 donors
];
await peachAPI.importDonors(donors);
```

---

## 🛡️ Security Notes
- Change default admin password immediately
- Set a strong `JWT_SECRET` (min 32 random chars)
- Use HTTPS in production
- Set `NODE_ENV=production` in deployment

---

## 📁 Project Structure
```
peach-crm/
├── server.js           ← Express app entry point
├── .env.example        ← Copy to .env and fill in
├── package.json
├── db/
│   ├── schema.sql      ← Full PostgreSQL schema
│   ├── index.js        ← DB connection pool
│   └── init.js         ← Run once: npm run db:init
├── middleware/
│   └── auth.js         ← JWT middleware
├── routes/
│   ├── auth.js         ← Login, users
│   ├── donors.js       ← CRUD + search + import
│   ├── payments.js     ← Transactions + receipts
│   ├── campaigns.js    ← Fundraising campaigns
│   ├── telemarketing.js← Call queue + logging
│   ├── tasks.js        ← Task management
│   └── mailing.js      ← SMS/email campaigns
└── public/
    ├── index.html      ← Frontend CRM
    └── api.js          ← API client library
```
