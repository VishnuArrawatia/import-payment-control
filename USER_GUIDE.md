# 📘 Import Payment Control — Complete Step-by-Step User Guide (English Edition)

Welcome to the **Import Payment Control System** (Sakar Electricals & Group Imports). This operational manual provides an exhaustive, step-by-step visual walkthrough of all system modules, workflows, and regulatory compliance features.

---

## 🌐 Official Production Access

* **Application URL**: [http://import.2.31.5.197.sslip.io](http://import.2.31.5.197.sslip.io)
* **Core Capabilities**: Multi-Entity Treasury, Dual-Currency (USD / CNY / INR), RBI IDPMS 180-Day Automated Knock-off, Real-time Forex Fluctuation (FX Gain/Loss) Engine, and Shipping Line Container Demurrage Radar.

---

## Step 1: Authentication & Role-Based Access Control (RBAC)

![Step 1: Sign In Gate](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step1_login.jpg)

### How to Sign In:
1. Open the application URL in any modern web browser to view the split-screen authentication portal.
2. **Select User Profile**: Manual typing is not required. Either:
   * Select your designated account from the **User Profile Dropdown**, or
   * Click directly on your **Role Badge Card** (Admin, Management, Operations, Customs, Banking, or Purchase).
3. **Password Entry**: The password field automatically focuses upon profile selection. Enter your secure password and click **"Sign In & Open Workspace →"**.
4. **Predefined System Roles**:
   * **Head Administrator** (`admin`): Full administrative control, entity masters, and cloud backups.
   * **Executive Management** (`management`): Executive dashboards, Net Closing positions, and financial FX audits.
   * **Import Operations Lead** (`executor1`): Commercial invoice booking and container demurrage tracking.
   * **Customs & BOE Specialist** (`executor2`): Bill of Entry processing, port logistics, and ICEGATE clearance knock-offs.
   * **Bank Remittance Executive** (`executor3`): Outward foreign currency payments and SWIFT confirmation tracking.
   * **Purchase & Logistics Managers** (`purchase1`, `purchase2`): Proforma invoices, supplier purchase orders, and advance release approvals.

---

## Step 2: Executive Dashboard & Party-Wise Closing Balances

![Step 2: Executive Dashboard](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step2_dashboard.jpg)

### Executive Overview & Financial Position:
The dashboard provides a real-time, consolidated overview of your international trade liabilities:

1. **Top 4 Financial KPI Summary Cards**:
   * **Total Payables (CR)**: Outstanding foreign currency and book INR liabilities owed to overseas suppliers.
   * **Advances / Excess (DR)**: Advance payments held by overseas suppliers awaiting commercial invoice booking.
   * **Overdue Payables**: Commercial invoices that have passed their credit maturity period.
   * **Realized FX Gain / (Loss)**: Net cumulative profit or loss realized from foreign currency exchange fluctuations.
2. **Net Closing Position Bar (As-on Date)**:
   * **Net USD**: Consolidated net US Dollar payable (+) or advance held (−).
   * **Net CNY**: Consolidated net Chinese Yuan payable (+) or advance held (−).
   * **Net Book INR**: Net Indian Rupee statutory balance sheet liability.
3. **Party-Wise Closing Balances Table**:
   * Lists every supplier with **Vendor Code** (e.g. `V00044`), **Supplier Name**, **Dr FC (Advances)**, **Cr FC (Payables)**, **Net FC**, **Dr INR**, **Cr INR**, and **Net Valuation INR**.
   * **Instant Search Filter**: Type any vendor code or supplier name into the top-right search box to filter rows in real time.
   * **Excel Export**: Click **"Export"** to download the active party closing ledger directly into Microsoft Excel.
   * **Audit Drill-down**: Click on any supplier row to reveal a comprehensive transaction history of all underlying commercial invoices, payment vouchers, and advance knock-offs.
4. **Ageing Analysis**:
   * Displays Payables (Cr) and Advances (Dr) segmented across `<30d`, `31-60d`, `61-90d`, and `>90d` buckets immediately following the party table.

---

## Step 3: Excel Copy-Paste Batch Import (Fast Data Entry)

![Step 3: Excel Copy Paste Batch Importer](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step3_excel_paste.png)

### High-Speed Spreadsheet Batch Entry:
1. Click the **"Excel Paste & Edit"** button in the top navigation bar from any screen.
2. **Select Data Entity Tab**:
   * Commercial Invoices (CI)
   * Payments (Bank Remittances)
   * Opening Balances (Dr/Cr)
   * Item Master (HSN / Duty)
   * Proforma Invoices (PI)
   * Journal Vouchers (JV)
3. **Direct Cell-Level Paste**:
   * Copy data from your Excel spreadsheet and press **Ctrl+V** inside any cell in the interactive grid. Multi-row and multi-column data automatically arranges into respective cells.
   * **Automatic Row Expansion**: If the copied data contains more rows than currently shown, the grid automatically generates the necessary rows.
4. **Smart Header & Column Synonym Recognition**:
   * The parser automatically matches headers even if columns are re-ordered (e.g., Vendor Code, Invoice Date, Invoice No, Value FC, Exchange Rate, BOE No, SWIFT).
5. **SVN Opening Balance Handling**:
   * When pasting sheets formatted as `Vendor Code | Vendor Name | Opening In INR | Opening In FC`:
   * **Negative amounts (-)** are automatically recognized as **Credit (Cr / Payable)** and stored as positive figures.
   * **Positive amounts (+)** are automatically recognized as **Debit (Dr / Advance)**.
6. **Excel-Style Keyboard Navigation**:
   * Press **Enter** to move to the cell directly below. Pressing Enter on the last row automatically appends a new row. Use **Arrow Up / Arrow Down** keys to navigate vertically.
7. **Direct File Upload & Template Download**:
   * Click **"Upload Excel File"** to import `.xlsx`, `.xls`, or `.csv` files directly.
   * Click **"Template (.xlsx)"** to download pre-formatted workbooks containing sample rows.
8. Click **"Save & Apply"** to write all validated records to the database with a single click.

---

## Step 4: Commercial Invoices (CI) & Customs BOE Clearance

![Step 4: Commercial Invoices and Customs BOE](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step4_ci_customs.png)

### Recording Commercial Invoices & Port Clearance:
1. Navigate to **"Commercial Invoices (CI)"** from the left navigation drawer.
2. Click **"+ New Commercial Invoice"**:
   * **Company Entity**: Sakar or SVN.
   * **Supplier**: Vendor code or supplier name.
   * **Invoice Details**: Invoice Number (`ciNo`), Invoice Date, Currency (USD/CNY), and Invoice Value (FC).
   * **Customs Details**: Customs Bill of Entry (BOE) Number, BOE Date, Port Code (e.g., `INNSA1` for Nhava Sheva, `INMUN1` for Mundra), and BOE Customs Exchange Rate.
   * **Purchase INR Calculation**: The system automatically computes:
     $$\text{Purchase INR} = \text{Invoice Value FC} \times \text{BOE Rate}$$
   * **Linked Proforma Invoice (PI)**: Link open PIs to automatically knock off previously remitted advances against this cargo.
3. Save the invoice to update supplier ledgers, customs compliance records, and IDPMS knock-off tracking.

---

## Step 5: Foreign Currency Payments & SWIFT Tracking

![Step 5: Foreign Payments and SWIFT Details](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step5_payment_swift.jpg)

### Recording Bank Remittances & SWIFT Advices:
1. Navigate to **"Foreign Remittances"** from the left navigation drawer.
2. Click **"+ Record Foreign Remittance"**:
   * **Remittance Date**: Actual date of bank debit.
   * **Bank Account**: Disbursing bank (e.g. HDFC Bank, DBS Bank, ICICI Bank).
   * **Supplier & Currency**: Supplier account and currency (USD / CNY).
   * **Amount (FC) & Bank TT Exchange Rate**: Exact foreign currency remitted and bank debit exchange rate. The system computes:
     $$\text{INR Amount} = \text{Amount FC} \times \text{Bank Exchange Rate}$$
   * **SWIFT Confirmation**: Enter the SWIFT MT103 advice number and Bank UTR reference for audit tracking.
   * **Payment Allocation**:
     * *Advance against PI*: Advance remittance prior to supplier dispatch.
     * *Direct against Commercial Invoice*: Settlement of customs-cleared invoices.
3. Click **"Save Payment Voucher"** to execute automated FIFO or bill-specific allocation against open payables.

---

## Step 6: Realized & Unrealized FX Gain / Loss Engine

![Step 6: Realized and Unrealized FX Gain Loss](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step6_fx_gain_loss.png)

### Foreign Exchange Fluctuation Accounting:
This module automatically calculates transaction-level forex variance for year-end statutory audits and P&L matching:

1. **Realized Foreign Exchange Gain / (Loss) Formula**:
   $$\text{FX Gain / (Loss)} = \text{Settled FC} \times (\text{BOE Invoice Rate} - \text{Bank Payment Rate})$$
   * **Exchange Gain (Profit)**: If an invoice was booked at ₹88.00 and the bank remittance was debited at ₹87.20, an exchange gain of ₹0.80 per FC is booked.
   * **Exchange Loss**: If the remittance was executed at ₹88.50, an exchange loss of ₹0.50 per FC is booked.
2. **Month-End Unrealized Forex Revaluation**:
   * Open liabilities and unapplied advances are revalued against the latest month-end benchmark exchange rate to reflect accurate Balance Sheet values.
3. **Auditor Working & Export**:
   * Displays BOE Numbers, Invoice Dates, Remittance Dates, Bank UTR Numbers, and realized profit/loss row-by-row.
   * Click **"Export to Excel"** to provide your Chartered Accountant or Statutory Auditor with complete working schedules.

---

## Step 7: Proforma Invoices (PI) & Purchase Orders

![Step 7: Proforma Invoices Tracking](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step7_pi_purchase.png)

### Procurement & Order Tracking:
1. Upon receiving an order confirmation or PI from an overseas supplier, record it under the **"Proforma Invoices (PI)"** desk.
2. Record PI Number, PI Date, Currency, Total Value (FC), and agreed Payment Terms (e.g., 30% Advance, 70% against B/L).
3. **Pending Advance Radar**: The system monitors open PIs and flags mandatory advance transfers required before suppliers dispatch cargo.
4. When foreign remittance vouchers are linked to the PI, the advance balance is automatically adjusted.

---

## Step 8: Container Demurrage & RBI IDPMS 180-Day Radar

![Step 8: Container Detention and IDPMS Radar](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step8_container_radar.png)

### Regulatory & Port Safety:
1. **Shipping Line Container Detention Radar**:
   * Ocean shipping lines (e.g., Maersk, MSC, COSCO) provide a standard **14-day free period** following container discharge.
   * Detention penalties ranging from **\$50 to \$150 per container per day** apply thereafter.
   * The radar monitors remaining free days in real time, alerting logistics coordinators to return empty containers before incurring detention charges.
2. **RBI 180-Day IDPMS Compliance Radar**:
   * Under Reserve Bank of India (RBI) Master Directions, every outward advance remittance must be matched against a Customs Bill of Entry (BOE) on the bank IDPMS portal within 180 days.
   * The system monitors all advance remittances against this 180-day deadline, generating early warnings at 150 days to maintain complete statutory compliance.

---

## 💡 Key Operational Practices

> [!TIP]
> * **Data Persistence**: Click **"Save Data"** in the top navigation bar at the end of every work session to trigger an immediate cloud database snapshot.
> * **Multi-Company Filtering**: Use the top-left company selector to switch seamlessly between Sakar, SVN, or Consolidated group-level reporting.
> * **Historical As-On Date Audits**: Select any past date from the header calendar to reconstruct historical balance sheets and audit positions (e.g., March 31st financial year-end).

---

*Powered by VISHNU INTELLIGENCE SERVICE • Import Payment Control v3.0*
