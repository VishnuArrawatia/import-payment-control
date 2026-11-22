const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

function sha256Hex(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function encryptAndSignObject(obj) {
  const json = JSON.stringify(obj);
  const checksum = sha256Hex(`IPC_INTEGRITY_SALT:${json}`);
  const envelope = {
    _securityHeader: 'IPC_ENCRYPTED_STORE_V1',
    _integrityChecksum: checksum,
    _timestamp: new Date().toISOString(),
    _payload: Buffer.from(json, 'utf8').toString('base64'),
  };
  return JSON.stringify(envelope, null, 2);
}

function decryptAndVerifyString(rawString) {
  try {
    const parsed = JSON.parse(rawString);
    if (parsed && parsed._securityHeader === 'IPC_ENCRYPTED_STORE_V1' && parsed._payload) {
      const decodedJson = Buffer.from(parsed._payload, 'base64').toString('utf8');
      const expectedChecksum = sha256Hex(`IPC_INTEGRITY_SALT:${decodedJson}`);
      if (expectedChecksum !== parsed._integrityChecksum) {
        throw new Error('Integrity check failed');
      }
      return JSON.parse(decodedJson);
    }
    return parsed;
  } catch (err) {
    console.error('Decrypt error:', err.message);
    return null;
  }
}

const RAW_ITEMS = [
  { vendorCode: 'V00044', supplierName: 'BRIGHT UNIVERSE HK CO LTD', inr: 474805.94, fc: 5284.73, country: 'China' },
  { vendorCode: 'V00737', supplierName: 'FERRICS TECHNOLOGY CO.,LIMITED', inr: -470873.00, fc: -4996.00, country: 'China' },
  { vendorCode: 'V00738', supplierName: 'Foshan Sinoway Machinery Equipment Sales Company', inr: -21297.00, fc: -233.03, country: 'China' },
  { vendorCode: 'V01027', supplierName: 'Fujian GW Technology Co.,Ltd', inr: -1101978.38, fc: -11694.63, country: 'China' },
  { vendorCode: 'V00677', supplierName: 'HONG KONG EFAN ELECTRONICS LIMITED', inr: -2151698.57, fc: -25329.00, country: 'Hong Kong' },
  { vendorCode: 'V00850', supplierName: 'LITEONTECH LIMITED', inr: -547140.92, fc: -5915.04, country: 'China' },
  { vendorCode: 'V01060', supplierName: 'Power Chip Technologies (Suzhou) Co.,LTD', inr: -328556.00, fc: -3486.00, country: 'China' },
  { vendorCode: 'V00905', supplierName: 'San Yi New Material CO.,LTD', inr: -10945945.00, fc: -116137.00, country: 'China' },
  { vendorCode: 'V00928', supplierName: 'Shenzhen CYT Semiconductor Technology Co., Ltd.', inr: -378108.15, fc: 0.00, country: 'China' },
  { vendorCode: 'V00721', supplierName: 'Shenzhen Lanjin photoelectric Co.,Ltd', inr: 2467183.29, fc: 28900.36, country: 'China' },
  { vendorCode: 'V01118', supplierName: 'TECHNOLOGY PP INDUSTRIES (NORTHERN) SDN BHD', inr: -3763748.00, fc: -40125.25, country: 'Malaysia' },
  { vendorCode: 'V01017', supplierName: 'YIWU YULIANG ECOMMERCE FIRM', inr: -42761.64, fc: -490.13, country: 'China' },
  { vendorCode: 'V00996', supplierName: 'ZHONGSHAN BU LUO MU LIGHTING COMPANY', inr: 1843382.30, fc: 0.00, country: 'China' },
  { vendorCode: 'V01110', supplierName: 'Zhongshan Dashuo Import And Export Co., Ltd.', inr: 602723.44, fc: 0.00, country: 'China' },
  { vendorCode: 'V00992', supplierName: 'Zhongshan Liandi photoelectric Co.,Ltd', inr: 20014.40, fc: 221.27, country: 'China' },
];

function applyToDatabase(db) {
  const companyId = 'comp-svn';
  if (!db.suppliers) db.suppliers = [];
  if (!db.openingBalances) db.openingBalances = [];

  for (const item of RAW_ITEMS) {
    const isCredit = item.inr >= 0;
    const balanceType = isCredit ? 'Cr' : 'Dr';
    const amountINR = Math.abs(item.inr);
    const amountFC = Math.abs(item.fc);
    const rate = amountFC > 0 ? Number((amountINR / amountFC).toFixed(4)) : 0;

    // 1. Find or create supplier in comp-svn
    let supplier = db.suppliers.find(
      s => s.companyId === companyId && (
        s.vendorCode.toUpperCase() === item.vendorCode.toUpperCase() ||
        s.supplierName.trim().toLowerCase() === item.supplierName.trim().toLowerCase()
      )
    );

    if (!supplier) {
      supplier = {
        id: `supp-svn-${item.vendorCode.toLowerCase()}`,
        companyId,
        vendorCode: item.vendorCode,
        supplierName: item.supplierName,
        country: item.country,
        defaultCurrency: 'USD',
        active: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
      };
      db.suppliers.push(supplier);
      console.log(`[Created Supplier] ${item.vendorCode} - ${item.supplierName} in SVN`);
    } else {
      supplier.vendorCode = item.vendorCode;
      supplier.supplierName = item.supplierName;
      supplier.updatedAt = new Date().toISOString();
      console.log(`[Updated Supplier] ${supplier.id}: ${item.vendorCode} - ${item.supplierName}`);
    }

    // 2. Find or create opening balance in comp-svn for this supplier
    let ob = db.openingBalances.find(
      o => o.companyId === companyId && o.supplierId === supplier.id
    );

    if (!ob) {
      ob = {
        id: `ob-svn-${item.vendorCode.toLowerCase()}`,
        companyId,
        supplierId: supplier.id,
        currency: 'USD',
        referenceType: isCredit ? 'CI' : 'On account',
        referenceNo: `OB-2026-SVN-${item.vendorCode}`,
        referenceDate: '2026-04-01',
        originalDocumentDate: '2026-04-01',
        balanceType,
        amountFC,
        amountINR,
        rate,
        remarks: `Opening ${balanceType === 'Cr' ? 'Payable (Cr)' : 'Advance (Dr)'} as on 01-04-2026 for SVN Opto Electronics (${item.vendorCode} - ${item.supplierName})`,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
      };
      db.openingBalances.push(ob);
      console.log(`[Created Opening Balance] ${item.vendorCode} | ${balanceType} | FC: ${amountFC} | INR: ${amountINR}`);
    } else {
      ob.currency = 'USD';
      ob.referenceType = isCredit ? 'CI' : 'On account';
      ob.referenceNo = `OB-2026-SVN-${item.vendorCode}`;
      ob.referenceDate = '2026-04-01';
      ob.originalDocumentDate = '2026-04-01';
      ob.balanceType = balanceType;
      ob.amountFC = amountFC;
      ob.amountINR = amountINR;
      ob.rate = rate;
      ob.remarks = `Opening ${balanceType === 'Cr' ? 'Payable (Cr)' : 'Advance (Dr)'} as on 01-04-2026 for SVN Opto Electronics (${item.vendorCode} - ${item.supplierName})`;
      ob.updatedAt = new Date().toISOString();
      console.log(`[Updated Opening Balance] ${ob.id}: ${item.vendorCode} | ${balanceType} | FC: ${amountFC} | INR: ${amountINR}`);
    }
  }

  db.lastUpdated = new Date().toISOString();
  return db;
}

// 1. Update local initialSeed.json and data/ipc-database.json
const rootDir = path.resolve(__dirname, '..');
const seedPath = path.join(rootDir, 'src', 'data', 'initialSeed.json');
const dbPath = path.join(rootDir, 'data', 'ipc-database.json');

const seedDb = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const updatedSeed = applyToDatabase(seedDb);
fs.writeFileSync(seedPath, JSON.stringify(updatedSeed, null, 2), 'utf8');
console.log('Saved to src/data/initialSeed.json');

if (fs.existsSync(dbPath)) {
  const rawDb = fs.readFileSync(dbPath, 'utf8');
  const localDb = decryptAndVerifyString(rawDb) || JSON.parse(rawDb);
  const updatedDb = applyToDatabase(localDb);
  fs.writeFileSync(dbPath, encryptAndSignObject(updatedDb), 'utf8');
  console.log('Saved encrypted to data/ipc-database.json');
}

// 2. Push directly to live Coolify container via /api/db PUT
function syncLiveServer() {
  console.log('Logging in to live Coolify server...');
  const loginData = JSON.stringify({ username: 'admin', password: 'Admin@123456#' });

  const loginReq = http.request('http://import.2.31.5.197.sslip.io/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData),
    },
  }, (loginRes) => {
    const cookie = loginRes.headers['set-cookie'] ? loginRes.headers['set-cookie'][0].split(';')[0] : '';
    console.log('Acquired session cookie:', cookie ? 'YES' : 'NO');
    if (!cookie) {
      console.error('Failed to authenticate with live server');
      return;
    }

    // Now get the live database to preserve any other live modifications
    const getReq = http.request('http://import.2.31.5.197.sslip.io/api/db', {
      method: 'GET',
      headers: { Cookie: cookie },
    }, (getRes) => {
      let data = '';
      getRes.on('data', chunk => data += chunk);
      getRes.on('end', () => {
        const liveJson = JSON.parse(data);
        const liveDb = liveJson.data || updatedSeed;
        console.log('Applying opening balances to live database...');
        const newLiveDb = applyToDatabase(liveDb);

        const putBody = JSON.stringify({
          data: newLiveDb,
          note: 'Update 15 Opening Balances for SVN Opto Electronics (as requested by user)',
          actor: 'admin',
        });

        const putReq = http.request('http://import.2.31.5.197.sslip.io/api/db', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(putBody),
            Cookie: cookie,
          },
        }, (putRes) => {
          let putData = '';
          putRes.on('data', chunk => putData += chunk);
          putRes.on('end', () => {
            console.log('PUT /api/db Response Status:', putRes.statusCode);
            console.log('Response:', putData);
          });
        });
        putReq.write(putBody);
        putReq.end();
      });
    });
    getReq.end();
  });

  loginReq.write(loginData);
  loginReq.end();
}

syncLiveServer();
