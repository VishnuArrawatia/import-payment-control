# 📘 Import Payment Control — Complete Step-by-Step User Guide

Welcome to the **Import Payment Control System** (Sakar Electricals & Group Companies). This comprehensive user guide provides a complete, visual walkthrough of every module, explaining how to operate the system with screenshots and real-world workflows.

---

## 🌐 Application Access & Credentials

* **Official Production URL**: [http://import.2.31.5.197.sslip.io](http://import.2.31.5.197.sslip.io)
* **System Architecture**: Multi-Company (Sakar / SVN), Dual-Currency (USD / CNY / INR), RBI IDPMS 180-Day Automated Knock-off, Real-time Forex Gain/Loss Engine.

---

## Step 1: Login & User Profile Selection

![Step 1: Sign In Gate](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step1_login.jpg)

### Kaise Login Karein:
1. Application URL open karne par modern split-screen **Sign In Screen** open hogi.
2. **Select User Profile**: Username type karne ki zaroorat nahi hai:
   * **Dropdown** se apna naam select karein, ya
   * Niche diye gaye **User Role Cards** (Admin, Management, Operations, Customs, Banking, Purchase) par 1-click karein.
3. **Password Enter Karein**: Profile select hote hi cursor password field me aa jata hai. Apna password enter karein (eye icon se password show/hide kar sakte hain).
4. **Sign In Button**: **"Sign In & Open Workspace →"** par click karein.

> [!TIP]
> Registered Profiles:
> * **Head Administrator** (`admin`): Full admin controls, company masters, data backup.
> * **Executive Management** (`management`): Executive dashboard, Net closing positions, FX reports.
> * **Import Operations Lead** (`executor1`): Commercial invoices, container demurrage.
> * **Customs & BOE Specialist** (`executor2`): Bill of entry, port clearance, ICEGATE knock-off.
> * **Bank Remittance Executive** (`executor3`): SWIFT remittances, foreign payments.
> * **Purchase Manager / Logistics** (`purchase1`, `purchase2`): Proforma invoices, PI advances.

---

## Step 2: Executive Dashboard & Party-Wise Closing Balances

![Step 2: Executive Dashboard](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step2_dashboard.jpg)

### Dashboard Overview:
Dashboard khulte hi company ki puri international import financial position samne dikhti hai:

1. **Top 4 Financial KPI Cards**:
   * **Total Payables (CR)**: Suppliers ko total kitna foreign currency aur book INR dena baaki hai.
   * **Advances / Excess (DR)**: Suppliers ke paas hamara kitna advance balance jama hai.
   * **Overdue Payables**: Kaunse bills due date cross kar chuke hain.
   * **Realized FX Gain / (Loss)**: FY me foreign exchange fluctuation se kitna profit/loss hua hai.
2. **Net Closing Position Strip (As-on Date)**:
   * **Net USD**: Overall US Dollar payable (+) ya advance (−).
   * **Net CNY**: Overall Chinese Yuan payable (+) ya advance (−).
   * **Net Book INR**: Net Indian Rupee liability.
3. **Party-Wise Closing Balances Table**:
   * Har supplier ka **Vendor Code** (jaise `V00044`), **Name**, **Dr FC**, **Cr FC**, **Net FC**, **Dr INR**, **Cr INR**, aur **Net Valuation INR** ek nazar me.
   * **Instant Search Filter**: Top right search bar me supplier ka naam ya code type karte hi table filter ho jati hai.
   * **Excel Export**: **"Export"** button par click karke party-wise report ko Excel me download kar sakte hain.
   * **Drill-down**: Kisi bhi party row par click karne se uske saare underlying Commercial Invoices, Payments, aur Advance vouchers ki detailed ledger khul jati hai.
4. **Ageing Analysis**:
   * Payables (Cr) aur Advances (Dr) ka `<30d`, `31-60d`, `61-90d`, aur `>90d` bucket breakdown table ke theek niche available hai.

---

## Step 3: Excel Copy-Paste & Batch Import (Excel Jaisi Feeling)

![Step 3: Excel Copy Paste Batch Importer](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step3_excel_paste.png)

### Excel se Direct Data Kaise Dalein:
Agar aapke paas Excel me data hai, to ek-ek entry manual type karne ki zaroorat nahi hai:

1. Top Navbar me **"Excel Paste & Edit"** button par click karein.
2. **Select Data Type**: Tab select karein:
   * Commercial Invoices (Purchase / CI)
   * Payments (Bank Remittances)
   * Opening Balances (Dr/Cr)
   * Item Master (HSN / Duty)
   * Proforma Invoices (PI)
   * Journal Vouchers (JV)
3. **Paste (Ctrl+V)**:
   * Excel me se rows copy karein aur box me ya table ke kisi bhi cell par direct **Ctrl+V** dabayein.
   * System apne aap rows aur columns ko split karke interactive grid me load kar dega.
4. **Smart Header Recognition**:
   * Agar aapki Excel me columns aage-peeche hain (jaise SVN opening balances me `Vendor Code | Vendor Name | Opening In INR | Opening In FC`), tab bhi system apne aap columns match kar leta hai.
   * **Negative Amount (-)** hone par automatic **Credit (Cr / Payable)** banata hai.
   * **Positive Amount (+)** hone par automatic **Debit (Dr / Advance)** banata hai.
5. **Keyboard Navigation**:
   * Kisi bhi cell me `Enter` dabane par cursor niche wale row par chala jata hai.
   * Aakhiri row me `Enter` dabane par **automatic nayi row add** ho jati hai.
   * `Arrow Up` / `Arrow Down` aur `Tab` keys Excel ki tarah kaam karti hain.
6. **Upload Excel File**:
   * **"Upload Excel File"** button se direct `.xlsx`, `.xls`, ya `.csv` file select karke load kar sakte hain.
   * **"Template (.xlsx)"** button se blank pre-formatted Excel template download kar sakte hain.
7. Click **"Save & Apply"** to save all rows directly into the database.

---

## Step 4: Commercial Invoices (CI) & Customs BOE Clearance

![Step 4: Commercial Invoices and Customs BOE](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step4_ci_customs.png)

### Commercial Invoice Enter Karne Ka Tareeqa:
1. Left sidebar se **"Commercial Invoices (CI)"** par click karein.
2. **"+ New Commercial Invoice"** par click karein:
   * **Company**: Sakar ya SVN select karein.
   * **Supplier**: Vendor code ya supplier name select karein.
   * **Invoice Details**: Invoice No (`ciNo`), Invoice Date, Currency (USD/CNY), Invoice Value FC.
   * **Bill of Entry (BOE)**: Customs BOE No, BOE Date, Port Code (e.g. `INNSA1` for Nhava Sheva, `INMUN1` for Mundra).
   * **Customs Exchange Rate**: Customs notification rate (e.g. `87.50`). System automatically **Purchase INR** calculate kar lega:
     $$\text{Purchase INR} = \text{Invoice Value FC} \times \text{BOE Rate}$$
   * **Linked PI**: Agar is consignment ka pehle se PI bana hua tha, to select karein taaki pehle se diya gaya advance automatically is bill ke against knock-off ho sake.
3. Save karne par invoice turant party balance aur customs radar me reflect ho jati hai.

---

## Step 5: Foreign Currency Payments & SWIFT Remittance

![Step 5: Foreign Payments and SWIFT Details](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step5_payment_swift.jpg)

### Bank Remittance Enter Karne Ka Tareeqa:
1. Left sidebar se **"Foreign Remittances"** (Payments) par click karein.
2. **"+ Record Foreign Remittance"** par click karein:
   * **Remittance Date**: Bank se jis din payment debit hui.
   * **Bank Account**: HDFC, DBS, ya ICICI account select karein.
   * **Supplier & Currency**: Supplier aur currency (USD / CNY) select karein.
   * **Remittance Amount (FC)**: Amount in USD / CNY.
   * **Bank TT / Exchange Rate**: Bank ne jo actual debit rate lagaya (e.g. `88.10`).
   * **Debit in INR**: System automatically calculate karta hai:
     $$\text{INR Amount} = \text{Amount FC} \times \text{Bank Rate}$$
   * **SWIFT No & UTR Ref**: Bank ka SWIFT MT103 copy number aur UTR number enter karein.
   * **Payment Against**: Select karein:
     * **Advance against PI**: Mal aane se pehle advance payment.
     * **Direct against Commercial Invoice**: Cargo customs clear hone ke baad invoice payment.
3. Click **"Save Payment Voucher"**. System automatic FIFO ya bill-to-bill knock-off perform karta hai.

---

## Step 6: Foreign Exchange (FX) Gain / Loss Engine

![Step 6: Realized and Unrealized FX Gain Loss](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step6_fx_gain_loss.png)

### FX Gain / Loss Kaise Kaam Karta Hai:
International trade me exchange rates constantly change hote hain. Yeh module complete bill-wise gain/loss calculate karta hai jise year-end audit aur P&L me match kiya ja sakta hai:

1. **Realized FX Gain / (Loss) Formula**:
   $$\text{FX Gain / (Loss)} = \text{Settled FC} \times (\text{BOE Invoice Rate} - \text{Bank Payment Rate})$$
   * **Gain (Profit)**: Agar bill booking ke time rate ₹88.00 tha, aur payment ke time rate ₹87.20 laga, to ₹0.80/FC ka **Exchange Gain** hua.
   * **Loss**: Agar payment ke time rate ₹88.50 laga, to ₹0.50/FC ka **Exchange Loss** hua.
2. **Unrealized Month-End Revaluation**:
   * Jo bills month-end par open reh gaye, unhe latest RBI / Month-end benchmark rate par revalue kiya jata hai, taaki Balance Sheet me true liability dikhe.
3. **Audit Trail & Export**:
   * Har bill ka BOE No, Invoice Date, Payment Date, Bank UTR, aur Gain/Loss amount row-by-row dikhta hai.
   * **"Export to Excel"** par click karke CA / Auditor ko audit working direct forward kar sakte hain.

---

## Step 7: Proforma Invoices (PI) & Purchase Requisitions

![Step 7: Proforma Invoices Tracking](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step7_pi_purchase.png)

### Purchase Desk Workflow:
1. Vendor se **Proforma Invoice (PI)** aane par use system me register karein:
   * Vendor Name, PI No, PI Date, Total PI Value FC, aur Advance % (e.g. 30% advance, 70% against BL).
2. **Pending Advance Radar**:
   * System calculate karta hai ki vendor ko kitna advance remittance bhejna baaki hai cargo dispatch karne se pehle.
3. Jab payment ki jati hai, to PI ke sath link karne par balance automatic deduct ho jata hai.

---

## Step 8: Container Demurrage & RBI IDPMS 180-Day Radar

![Step 8: Container Detention and IDPMS Radar](file:///C:/Users/SAKAR/.gemini/antigravity/brain/00dec5e7-6445-48ff-b8d7-672ffb3bf86b/step8_container_radar.png)

### Regulatory & Logistics Safety:
1. **Shipping Line Container Detention Radar**:
   * Port par container discharge hone ke baad shipping lines (Maersk, MSC, COSCO) aam taur par **14 days free time** deti hain.
   * 14 din ke baad **\$50 se \$150 per day per container** detention penalty lagti hai.
   * Radar me live counter dikhta hai ki container return karne me kitne din bache hain. Expiry warning aate hi transport team ko empty container return ka alert milta hai.
2. **RBI 180-Day IDPMS Radar**:
   * RBI Master Direction ke tehat, jab bhi foreign remittance bheja jata hai, to **180 dino ke andar Customs Bill of Entry (BOE)** ko bank me IDPMS portal par knock-off karana compulsory hai.
   * System har remittance ki 180-day deadline monitor karta hai. Agar koi remittance 150 din cross kar chuka hai aur BOE submit nahi hui, to dashboard par prominent alert show hota hai.

---

## 💡 Quick Tips for Daily Operations

> [!TIP]
> * **Data Save Ka Dhyan**: Jab bhi naya voucher create karein ya Excel paste karein, **"Save"** button dabane par database cloud me instant sync ho jata hai.
> * **Multi-Company Switch**: Top header me company dropdown (Sakar / SVN / All Companies) se aap instantly company-wise ya consolidated reporting dekh sakte hain.
> * **As-On Date Filter**: Header me calendar se kisi bhi purani date ka Net Closing balance dekh sakte hain (e.g. 31st March year-end position).

---

*Powered by VISHNU INTELLIGENCE SERVICE • Import Payment Control v3.0*
