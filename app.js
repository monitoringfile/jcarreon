// --- FIREBASE INITIALIZATION CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDrtq4NumiPhCmyFz-5KE7MD92YLQd2WcU",
  authDomain: "jcarreon-a1c05.firebaseapp.com",
  projectId: "jcarreon-a1c05",
  storageBucket: "jcarreon-a1c05.firebasestorage.app",
  messagingSenderId: "865998950924",
  appId: "1:865998950924:web:36443d437381b85d16d429",
  measurementId: "G-YK8V6X7ZE6"
};

firebase.initializeApp(firebaseConfig);
const dbFirestore = firebase.firestore();
const auth = firebase.auth();

// --- FIREBASE AUTHENTICATION GATEWAY ---
let pendingAction = null;
let pendingParams = null;

function requestAuthForAction(actionType, params = null) {
  const currentUser = auth.currentUser;
  if (currentUser) {
    executeAuthorizedAction(actionType, params);
  } else {
    pendingAction = actionType;
    pendingParams = params;
    document.getElementById('authEmailInput').value = '';
    document.getElementById('authPasswordInput').value = '';
    document.getElementById('authErrorMsg').classList.add('hidden');
    document.getElementById('authModal').classList.remove('hidden');
    document.getElementById('authEmailInput').focus();
  }
}

function closeAuthModal() {
  document.getElementById('authModal').classList.add('hidden');
  pendingAction = null;
  pendingParams = null;
}

async function verifyFirebaseLogin() {
  const email = document.getElementById('authEmailInput').value.trim();
  const password = document.getElementById('authPasswordInput').value;
  const errorEl = document.getElementById('authErrorMsg');

  if (!email || !password) {
    errorEl.textContent = "Please enter email and password.";
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    document.getElementById('authModal').classList.add('hidden');
    showToast(`Authenticated as ${email}`);
    if (pendingAction) {
      executeAuthorizedAction(pendingAction, pendingParams);
      pendingAction = null;
      pendingParams = null;
    }
  } catch (err) {
    errorEl.textContent = err.message || "Authentication failed.";
    errorEl.classList.remove('hidden');
  }
}

function executeAuthorizedAction(actionType, params) {
  if (actionType === 'UPLOAD_PORTFOLIO') {
    document.getElementById('portfolioFileInput').click();
  } else if (actionType === 'UPLOAD_PAR') {
    document.getElementById('parFileInput').click();
  } else if (actionType === 'MANAGE_FILES') {
    openFilesModal();
  } else if (actionType === 'CLEAR_ALL') {
    clearAllDataConfirmed();
  } else if (actionType === 'DELETE_FILE') {
    deleteFileConfirmed(params.fileName, params.storeName);
  }
}

async function handleSignOut() {
  try {
    await auth.signOut();
    showToast("Logged out successfully.");
  } catch (err) {
    console.error("Sign out error:", err);
  }
}

auth.onAuthStateChanged((user) => {
  const badge = document.getElementById('authStatusBadge');
  const emailLbl = document.getElementById('authEmailLabel');
  if (user) {
    badge.classList.remove('hidden');
    badge.classList.add('flex');
    emailLbl.textContent = user.email;
  } else {
    badge.classList.remove('flex');
    badge.classList.add('hidden');
  }
});

document.getElementById('authPasswordInput').addEventListener('keyup', (e) => {
  if (e.key === 'Enter') verifyFirebaseLogin();
});

// --- CLOUD FIRESTORE STORAGE HELPERS ---
const STORE_PORTFOLIO = 'portfolioFilesStore';
const STORE_PAR = 'parFilesStore';

function getSafeDocId(fileName) {
  return String(fileName).replace(/[\/]/g, '_');
}

