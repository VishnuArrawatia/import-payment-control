# Import Payment Control (Web Application)
*Foreign Remittances, BOE Customs Clearance, RBI IDPMS Compliance & FX Valuations*

**Powered by VISHNU INTELLIGENCE SERVICE**

---

## 1. Overview
**Import Payment Control** is an enterprise-grade web application tailored for Indian importers managing high-volume international trade transactions (principally China / Hong Kong) across multiple group entities (e.g., Sakar Electricals & Electronics Pvt Ltd, SVN Opto Electronics Pvt Ltd).

The application enforces strict Indian import trade accounting, automated FIFO payment-to-CI allocation, Customs BOE FX valuation, bank realization tracking, and regulatory RBI IDPMS submission management.

---

## 2. Default User Accounts & RBAC

The application comes preconfigured with 5 authenticated roles. Passwords can be changed directly within the application by an Administrator.

| Role | Username | Default Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `Admin@123456#` | Full unrestricted access to all transactions, reports, user management, masters, settings, and database backup/restore. |
| **Management** | `management` | `Mgmt@123456#` | Full read access across all dashboards, drilldown analytics, audit trails, and reports. Transaction and settings modifications restricted. |
| **Executor 1** | `executor1` | `Exec1@123456#` | Operational data entry for PI, CI / Bill Booking, Advance & Balance Payments, Debit Notes, and BOE Submissions. Masters and Admin tools restricted. |
| **Executor 2** | `executor2` | `Exec2@123456#` | Operational data entry for PI, CI / Bill Booking, Advance & Balance Payments, Debit Notes, and BOE Submissions. Masters and Admin tools restricted. |
| **Executor 3** | `executor3` | `Exec3@123456#` | Operational data entry for PI, CI / Bill Booking, Advance & Balance Payments, Debit Notes, and BOE Submissions. Masters and Admin tools restricted. |

---

## 3. Core Accounting & Regulatory Rules

### A. Payment Booking
- Booked at the **actual bank rate** applied on the transaction advice.
- Formula: `INR of Payment = FC × Actual Rate` (with bank advice INR override support).
- Tracks bank charges & GST on remittances.

### B. Purchase / CI Booking
- Booked strictly at the **Customs BOE exchange rate**.
- Formula: `Purchase INR = CI FC Value × BOE Rate`.
- Mandatory BOE attributes: BOE No, BOE Date, Port Code, Assessable Value, Customs Duty.

### C. Realized Foreign Exchange Gain / Loss
- Calculated on every allocation of a payment to a CI:
  $$\text{Realized FX G/L} = \text{Allocated FC} \times (\text{BOE Rate} - \text{Payment Rate})$$
- Positive (+) = Exchange Gain | Negative (-) = Exchange Loss.

### D. Short Shipment, Debit Notes & Refunds
- Debit Notes cover excess advances lying with suppliers at the original payment rate (FIFO).
- Refund Received INR = `FC × Actual Bank Rate`.
- Realized G/L on Refund = `Refund INR - DN INR`.

### E. Acceptance Test Verification (Section 12 Compliant)
The core engine has been verified against the Section 12 test dataset:
- Total Purchases Booked: **₹8,46,600**
- Total Net Payments Remitted: **₹8,42,900**
- Realized FX Gain: **+₹3,400**
- Refund FX Gain: **+₹300**
- Net Realized Gain: **+₹3,700**
- Final Supplier Balance: **0.00 USD**

---

## 4. Anti-Reverse Engineering & Data Security

To safeguard proprietary trade data and prevent reverse engineering:
1. **Source Code Obfuscation & Mangling**:
   - Built with **Terser (3 passes)**: All variable names, function identifiers, and internal models are mangled to single-letter tokens.
   - `sourcemap: false`: Zero `.map` files generated or deployed. Original code hierarchy cannot be reconstructed via browser devtools.
   - `drop_console` & `drop_debugger`: All debugging, tracing, and logging statements are stripped at compile time.
2. **Hardened Nginx Headers**:
   - `X-Frame-Options: DENY` (prevents framing and clickjacking attacks).
   - `X-Content-Type-Options: nosniff` (mitigates MIME-type sniffing).
   - `Content-Security-Policy`: Restricts scripts and styles to trusted self-origins only.
   - Blocks direct requests to hidden files or `.map` paths.
3. **Data Security & Tamper Detection**:
   - Master and transaction records exported or persisted utilize cryptographic hashing (SHA-256) to ensure integrity and detect external tampering.

---

## 5. UI & Branding
- **Aesthetic**: Styled after **Google AI Studio** with an obsidian sidebar (`#0e1217`), slate canvas (`#f8fafc`), clean cards, modern typography (`Plus Jakarta Sans` and `JetBrains Mono`), and high keyboard accessibility for accountants.
- **Corner Attribution**: Positioned in exactly one place at the bottom-right corner:
  > **Powered by VISHNU INTELLIGENCE SERVICE**

---

## 6. Deployment to Coolify / Docker

### Option A: Coolify Deployment (Recommended)
1. In your Coolify dashboard, create a **New Resource** -> **Application**.
2. Select **Git Repository** (or **Docker Compose**).
3. Point to your repository containing this directory.
4. Coolify will auto-detect the `Dockerfile` and `docker-compose.yml`.
5. Set port mapping to `80` (HTTP).
6. Click **Deploy**. Coolify will build the hardened Alpine Nginx container and run it securely with auto-SSL.

### Option B: Local Docker Run
```bash
# Build the Docker image
docker build -t import-payment-control:latest .

# Run the container on port 80
docker run -d -p 80:80 --name import-payment-control import-payment-control:latest
```
Access at `http://localhost`.

### Option C: Local Development Server
```bash
# Install dependencies
npm install

# Run unit tests
npm run test

# Launch Vite development server
npm run dev
```

---

## 7. Project Structure
```
F:\Import Payment management\
├── Dockerfile              # Multi-stage production build (Node 22 -> Nginx Alpine)
├── nginx.conf              # Production hardened Nginx config with security headers
├── docker-compose.yml      # Coolify-compatible Docker Compose definition
├── vite.config.ts          # Vite configuration with Terser obfuscation & no sourcemaps
├── package.json            # Dependencies and build scripts
├── src/
│   ├── components/         # Modals, Navbar, Sidebar, UI Elements
│   ├── context/            # AuthContext (5 users, RBAC session handling)
│   ├── data/               # Seed data, default credentials, company & bank masters
│   ├── screens/            # PI, CI, Payment, DN, Refund, Submission, Reports, Dashboard
│   ├── types/              # Domain models, Trade definitions, Auth & Permissions
│   └── utils/              # FIFO Allocation Engine, Crypto Hashing, Excel Exporter
└── dist/                   # Production-ready obfuscated build
```

---

*Developed for Sakar Electricals & Electronics Pvt Ltd and SVN Opto Electronics Pvt Ltd.*