async function saveFileToStore(storeName, fileName, reportDate, rows) {
  try {
    const docId = getSafeDocId(fileName);
    await dbFirestore.collection(storeName).doc(docId).set({
      fileName: fileName,
      reportDate: reportDate,
      rows: rows,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error("Error saving file to Firestore:", err);
    showToast("Error: Permission denied or network issue.", true);
  }
}

async function deleteFileFromStore(storeName, fileName) {
  try {
    const docId = getSafeDocId(fileName);
    await dbFirestore.collection(storeName).doc(docId).delete();
  } catch (err) {
    console.error("Error deleting file from Firestore:", err);
    showToast("Error: Permission denied or network issue.", true);
  }
}

async function clearDB() {
  try {
    const pSnap = await dbFirestore.collection(STORE_PORTFOLIO).get();
    const parSnap = await dbFirestore.collection(STORE_PAR).get();
    const batch = dbFirestore.batch();
    pSnap.docs.forEach(doc => batch.delete(doc.ref));
    parSnap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  } catch (err) {
    console.error("Error clearing Firestore data:", err);
    showToast("Error: Permission denied or network issue.", true);
  }
}

// App State
let portfolioFiles = [];
let parFiles = [];
let activeTab = 'portfolio';
let chartMetric = 'portfolio';
let chartInstance = null;

// --- ACCURATE DATE PARSING & SORTING ---
const MONTH_MAP = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11
};

function parseDateToTimestamp(dateStr) {
  if (!dateStr) return 0;
  let str = String(dateStr).trim();

  if (!isNaN(str) && Number(str) > 30000) {
    const jsDate = new Date((Number(str) - (25567 + 2)) * 86400 * 1000);
    return jsDate.getTime();
  }

  let parsed = Date.parse(str);
  if (!isNaN(parsed)) return parsed;

  const cleanedStr = str.replace(/[,/._-]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = cleanedStr.split(' ');

  let day = null, month = null, year = null;

  parts.forEach(p => {
    const lower = p.toLowerCase();
    if (MONTH_MAP[lower] !== undefined) {
      month = MONTH_MAP[lower];
    } else if (/^\d{4}$/.test(p)) {
      year = parseInt(p, 10);
    } else if (/^\d{1,2}$/.test(p)) {
      const val = parseInt(p, 10);
      if (val <= 31 && day === null) day = val;
    }
  });

  if (year !== null && month !== null) {
    return new Date(year, month, day || 1).getTime();
  }

  return 0;
}

function sortFilesByChronologicalDate(filesArray) {
  return filesArray.sort((a, b) => {
    const t1 = parseDateToTimestamp(a.reportDate);
    const t2 = parseDateToTimestamp(b.reportDate);
    if (t1 !== t2) return t1 - t2;
    return a.reportDate.localeCompare(b.reportDate);
  });
}

function getSortedUniqueDates() {
  const dateMap = new Map();
  [...portfolioFiles, ...parFiles].forEach(f => {
    const ts = parseDateToTimestamp(f.reportDate);
    if (!dateMap.has(f.reportDate)) {
      dateMap.set(f.reportDate, ts);
    }
  });

  return Array.from(dateMap.keys()).sort((a, b) => {
    const t1 = dateMap.get(a);
    const t2 = dateMap.get(b);
    if (t1 !== t2) return t1 - t2;
    return a.localeCompare(b);
  });
}

// --- NUMERIC & STRING CLEANING HELPERS (PESO SIGN REMOVED) ---
function parseNumericValue(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  
  let str = String(val).trim().replace(/,/g, '').replace(/₱/g, '').replace(/\$/g, '');
  if (str.startsWith('(') && str.endsWith(')')) {
    str = '-' + str.slice(1, -1);
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function formatNumber(num, decimals = 2) {
  if (num === 0 || isNaN(num) || num === null) {
    return decimals === 0 ? '0' : '0.00';
  }
  return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPercent(num) {
  if (num === 0 || isNaN(num) || num === null) return '0.00%';
  return num.toFixed(2) + '%';
}

function cleanBranchName(rawName) {
  if (!rawName) return 'Unknown Branch';
  let name = String(rawName).trim();
  if (name.includes(' - ')) {
    name = name.split(' - ')[0].trim();
  }
  return name;
}

function extractOfficerName(row) {
  return String(
    row['Credit officer'] || row['Credit Officer'] || row['credit officer'] || 
    row['Name'] || row['name'] || row['NAME'] || 
    'Unknown Officer'
  ).trim();
}

function extractPortfolioFields(row) {
  let olbVal = 0;
  
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase().trim();
    if (k === 'total olb (p)' || k === 'olb (p)' || k === 'olb') {
      olbVal = parseNumericValue(row[key]);
      break;
    }
  }

  if (olbVal === 0) {
    for (const key of Object.keys(row)) {
      const k = key.toLowerCase();
      if ((k.includes('olb') || k.includes('principal outs')) && !k.includes('p+i') && !k.includes('interest')) {
        olbVal = parseNumericValue(row[key]);
        if (olbVal !== 0) break;
      }
    }
  }

  let accVal = 0;
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase();
    if (k.includes('accounts') || k.includes('account')) {
      accVal = parseInt(parseNumericValue(row[key]), 10);
      if (accVal !== 0) break;
    }
  }

  let cliVal = 0;
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase();
    if (k.includes('clients') || k.includes('client') || k.includes('borrower')) {
      cliVal = parseInt(parseNumericValue(row[key]), 10);
      if (cliVal !== 0) break;
    }
  }

  return { olb: olbVal, accounts: accVal, clients: cliVal };
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const toastIcon = document.getElementById('toastIcon');
  
  toastMsg.textContent = msg;
  toastIcon.className = isError ? 'fa-solid fa-circle-exclamation text-rose-600 text-sm' : 'fa-solid fa-circle-info text-[#00585A] text-sm';
  toast.className = `light-card p-4 border-l-4 ${isError ? 'border-rose-600' : 'border-[#00585A]'} shadow text-xs text-slate-900 font-bold flex justify-between items-center transition-all`;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}

function openFilesModal() {
  updateFilesModalContent();
  document.getElementById('filesModal').classList.remove('hidden');
}

function closeFilesModal() {
  document.getElementById('filesModal').classList.add('hidden');
}

// --- INITIALIZE LISTENERS ---
window.addEventListener('DOMContentLoaded', () => {
  dbFirestore.collection(STORE_PORTFOLIO).onSnapshot((snapshot) => {
    portfolioFiles = snapshot.docs.map(doc => doc.data());
    sortFilesByChronologicalDate(portfolioFiles);
    updateBranchFilterDropdown();
    renderDashboard();
  }, (err) => {
    console.error("Error listening to portfolio updates:", err);
  });

  dbFirestore.collection(STORE_PAR).onSnapshot((snapshot) => {
    parFiles = snapshot.docs.map(doc => doc.data());
    sortFilesByChronologicalDate(parFiles);
    updateBranchFilterDropdown();
    renderDashboard();
  }, (err) => {
    console.error("Error listening to PAR updates:", err);
  });

  document.getElementById('portfolioFileInput').addEventListener('change', (e) => handleFileSelect(e, STORE_PORTFOLIO));
  document.getElementById('parFileInput').addEventListener('change', (e) => handleFileSelect(e, STORE_PAR));
  document.getElementById('branchFilter').addEventListener('change', renderDashboard);

  document.getElementById('calcBaseDate').addEventListener('change', runCalculator);
  document.getElementById('calcTargetDate').addEventListener('change', runCalculator);
});

function clearAllDataConfirmed() {
  clearDB().then(() => {
    portfolioFiles = [];
    parFiles = [];
    updateBranchFilterDropdown();
    renderDashboard();
    showToast('All saved cloud data cleared successfully.');
  });
}

function updateBranchFilterDropdown() {
  const branchFilter = document.getElementById('branchFilter');
  const currentSelected = branchFilter.value;

  const branchSet = new Set();
  [...portfolioFiles, ...parFiles].forEach(f => {
    f.rows.forEach(row => {
      const raw = row['Branch'] || row['branch'] || row['BRANCH'] || '';
      if (raw) branchSet.add(cleanBranchName(raw));
    });
  });

  const branches = Array.from(branchSet).sort();

  let html = `<option value="ALL" class="bg-[#00585A] text-white font-bold">All Area Branches</option>`;
  branches.forEach(b => {
    html += `<option value="${b}" class="bg-[#00585A] text-white font-bold">${b}</option>`;
  });

  branchFilter.innerHTML = html;
  
  if (branches.includes(currentSelected)) {
    branchFilter.value = currentSelected;
  } else {
    branchFilter.value = 'ALL';
  }
}

function parseExcelFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        let sheetName = workbook.SheetNames[0];
        const arrearsSheet = workbook.SheetNames.find(s => s.toLowerCase().includes('arrears') || s.toLowerCase().includes('par'));
        if (arrearsSheet) sheetName = arrearsSheet;

        const worksheet = workbook.Sheets[sheetName];
        const rawMatrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        let extractedDate = file.name.replace(/\.[^/.]+$/, "");
        if (rawMatrix.length > 0 && rawMatrix[0].length >= 2) {
          const cellVal = String(rawMatrix[0][1]).trim();
          if (cellVal && cellVal !== 'undefined') {
            extractedDate = cellVal;
          }
        }

        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(rawMatrix.length, 25); i++) {
          const rowStr = rawMatrix[i].map(v => String(v).toLowerCase()).join(' ');
          if ((rowStr.includes('name') || rowStr.includes('officer')) && rowStr.includes('branch')) {
            headerRowIndex = i;
            break;
          }
        }

        const rows = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex, defval: '' });
        resolve({ reportDate: extractedDate, rows: cleanParsedRows(rows) });
      } catch (err) {
        console.error('Error parsing file:', err);
        resolve({ reportDate: file.name, rows: [] });
      }
    };
    reader.onerror = () => resolve({ reportDate: file.name, rows: [] });
    reader.readAsArrayBuffer(file);
  });
}

function cleanParsedRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(r => {
    const nameVal = String(r['Name'] || r['Credit officer'] || r['Credit Officer'] || r['Branch'] || '').trim().toLowerCase();
    
    if (!nameVal) return false;
    if (nameVal === 'total' || nameVal.includes('subtotal') || nameVal.includes('grand total') || nameVal.includes('area total')) {
      return false;
    }
    return true;
  });
}

async function handleFileSelect(e, storeName) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const existingFiles = storeName === STORE_PORTFOLIO ? portfolioFiles : parFiles;
  const existingFileNames = new Set(existingFiles.map(f => f.fileName));

  let count = 0;
  let duplicates = [];

  for (const file of files) {
    if (existingFileNames.has(file.name)) {
      duplicates.push(file.name);
      continue;
    }

    const parsed = await parseExcelFile(file);
    if (parsed.rows && parsed.rows.length) {
      await saveFileToStore(storeName, file.name, parsed.reportDate, parsed.rows);
      existingFileNames.add(file.name);
      count++;
    }
  }

  const labelType = storeName === STORE_PORTFOLIO ? 'Portfolio' : 'PAR';
  if (count > 0) {
    showToast(`Uploaded and synced ${count} ${labelType} file(s) to Firestore.`);
  }
  if (duplicates.length > 0) {
    showToast(`Duplicate file(s) skipped: ${duplicates.join(', ')}`, true);
  }
  e.target.value = '';
}

function deleteFileConfirmed(fileName, storeName) {
  deleteFileFromStore(storeName, fileName).then(() => {
    updateFilesModalContent();
    showToast(`Removed file "${fileName}" from cloud.`);
  });
}

function computeMasterMatrixData() {
  const selectedBranch = document.getElementById('branchFilter').value;
  const isFiltered = selectedBranch !== 'ALL';

  const rowKeySet = new Set();
  [...portfolioFiles, ...parFiles].forEach(fileObj => {
    fileObj.rows.forEach(row => {
      const rawBranch = row['Branch'] || row['branch'] || row['BRANCH'] || '';
      const branchName = cleanBranchName(rawBranch);

      if (!isFiltered) {
        if (branchName) rowKeySet.add(branchName);
      } else {
        if (branchName === selectedBranch) {
          const officer = extractOfficerName(row);
          if (officer && officer.toLowerCase() !== 'total') rowKeySet.add(officer);
        }
      }
    });
  });

  const globalRowKeys = Array.from(rowKeySet).sort();
  const sortedDates = getSortedUniqueDates();

  const portfolioData = {}, parData = {}, ratioData = {}, accountsData = {}, clientsData = {};
  const portfolioTotals = {}, parTotals = {}, ratioTotals = {}, accountsTotals = {}, clientsTotals = {};

  globalRowKeys.forEach(k => {
    portfolioData[k] = {};
    parData[k] = {};
    ratioData[k] = {};
    accountsData[k] = {};
    clientsData[k] = {};

    sortedDates.forEach(d => {
      portfolioData[k][d] = 0;
      parData[k][d] = 0;
      ratioData[k][d] = 0;
      accountsData[k][d] = 0;
      clientsData[k][d] = 0;
    });
  });

  sortedDates.forEach(d => {
    portfolioTotals[d] = 0;
    parTotals[d] = 0;
    ratioTotals[d] = 0;
    accountsTotals[d] = 0;
    clientsTotals[d] = 0;
  });

  portfolioFiles.forEach(f => {
    const d = f.reportDate;
    f.rows.forEach(row => {
      const rawBranch = row['Branch'] || row['branch'] || row['BRANCH'] || '';
      const branchName = cleanBranchName(rawBranch);
      if (isFiltered && branchName !== selectedBranch) return;

      const key = !isFiltered ? branchName : extractOfficerName(row);
      if (!key || key.toLowerCase() === 'total' || !portfolioData[key]) return;

      const extracted = extractPortfolioFields(row);
      portfolioData[key][d] += extracted.olb;
      portfolioTotals[d] += extracted.olb;

      accountsData[key][d] += extracted.accounts;
      accountsTotals[d] += extracted.accounts;

      clientsData[key][d] += extracted.clients;
      clientsTotals[d] += extracted.clients;
    });
  });

  parFiles.forEach(f => {
    const d = f.reportDate;
    f.rows.forEach(row => {
      const rawBranch = row['Branch'] || row['branch'] || row['BRANCH'] || '';
      const branchName = cleanBranchName(rawBranch);
      if (isFiltered && branchName !== selectedBranch) return;

      const key = !isFiltered ? branchName : extractOfficerName(row);
      if (!key || key.toLowerCase() === 'total' || !parData[key]) return;

      const extracted = extractPortfolioFields(row);
      parData[key][d] += extracted.olb;
      parTotals[d] += extracted.olb;
    });
  });

  globalRowKeys.forEach(k => {
    sortedDates.forEach(d => {
      const port = portfolioData[k][d] || 0;
      const par = parData[k][d] || 0;
      ratioData[k][d] = port > 0 ? (par / port) * 100 : 0;
    });
  });

  sortedDates.forEach(d => {
    const totPort = portfolioTotals[d] || 0;
    const totPar = parTotals[d] || 0;
    ratioTotals[d] = totPort > 0 ? (totPar / totPort) * 100 : 0;
  });

  return {
    rowKeys: globalRowKeys,
    sortedDates,
    portfolio: { data: portfolioData, totals: portfolioTotals },
    par: { data: parData, totals: parTotals },
    ratio: { data: ratioData, totals: ratioTotals },
    accounts: { data: accountsData, totals: accountsTotals },
    clients: { data: clientsData, totals: clientsTotals },
  };
}

function renderDashboard() {
  updateTotalFileBadgeCount();
  updateCalculatorDropdowns();

  if (portfolioFiles.length === 0 && parFiles.length === 0) {
    renderEmptyState();
    return;
  }

  const matrix = computeMasterMatrixData();
  renderUnifiedMatrixTab(matrix);
  runCalculator();
  renderTrendChart(matrix);
}

function switchTab(tabKey) {
  activeTab = tabKey;
  
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('bg-[#00585A]', 'text-white', 'shadow');
    btn.classList.add('text-slate-700');
  });

  const activeBtn = document.getElementById(`tabBtn-${tabKey}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-[#00585A]', 'text-white', 'shadow');
    activeBtn.classList.remove('text-slate-700');
  }

  const descriptions = {
    portfolio: 'Active Loan Portfolio Summary (Total Outstanding Principal Balance)',
    par: 'Portfolio At Risk (PAR Amount - Overdue Principal Balance)',
    ratio: 'PAR Ratio Percentage Matrix ((PAR Amount ÷ Active Portfolio) × 100)',
    accounts: 'Total Active Loan Accounts Captured across Period Reports',
    clients: 'Total Unique Active Borrowers & Clients Matrix'
  };

  document.getElementById('activeTabDescription').textContent = descriptions[tabKey] || 'Viewing performance matrix';

  if (portfolioFiles.length > 0 || parFiles.length > 0) {
    const matrix = computeMasterMatrixData();
    renderUnifiedMatrixTab(matrix);
  }
}

// MATRIX FIGURE RENDERING (PESO SIGN REMOVED)
function renderUnifiedMatrixTab(matrix) {
  const selectedBranch = document.getElementById('branchFilter').value;
  const firstColTitle = selectedBranch !== 'ALL' ? 'Credit Officer' : 'Branch';
  
  const thRow = document.getElementById('unifiedThRow');
  const tbody = document.getElementById('unifiedTbody');
  const tfoot = document.getElementById('unifiedTfoot');

  let thHTML = `<th class="py-3 px-4 w-48 sticky left-0 bg-[#00585A] z-10 border-r-2 border-[#004D4E] text-white font-black truncate">${firstColTitle}</th>`;
  matrix.sortedDates.forEach(d => {
    thHTML += `<th class="py-3 px-4 text-right min-w-[140px] font-mono text-xs text-white font-extrabold border-b-2 border-[#004D4E]">${d}</th>`;
  });
  thRow.innerHTML = thHTML;

  if (!matrix.sortedDates.length || !matrix.rowKeys.length) {
    tbody.innerHTML = `<tr><td colspan="2" class="py-12 text-center text-slate-500 font-sans font-bold">No data available for this view.</td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  const currentDataset = matrix[activeTab];
  const isPercent = activeTab === 'ratio';
  const isInteger = activeTab === 'accounts' || activeTab === 'clients';

  let tbodyHTML = '';
  matrix.rowKeys.forEach(k => {
    tbodyHTML += `<tr class="hover:bg-teal-50 transition-colors border-b border-slate-200">`;
    tbodyHTML += `<td class="py-3 px-4 w-48 font-sans font-black text-slate-900 sticky left-0 bg-white border-r-2 border-slate-300 truncate" title="${k}">${k}</td>`;

    matrix.sortedDates.forEach(d => {
      const val = currentDataset.data[k][d] || 0;
      let displayVal = '0.00';
      let displayClass = val > 0 ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium';

      if (isPercent) {
        displayVal = formatPercent(val);
        if (val > 5) displayClass = 'text-rose-700 font-black bg-rose-50 px-2 py-0.5 rounded-md';
        else if (val > 0) displayClass = 'text-amber-800 font-black bg-amber-50 px-2 py-0.5 rounded-md';
      } else if (isInteger) {
        displayVal = formatNumber(val, 0);
      } else {
        displayVal = formatNumber(val, 2); // PESO SIGN REMOVED
      }

      tbodyHTML += `<td class="py-3 px-4 text-right ${displayClass}">${displayVal}</td>`;
    });
    tbodyHTML += `</tr>`;
  });
  tbody.innerHTML = tbodyHTML;

  let tfootHTML = `<tr class="bg-slate-100 border-t-2 border-slate-400">`;
  tfootHTML += `<td class="py-3.5 px-4 w-48 font-sans font-black text-slate-900 sticky left-0 bg-slate-100 border-r-2 border-slate-300">TOTAL</td>`;
  matrix.sortedDates.forEach(d => {
    const totalVal = currentDataset.totals[d] || 0;
    let displayVal = '0.00';

    if (isPercent) {
      displayVal = formatPercent(totalVal);
    } else if (isInteger) {
      displayVal = formatNumber(totalVal, 0);
    } else {
      displayVal = formatNumber(totalVal, 2); // PESO SIGN REMOVED
    }

    const colorClass = isPercent ? (totalVal > 5 ? 'text-rose-700' : 'text-amber-800') : 'text-[#00585A]';
    tfootHTML += `<td class="py-3.5 px-4 text-right ${colorClass} font-black text-xs">${displayVal}</td>`;
  });
  tfootHTML += `</tr>`;
  tfoot.innerHTML = tfootHTML;
}

function setChartMetric(metricKey) {
  chartMetric = metricKey;
  
  ['portfolio', 'par', 'ratio', 'clients'].forEach(m => {
    const btn = document.getElementById(`chartMetricBtn-${m}`);
    if (m === metricKey) {
      btn.className = 'px-3 py-1 rounded-lg transition bg-[#00585A] text-white font-extrabold shadow';
    } else {
      btn.className = 'px-3 py-1 rounded-lg transition text-slate-700 font-bold';
    }
  });

  if (portfolioFiles.length > 0 || parFiles.length > 0) {
    const matrix = computeMasterMatrixData();
    renderTrendChart(matrix);
  }
}

// RENDER TREND CHART (TARGETED HOVER & PESO SIGN REMOVED)
function renderTrendChart(matrix) {
  const ctx = document.getElementById('analyticsChart').getContext('2d');
  const selectedBranch = document.getElementById('branchFilter').value;
  
  document.getElementById('chartTargetLabel').textContent = selectedBranch !== 'ALL' ? `Credit Officers in ${selectedBranch}` : 'All Regional Branches';

  if (chartInstance) {
    chartInstance.destroy();
  }

  if (!matrix.sortedDates.length || !matrix.rowKeys.length) return;

  const vibrantColors = [
    { border: '#00585A', bg: 'rgba(0, 88, 90, 0.15)' },
    { border: '#00B4C5', bg: 'rgba(0, 180, 197, 0.15)' },
    { border: '#E68A00', bg: 'rgba(230, 138, 0, 0.15)' },
    { border: '#FF5722', bg: 'rgba(255, 87, 34, 0.15)' },
    { border: '#8E24AA', bg: 'rgba(142, 36, 170, 0.15)' },
    { border: '#E91E63', bg: 'rgba(233, 30, 99, 0.15)' },
    { border: '#10B981', bg: 'rgba(16, 185, 129, 0.15)' },
    { border: '#2563EB', bg: 'rgba(37, 99, 235, 0.15)' },
    { border: '#D97706', bg: 'rgba(217, 119, 6, 0.15)' },
    { border: '#4F46E5', bg: 'rgba(79, 70, 229, 0.15)' }
  ];

  const currentDatasetMap = matrix[chartMetric];

  const chartDatasets = matrix.rowKeys.map((key, index) => {
    const colorObj = vibrantColors[index % vibrantColors.length];
    const dataPoints = matrix.sortedDates.map(d => currentDatasetMap.data[key][d] || 0);

    return {
      label: key,
      data: dataPoints,
      borderColor: colorObj.border,
      backgroundColor: colorObj.border,
      borderWidth: 3.5,
      pointRadius: 5,
      pointHoverRadius: 8,
      pointBackgroundColor: colorObj.border,
      pointBorderColor: '#FFFFFF',
      pointBorderWidth: 2,
      tension: 0.25,
      fill: false
    };
  });

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: matrix.sortedDates,
      datasets: chartDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      hover: {
        mode: 'nearest',
        intersect: true
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#0F172A',
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 10,
            boxHeight: 10,
            padding: 20,
            font: { family: 'Plus Jakarta Sans', size: 12, weight: '800' }
          }
        },
        tooltip: {
          mode: 'nearest',
          intersect: true,
          padding: 12,
          backgroundColor: '#0F172A',
          titleFont: { family: 'Plus Jakarta Sans', size: 12, weight: 'bold' },
          bodyFont: { family: 'Plus Jakarta Sans', size: 11 },
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              const val = context.parsed.y;
              if (chartMetric === 'ratio') label += formatPercent(val);
              else if (chartMetric === 'clients') label += formatNumber(val, 0) + ' clients';
              else label += formatNumber(val, 2); // PESO SIGN REMOVED
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#E2E8F0', lineWidth: 1 },
          ticks: { color: '#334155', font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' } }
        },
        y: {
          grid: { color: '#E2E8F0', lineWidth: 1 },
          ticks: {
            color: '#334155',
            font: { family: 'Plus Jakarta Sans', size: 10, weight: '700' },
            callback: function(value) {
              if (chartMetric === 'ratio') return value + '%';
              if (chartMetric === 'clients') return value;
              return value >= 1000000 ? (value / 1000000).toFixed(1) + 'M' : (value / 1000).toFixed(0) + 'k'; // PESO SIGN REMOVED
            }
          }
        }
      }
    }
  });
}

// EXEC CALCULATOR WITH COFFEE CONCEPT, BALANCED FONT SIZES & PESO SIGN REMOVED
function runCalculator() {
  const baseDate = document.getElementById('calcBaseDate').value;
  const targetDate = document.getElementById('calcTargetDate').value;
  const resultsBox = document.getElementById('calcResultsBox');
  const tableContainer = document.getElementById('calcTableContainer');

  if (!baseDate || !targetDate) {
    resultsBox.classList.add('hidden');
    tableContainer.classList.add('hidden');
    return;
  }

  const matrix = computeMasterMatrixData();
  const selectedBranch = document.getElementById('branchFilter').value;
  const isFiltered = selectedBranch !== 'ALL';

  document.getElementById('calcModeLabel').textContent = isFiltered ? `Officers in ${selectedBranch}` : 'Regional Branches';
  document.getElementById('calcTableTitle').textContent = isFiltered ? `Credit Officer Variance Breakdown (${selectedBranch})` : 'Branch Variance Breakdown';
  document.getElementById('calcThFirst').textContent = isFiltered ? 'Credit Officer' : 'Branch';

  const basePort = matrix.portfolio.totals[baseDate] || 0;
  const targetPort = matrix.portfolio.totals[targetDate] || 0;
  const portDiff = targetPort - basePort;
  const portPct = basePort > 0 ? (portDiff / basePort) * 100 : 0;

  const basePar = matrix.par.totals[baseDate] || 0;
  const targetPar = matrix.par.totals[targetDate] || 0;
  const parDiff = targetPar - basePar;
  const parPct = basePar > 0 ? (parDiff / basePar) * 100 : 0;

  const baseRatio = matrix.ratio.totals[baseDate] || 0;
  const targetRatio = matrix.ratio.totals[targetDate] || 0;
  const ratioDiff = targetRatio - baseRatio;

  const baseCli = matrix.clients.totals[baseDate] || 0;
  const targetCli = matrix.clients.totals[targetDate] || 0;
  const cliDiff = targetCli - baseCli;
  const cliPct = baseCli > 0 ? (cliDiff / baseCli) * 100 : 0;

  // COFFEE CONCEPT PALETTE + BALANCED FONT SIZE + PESO SIGN REMOVED
  resultsBox.innerHTML = `
    <!-- 1. Dark Espresso Roasted Card -->
    <div class="bg-[#2C1A1D] text-white p-4 rounded-2xl shadow-md border-2 border-[#1C1012] flex flex-col justify-between">
      <div>
        <div class="flex justify-between items-center gap-1">
          <p class="text-[10px] font-black uppercase tracking-wider text-[#D9C3B0] truncate">Portfolio Variance</p>
          <span class="text-[10px] font-black bg-white/15 text-white px-2 py-0.5 rounded-full border border-white/25 shrink-0">
            ${portPct >= 0 ? '+' : ''}${formatPercent(portPct)}
          </span>
        </div>
        <h3 class="text-lg sm:text-xl font-black font-mono text-white mt-1.5 truncate">
          ${portDiff >= 0 ? '+' : ''}${formatNumber(portDiff, 2)}
        </h3>
      </div>
      <p class="text-[10px] text-[#D9C3B0] font-bold mt-2 truncate">${baseDate} &rarr; ${targetDate}</p>
    </div>

    <!-- 2. Rich Mocha Roasted Card -->
    <div class="bg-[#4A2E2B] text-white p-4 rounded-2xl shadow-md border-2 border-[#361F1D] flex flex-col justify-between">
      <div>
        <div class="flex justify-between items-center gap-1">
          <p class="text-[10px] font-black uppercase tracking-wider text-[#E3C8B8] truncate">PAR Amount Variance</p>
          <span class="text-[10px] font-black bg-white/15 text-white px-2 py-0.5 rounded-full border border-white/25 shrink-0">
            ${parPct >= 0 ? '+' : ''}${formatPercent(parPct)}
          </span>
        </div>
        <h3 class="text-lg sm:text-xl font-black font-mono text-white mt-1.5 truncate">
          ${parDiff >= 0 ? '+' : ''}${formatNumber(parDiff, 2)}
        </h3>
      </div>
      <p class="text-[10px] text-[#E3C8B8] font-bold mt-2 truncate">${baseDate} &rarr; ${targetDate}</p>
    </div>

    <!-- 3. Warm Crema Gold Card -->
    <div class="bg-[#8C5A3C] text-white p-4 rounded-2xl shadow-md border-2 border-[#6E442B] flex flex-col justify-between">
      <div>
        <div class="flex justify-between items-center gap-1">
          <p class="text-[10px] font-black uppercase tracking-wider text-[#F0DFD5] truncate">PAR Ratio Variance</p>
          <span class="text-[10px] font-black bg-white/20 text-white px-2 py-0.5 rounded-full border border-white/30 shrink-0">
            ${ratioDiff >= 0 ? '+' : ''}${ratioDiff.toFixed(2)}%
          </span>
        </div>
        <h3 class="text-lg sm:text-xl font-black font-mono text-white mt-1.5 truncate">
          ${ratioDiff >= 0 ? '+' : ''}${ratioDiff.toFixed(2)}%
        </h3>
      </div>
      <p class="text-[10px] text-[#F0DFD5] font-bold mt-2 truncate">${baseDate} &rarr; ${targetDate}</p>
    </div>

    <!-- 4. Smooth Oat Milk / Latte Foam Card -->
    <div class="bg-[#C49A6C] text-slate-900 p-4 rounded-2xl shadow-md border-2 border-[#A37B50] flex flex-col justify-between">
      <div>
        <div class="flex justify-between items-center gap-1">
          <p class="text-[10px] font-black uppercase tracking-wider text-slate-900 truncate">Clients Growth</p>
          <span class="text-[10px] font-black bg-slate-900/15 text-slate-900 px-2 py-0.5 rounded-full border border-slate-900/20 shrink-0">
            ${cliPct >= 0 ? '+' : ''}${formatPercent(cliPct)}
          </span>
        </div>
        <h3 class="text-lg sm:text-xl font-black font-mono text-slate-900 mt-1.5 truncate">
          ${cliDiff >= 0 ? '+' : ''}${formatNumber(cliDiff, 0)} clients
        </h3>
      </div>
      <p class="text-[10px] text-slate-800 font-bold mt-2 truncate">${baseDate} &rarr; ${targetDate}</p>
    </div>
  `;
  resultsBox.classList.remove('hidden');

  const tbody = document.getElementById('calcTbody');
  const tfoot = document.getElementById('calcTfoot');

  let tbodyHTML = '';
  matrix.rowKeys.forEach(k => {
    const bP = matrix.portfolio.data[k][baseDate] || 0;
    const tP = matrix.portfolio.data[k][targetDate] || 0;
    const pVar = tP - bP;

    const bPAR = matrix.par.data[k][baseDate] || 0;
    const tPAR = matrix.par.data[k][targetDate] || 0;
    const parVar = tPAR - bPAR;

    const bR = matrix.ratio.data[k][baseDate] || 0;
    const tR = matrix.ratio.data[k][targetDate] || 0;
    const rVar = tR - bR;

    const bC = matrix.clients.data[k][baseDate] || 0;
    const tC = matrix.clients.data[k][targetDate] || 0;
    const cVar = tC - bC;

    tbodyHTML += `<tr class="hover:bg-slate-100 transition-colors border-b border-slate-200">`;
    tbodyHTML += `<td class="py-2.5 px-3.5 font-sans font-black text-slate-900 sticky left-0 bg-white border-r-2 border-slate-300">${k}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right text-slate-900 font-bold">${formatNumber(bP, 2)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right text-slate-900 font-bold">${formatNumber(tP, 2)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right ${pVar >= 0 ? 'text-[#00585A]' : 'text-[#FF7A00]'} font-black border-r-2 border-slate-300">${pVar >= 0 ? '+' : ''}${formatNumber(pVar, 2)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right text-slate-900 font-bold">${formatNumber(bPAR, 2)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right text-slate-900 font-bold">${formatNumber(tPAR, 2)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right ${parVar <= 0 ? 'text-[#00585A]' : 'text-[#FF7A00]'} font-black border-r-2 border-slate-300">${parVar >= 0 ? '+' : ''}${formatNumber(parVar, 2)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right text-slate-900 font-bold">${formatPercent(bR)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right text-slate-900 font-bold">${formatPercent(tR)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right ${rVar <= 0 ? 'text-[#00585A]' : 'text-[#FF7A00]'} font-black border-r-2 border-slate-300">${rVar >= 0 ? '+' : ''}${rVar.toFixed(2)}%</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right text-slate-900 font-bold">${formatNumber(bC, 0)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right text-slate-900 font-bold">${formatNumber(tC, 0)}</td>`;
    tbodyHTML += `<td class="py-2.5 px-3.5 text-right ${cVar >= 0 ? 'text-[#00A8B5]' : 'text-[#FF7A00]'} font-black">${cVar >= 0 ? '+' : ''}${formatNumber(cVar, 0)}</td>`;
    tbodyHTML += `</tr>`;
  });
  tbody.innerHTML = tbodyHTML;

  tfoot.innerHTML = `
    <tr class="bg-slate-100 border-t-2 border-slate-400">
      <td class="py-3 px-3.5 font-sans font-black text-slate-900 sticky left-0 bg-slate-100 border-r-2 border-slate-300">TOTAL</td>
      <td class="py-3 px-3.5 text-right font-extrabold text-slate-900">${formatNumber(basePort, 2)}</td>
      <td class="py-3 px-3.5 text-right font-extrabold text-slate-900">${formatNumber(targetPort, 2)}</td>
      <td class="py-3 px-3.5 text-right ${portDiff >= 0 ? 'text-[#00585A]' : 'text-[#FF7A00]'} font-black border-r-2 border-slate-300">${portDiff >= 0 ? '+' : ''}${formatNumber(portDiff, 2)}</td>
      <td class="py-3 px-3.5 text-right font-extrabold text-slate-900">${formatNumber(basePar, 2)}</td>
      <td class="py-3 px-3.5 text-right font-extrabold text-slate-900">${formatNumber(targetPar, 2)}</td>
      <td class="py-3 px-3.5 text-right ${parDiff <= 0 ? 'text-[#00585A]' : 'text-[#FF7A00]'} font-black border-r-2 border-slate-300">${parDiff >= 0 ? '+' : ''}${formatNumber(parDiff, 2)}</td>
      <td class="py-3 px-3.5 text-right font-extrabold text-slate-900">${formatPercent(baseRatio)}</td>
      <td class="py-3 px-3.5 text-right font-extrabold text-slate-900">${formatPercent(targetRatio)}</td>
      <td class="py-3 px-3.5 text-right ${ratioDiff <= 0 ? 'text-[#00585A]' : 'text-[#FF7A00]'} font-black border-r-2 border-slate-300">${ratioDiff >= 0 ? '+' : ''}${ratioDiff.toFixed(2)}%</td>
      <td class="py-3 px-3.5 text-right font-extrabold text-slate-900">${formatNumber(baseCli, 0)}</td>
      <td class="py-3 px-3.5 text-right font-extrabold text-slate-900">${formatNumber(targetCli, 0)}</td>
      <td class="py-3 px-3.5 text-right ${cliDiff >= 0 ? 'text-[#00A8B5]' : 'text-[#FF7A00]'} font-black">${cliDiff >= 0 ? '+' : ''}${formatNumber(cliDiff, 0)}</td>
    </tr>
  `;

  tableContainer.classList.remove('hidden');
}

function updateCalculatorDropdowns() {
  const baseSelect = document.getElementById('calcBaseDate');
  const targetSelect = document.getElementById('calcTargetDate');

  const dates = getSortedUniqueDates();

  const currentBase = baseSelect.value;
  const currentTarget = targetSelect.value;

  let html = `<option value="" class="bg-white text-slate-500 font-medium">Select Date</option>`;
  dates.forEach(d => {
    html += `<option value="${d}" class="bg-white text-slate-900 font-bold">${d}</option>`;
  });

  baseSelect.innerHTML = html;
  targetSelect.innerHTML = html;

  if (dates.includes(currentBase)) baseSelect.value = currentBase;
  if (dates.includes(currentTarget)) targetSelect.value = currentTarget;
  else if (dates.length >= 2) {
    baseSelect.value = dates[0];
    targetSelect.value = dates[dates.length - 1];
  }
}

function updateTotalFileBadgeCount() {
  const total = portfolioFiles.length + parFiles.length;
  document.getElementById('totalFileBadgeCount').textContent = total;
}

function updateFilesModalContent() {
  const pCount = document.getElementById('modalPortfolioCount');
  const pList = document.getElementById('modalPortfolioList');
  const parCount = document.getElementById('modalParCount');
  const parList = document.getElementById('modalParList');
  const totalCount = document.getElementById('modalFileTotalCount');

  pCount.textContent = portfolioFiles.length;
  parCount.textContent = parFiles.length;
  totalCount.textContent = portfolioFiles.length + parFiles.length;

  if (portfolioFiles.length === 0) {
    pList.innerHTML = `<p class="text-xs text-slate-400 italic">No portfolio files uploaded.</p>`;
  } else {
    pList.innerHTML = portfolioFiles.map(f => `
      <div class="flex items-center justify-between bg-teal-50 border-2 border-[#00A8B5] px-3.5 py-2.5 rounded-xl text-xs">
        <div>
          <p class="font-black text-[#00585A] font-mono">${f.reportDate}</p>
          <p class="text-[10px] text-slate-600 font-bold truncate max-w-[200px]">${f.fileName}</p>
        </div>
        <button onclick="requestAuthForAction('DELETE_FILE', { fileName: '${f.fileName}', storeName: '${STORE_PORTFOLIO}' })" class="text-slate-400 hover:text-rose-600 transition p-1.5" title="Remove File">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `).join('');
  }

  if (parFiles.length === 0) {
    parList.innerHTML = `<p class="text-xs text-slate-400 italic">No PAR files uploaded.</p>`;
  } else {
    parList.innerHTML = parFiles.map(f => `
      <div class="flex items-center justify-between bg-orange-50 border-2 border-[#FF7A00] px-3.5 py-2.5 rounded-xl text-xs">
        <div>
          <p class="font-black text-[#FF7A00] font-mono">${f.reportDate}</p>
          <p class="text-[10px] text-slate-600 font-bold truncate max-w-[200px]">${f.fileName}</p>
        </div>
        <button onclick="requestAuthForAction('DELETE_FILE', { fileName: '${f.fileName}', storeName: '${STORE_PAR}' })" class="text-slate-400 hover:text-rose-600 transition p-1.5" title="Remove File">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `).join('');
  }
}

function renderEmptyState() {
  document.getElementById('unifiedThRow').innerHTML = `
    <th class="py-3 px-4 min-w-[200px]">Branch</th>
    <th class="py-3 px-4 text-center text-teal-100 font-medium italic">No reports loaded</th>
  `;
  document.getElementById('unifiedTbody').innerHTML = `
    <tr>
      <td colspan="2" class="py-12 text-center text-slate-500 font-sans font-bold">
        Upload Excel files to view metrics matrix.
      </td>
    </tr>
  `;
  document.getElementById('unifiedTfoot').innerHTML = '';

  document.getElementById('calcResultsBox').classList.add('hidden');
  document.getElementById('calcTableContainer').classList.add('hidden');

  if (chartInstance) {
    chartInstance.destroy();
  }
}

function exportToExcel() {
  if (!portfolioFiles.length && !parFiles.length) {
    showToast('No data available to export.', true);
    return;
  }

  const matrix = computeMasterMatrixData();
  const wb = XLSX.utils.book_new();

  function buildExportSheet(metricKey, titleName, isPercent = false) {
    const rows = [];
    rows.push([titleName]);
    
    const selectedBranch = document.getElementById('branchFilter').value;
    const firstCol = selectedBranch !== 'ALL' ? 'Credit Officer' : 'Branch';
    
    rows.push([firstCol, ...matrix.sortedDates]);

    const dataset = matrix[metricKey];
    matrix.rowKeys.forEach(k => {
      const rowVals = [k];
      matrix.sortedDates.forEach(d => {
        const val = dataset.data[k][d] || 0;
        rowVals.push(isPercent ? (val / 100) : val);
      });
      rows.push(rowVals);
    });

    const footVals = ['TOTAL'];
    matrix.sortedDates.forEach(d => {
      const val = dataset.totals[d] || 0;
      footVals.push(isPercent ? (val / 100) : val);
    });
    rows.push(footVals);

    return XLSX.utils.aoa_to_sheet(rows);
  }

  const selectedBranch = document.getElementById('branchFilter').value;
  const suffix = selectedBranch !== 'ALL' ? `_${selectedBranch}` : '_All_Branches';

  XLSX.utils.book_append_sheet(wb, buildExportSheet('portfolio', 'Loan Portfolio'), 'Loan Portfolio');
  XLSX.utils.book_append_sheet(wb, buildExportSheet('par', 'PAR Amount'), 'PAR Amount');
  XLSX.utils.book_append_sheet(wb, buildExportSheet('ratio', 'PAR Ratio (%)', true), 'PAR Ratio');
  XLSX.utils.book_append_sheet(wb, buildExportSheet('accounts', 'Total Accounts'), 'Total Accounts');
  XLSX.utils.book_append_sheet(wb, buildExportSheet('clients', 'Total Clients'), 'Total Clients');

  XLSX.writeFile(wb, `LoanCube_Executive_Analytics${suffix}_${new Date().toISOString().slice(0,10)}.xlsx`);
}