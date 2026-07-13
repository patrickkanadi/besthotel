const API_URL = "https://script.google.com/macros/s/AKfycbykTybIX-9YVGytTKeCBbDdpU9ihP3lbYFaAEBJQA0iE7uaPpI7Te1U568pZdTian_-mw/exec"; // REPLACE THIS
const DB_NAME = "Hotel_POS";
const DB_VERSION = 5; 
let db;

let antreans = [
    { cart: [], room: "", isLocked: true },
    { cart: [], room: "", isLocked: true },
    { cart: [], room: "", isLocked: true }
];
let currentAntreanIndex = 0;

let currentCashier = ""; let currentPin = ""; let currentShiftId = ""; let currentLoginTime = "";
let globalMenuData = []; let currentLocation = ""; let currentCategory = ""; let activeLaundryTickets = []; let currentCart = []; 
let activeNumpadItem = null; let numpadValue = "0"; let activeSettlementTicket = null;

window.masterDrawerBalanceLaundry = 0;
window.masterDrawerBalanceHotel = 0;
let isLoggingOut = false; let isMenuLocked = true; let isSyncing = false;

window.globalRoomList = [];
window.globalRecentOrders = [];
window.globalRecentExpenses = [];
window.globalRecentShifts = [];
window.globalPendingInbounds = [];
window.globalRoomList = [];
window.globalRecentOrders = [];
window.globalRecentExpenses = [];
window.globalRecentShifts = [];
window.globalRecentDrops = []; // ✅ NEW
window.globalSettings = {};
window.activeUnpaidOrders = [];
window.settlementMode = 'complete';

let btDevice = null; let btCharacteristic = null;
window.lastActivityWrite = Date.now();

window.currentPrintMode = 'bluetooth';

window.setPrintMode = function(mode) {
    window.currentPrintMode = mode;
    let btBtn = document.getElementById("btn-printer");
    // Sembunyikan tombol "Connect Bluetooth" jika mode A4 dipilih
    if (btBtn) {
        btBtn.style.display = (mode === 'desktop') ? 'none' : 'inline-block';
    }
};

// ==========================================
// ENGINE A4 SPLIT PRINT (KIRI & KANAN)
// ==========================================
window.printStandardGlobal = function(title, contentHtml, totalHtml, footerText) {
    let printArea = document.getElementById("print-area");
    if (!printArea) return alert("Error: Area print tidak ditemukan di HTML.");

    // Template untuk satu sisi (Setengah A4)
    let singleReceipt = `
        <div style="padding:20px; border:1px solid #000; height: 100%; box-sizing: border-box; border-radius:8px;">
            <div style="text-align:center; font-weight:900; font-size:22px; margin-bottom:5px; letter-spacing:1px;">HOTEL POS</div>
            <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:20px; padding-bottom:10px; border-bottom:2px solid #000;">${title}</div>
            <div style="font-size:14px; margin-bottom:20px; line-height:1.6;">
                ${contentHtml}
            </div>
            <div style="font-size:15px; margin-bottom:20px; border-top:2px dashed #000; padding-top:15px;">
                ${totalHtml}
            </div>
            <div style="text-align:center; font-size:14px; font-weight:bold; border-top:2px solid #000; padding-top:15px;">
                ${footerText}
            </div>
        </div>
    `;

    // Gabungkan menjadi Kiri dan Kanan
    printArea.innerHTML = `
        <div style="display:flex; justify-content:space-between; width:100%;">
            <div style="width:48%;">${singleReceipt}</div>
            <div style="width:48%;">${singleReceipt}</div>
        </div>
    `;

    window.print(); 
};

window.printOrderStandard = function(orderId) {
    let o = window.globalRecentOrders.find(x => x.orderId === orderId);
    if(!o) return;
    
    let content = `
        <div style="margin-bottom:15px;">
            <div style="display:flex; justify-content:space-between;"><b>No. Nota:</b> <span>${o.orderId}</span></div>
            <div style="display:flex; justify-content:space-between;"><b>Kamar:</b> <span>${o.roomNumber}</span></div>
            <div style="display:flex; justify-content:space-between;"><b>Kasir:</b> <span>${o.cashier}</span></div>
            <div style="display:flex; justify-content:space-between;"><b>Waktu:</b> <span>${formatWIB(o.timestamp)}</span></div>
        </div>
        <div style="padding:10px; background:#f9f9f9; border:1px solid #eee; border-radius:5px;">
            ${o.readableReceipt.replace(/\n/g, '<br>')}
        </div>
    `;
    
    let total = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Subtotal:</span><span>Rp ${o.subtotal.toLocaleString('id-ID')}</span></div>
        ${o.discounts > 0 ? `<div style="display:flex; justify-content:space-between; margin-bottom:5px; color:#c0392b;"><span>Diskon:</span><span>-Rp ${o.discounts.toLocaleString('id-ID')}</span></div>` : ''}
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:18px; margin-top:10px; padding-top:10px; border-top:1px solid #ddd;"><span>TOTAL:</span><span>Rp ${o.grandTotal.toLocaleString('id-ID')}</span></div>
        <div style="margin-top:15px; font-size:12px; color:#555; display:grid; grid-template-columns:1fr 1fr; gap:5px;">
            <div>Cash Lndry: Rp ${o.cashLaundryAmount.toLocaleString('id-ID')}</div>
            <div>Cash Hotel: Rp ${o.cashHotelAmount.toLocaleString('id-ID')}</div>
            <div>QRIS: Rp ${o.qrisAmount.toLocaleString('id-ID')}</div>
            <div>Transfer: Rp ${o.transferAmount.toLocaleString('id-ID')}</div>
        </div>
    `;
    window.printStandardGlobal("SALINAN NOTA", content, total, "TERIMA KASIH");
};

window.printExpenseStandard = function(expId) {
    let e = window.globalRecentExpenses.find(x => x.expenseId === expId);
    if(!e) return;
    let content = `<b>ID:</b> ${e.expenseId}<br><b>Kasir:</b> ${e.cashier}<br><b>Waktu:</b> ${formatWIB(e.timestamp)}<br><b>Laci:</b> ${e.drawer}<br><b>Kategori:</b> ${e.category}<br><b>Ket:</b> ${e.description}`;
    let total = `<div style="font-size:16px; font-weight:bold; text-align:right;">TOTAL KELUAR: Rp ${e.amount.toLocaleString('id-ID')}</div>`;
    window.printStandardGlobal("BUKTI PENGELUARAN", content, total, "SIMPAN SEBAGAI BUKTI");
};

window.printShiftStandard = function(shiftId) {
    let s = window.globalRecentShifts.find(x => x.shiftId === shiftId);
    if(!s) return;
    let content = `<b>Shift:</b> ${s.shiftId}<br><b>Kasir:</b> ${s.cashier}<br><b>Masuk:</b> ${formatTimeOnlyWIB(s.loginTime)}<br><b>Keluar:</b> ${formatTimeOnlyWIB(s.logoutTime)}<br><br><b>Item Terjual:</b><br>${s.foodSummary.replace(/📍/g, '<br><b>').replace(/📁/g, '</b><br><i>').replace(/:::/g, ' - ')}`;
    let total = `<b>Omset Laundry:</b> Rp ${(s.omsetLaundry||0).toLocaleString('id-ID')}<br><b>Omset Hotel:</b> Rp ${(s.omsetHotel||0).toLocaleString('id-ID')}<br><br><b>Netto Laci Lndry:</b> Rp ${(s.netLaundry||0).toLocaleString('id-ID')}<br><b>Netto Laci Hotel:</b> Rp ${(s.netHotel||0).toLocaleString('id-ID')}`;
    window.printStandardGlobal("LAPORAN TUTUP SHIFT", content, total, "TERIMA KASIH");
};

// 1. INIT DB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 6); // Bumped Version
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains("staff")) db.createObjectStore("staff", { keyPath: "pin" });
            if (!db.objectStoreNames.contains("menu")) db.createObjectStore("menu", { keyPath: "itemId" });
            if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
            if (!db.objectStoreNames.contains("orders")) db.createObjectStore("orders", { keyPath: "orderId" });
            if (!db.objectStoreNames.contains("active_shifts")) db.createObjectStore("active_shifts", { keyPath: "pin" }); 
            if (!db.objectStoreNames.contains("cash_drops")) db.createObjectStore("cash_drops", { keyPath: "dropId" }); 
            if (!db.objectStoreNames.contains("shift_reports")) db.createObjectStore("shift_reports", { keyPath: "shiftId" }); 
            if (!db.objectStoreNames.contains("expenses")) db.createObjectStore("expenses", { keyPath: "expenseId" });
            if (!db.objectStoreNames.contains("expense_categories")) db.createObjectStore("expense_categories", { keyPath: "name" });
            if (!db.objectStoreNames.contains("void_requests")) db.createObjectStore("void_requests", { keyPath: "id" });
            if (!db.objectStoreNames.contains("local_shift_history")) db.createObjectStore("local_shift_history", { keyPath: "shiftId" });
            // NEW TABLES
            if (!db.objectStoreNames.contains("stock_inbounds")) db.createObjectStore("stock_inbounds", { keyPath: "inboundId" });
            if (!db.objectStoreNames.contains("stock_opnames")) db.createObjectStore("stock_opnames", { keyPath: "opnameId" });
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        request.onerror = (e) => { reject(e); };
    });
}

// ==========================================
// LOGIKA PWA INSTALL
// ==========================================
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    // Mencegah browser menampilkan prompt install default
    e.preventDefault(); 
    // Simpan event untuk dipicu nanti
    deferredPrompt = e; 
    
    // Tampilkan tombol di menu POS atas
    const installBtn = document.getElementById('btn-install'); 
    if(installBtn) installBtn.classList.remove('hidden'); 
    
    // Tampilkan tombol di layar Login
    const loginInstallBtn = document.getElementById('btn-install-login');
    if(loginInstallBtn) loginInstallBtn.classList.remove('hidden');
});

window.installPWA = function() { 
    if (deferredPrompt) {
        // Tampilkan prompt install bawaan sistem
        deferredPrompt.prompt(); 
        
        // Tunggu respon pengguna
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                // Sembunyikan kedua tombol jika user setuju menginstal
                let btn = document.getElementById('btn-install');
                if(btn) btn.classList.add('hidden');
                
                let loginBtn = document.getElementById('btn-install-login');
                if(loginBtn) loginBtn.classList.add('hidden');
            }
            deferredPrompt = null; 
        }); 
    } 
};

async function hashString(str) {
    const msgUint8 = new TextEncoder().encode(str); const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer)); return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
function formatWIB(dateString) { return new Date(dateString).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') + ' WIB'; }
function formatTimeOnlyWIB(dateString) { return new Date(dateString).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit' }) + ' WIB'; }

// 2. PRINTER ENGINE
window.connectBluetoothPrinter = async function() {
    try {
        btDevice = await navigator.bluetooth.requestDevice({ filters: [{ services: [0x18F0] }], optionalServices: [0x18F0] });
        const server = await btDevice.gatt.connect();
        const service = await server.getPrimaryService(0x18F0);
        btCharacteristic = await service.getCharacteristic(0x2AF1);
        const btn = document.getElementById("btn-printer");
        if(btn) { btn.innerText = "🖨️ Printer: Terhubung"; btn.style.background = "#2ecc71"; }
    } catch (err) { alert("Gagal terhubung ke printer Bluetooth."); }
};

async function sendToPrinter(payloadUint8) {
    if (!btCharacteristic) return;
    const chunkSize = 20; 
    for (let i = 0; i < payloadUint8.length; i += chunkSize) {
        const chunk = payloadUint8.slice(i, i + chunkSize);
        await btCharacteristic.writeValue(chunk);
        await new Promise(r => setTimeout(r, 10)); 
    }
}

function formatEscPosLine(left, right, isBig) {
    const maxLen = isBig ? 16 : 32; const leftStr = String(left); const rightStr = String(right);
    const spaceNeeded = maxLen - (leftStr.length + rightStr.length);
    if (spaceNeeded > 0) return leftStr + " ".repeat(spaceNeeded) + rightStr;
    return leftStr + "\n" + " ".repeat(Math.max(0, maxLen - rightStr.length)) + rightStr;
}

window.buildShiftReportReceipt = async function(data) {
    const h1 = "HOTEL POS";
    const CMD_INIT = "\x1B\x40"; const CMD_CENTER = "\x1B\x61\x01"; const CMD_LEFT = "\x1B\x61\x00"; 
    const CMD_BOLD_ON = "\x1B\x45\x01"; const CMD_BOLD_OFF = "\x1B\x45\x00"; 
    const CMD_BIG = "\x1B!\x11"; const CMD_NORMAL = "\x1B!\x00"; const CMD_CUT = "\x1D\x56\x41\x10";

    let r = CMD_INIT + CMD_CENTER + CMD_BOLD_ON + CMD_BIG + h1 + "\n" + CMD_NORMAL + CMD_BOLD_OFF;
    r += "LAPORAN TUTUP SHIFT\n--------------------------------\n" + CMD_LEFT;
    r += "ID Shift: " + data.shiftId + "\nKasir   : " + data.cashier + "\nLogin   : " + formatTimeOnlyWIB(data.loginTime) + "\nLogout  : " + formatTimeOnlyWIB(data.logoutTime) + "\n--------------------------------\n";
    r += formatEscPosLine("Total Pesanan", data.totalOrders, false) + "\n--------------------------------\n";
    
    r += CMD_BOLD_ON + "PENERIMAAN LAUNDRY:" + CMD_BOLD_OFF + "\n";
    r += formatEscPosLine("Tunai", (data.cashLaundry || 0).toLocaleString('id-ID'), false) + "\n";
    r += formatEscPosLine("QRIS", (data.qrisLaundry || 0).toLocaleString('id-ID'), false) + "\n";
    r += formatEscPosLine("Omset Laundry", (data.omsetLaundry || 0).toLocaleString('id-ID'), false) + "\n--------------------------------\n";
    
    r += CMD_BOLD_ON + "PENERIMAAN HOTEL:" + CMD_BOLD_OFF + "\n";
    r += formatEscPosLine("Tunai", (data.cashHotel || 0).toLocaleString('id-ID'), false) + "\n";
    r += formatEscPosLine("Transfer", (data.transferHotel || 0).toLocaleString('id-ID'), false) + "\n";
    r += formatEscPosLine("Omset Hotel", (data.omsetHotel || 0).toLocaleString('id-ID'), false) + "\n--------------------------------\n";

    r += CMD_BOLD_ON + "PENGELUARAN:" + CMD_BOLD_OFF + "\n";
    r += formatEscPosLine("Laci Laundry", (data.expLaundry || 0).toLocaleString('id-ID'), false) + "\n";
    r += formatEscPosLine("Laci Hotel", (data.expHotel || 0).toLocaleString('id-ID'), false) + "\n--------------------------------\n";

    r += CMD_BOLD_ON + "SISA UANG LACI AKTUAL:" + CMD_BOLD_OFF + "\n";
    r += formatEscPosLine("Laci Laundry", (data.netLaundry || 0).toLocaleString('id-ID'), false) + "\n";
    r += formatEscPosLine("Laci Hotel", (data.netHotel || 0).toLocaleString('id-ID'), false) + "\n--------------------------------\n";
    
    r += "\n\n\n\n" + CMD_CUT;
    const encoder = new TextEncoder(); await sendToPrinter(encoder.encode(r));
};

window.printGlobalReceipt = async function(title, contentStr, totalStr, footerStr) {
    if (!btCharacteristic) return alert("⚠️ Printer belum terhubung!");
    const CMD_INIT = "\x1B\x40"; const CMD_CENTER = "\x1B\x61\x01"; const CMD_LEFT = "\x1B\x61\x00";
    const CMD_BOLD_ON = "\x1B\x45\x01"; const CMD_BOLD_OFF = "\x1B\x45\x00";
    const CMD_BIG = "\x1B!\x11"; const CMD_NORMAL = "\x1B!\x00"; const CMD_CUT = "\x1D\x56\x41\x10";

    let r = CMD_INIT + CMD_CENTER + CMD_BOLD_ON + CMD_BIG + "HOTEL POS\n" + CMD_NORMAL + CMD_BOLD_OFF;
    r += CMD_CENTER + title + "\n";
    r += "--------------------------------\n" + CMD_LEFT;
    r += contentStr + "\n";
    r += "--------------------------------\n";
    if (totalStr) {
        r += CMD_BOLD_ON + totalStr + "\n" + CMD_BOLD_OFF + "--------------------------------\n";
    }
    r += CMD_CENTER + footerStr + "\n\n\n\n" + CMD_CUT;
    
    try {
        const encoder = new TextEncoder();
        await sendToPrinter(encoder.encode(r));
    } catch(e) { alert("Gagal mencetak: " + e); }
};

window.buildEscPosReceipt = async function(orderId, order, deposit, remaining, payMethod) {
    const h1 = "HOTEL POS"; 
    const CMD_INIT = "\x1B\x40"; const CMD_CENTER = "\x1B\x61\x01"; const CMD_LEFT = "\x1B\x61\x00";
    const CMD_BOLD_ON = "\x1B\x45\x01"; const CMD_BOLD_OFF = "\x1B\x45\x00";
    const CMD_BIG = "\x1B!\x11"; const CMD_NORMAL = "\x1B!\x00"; const CMD_CUT = "\x1D\x56\x41\x10";

    let receipt = CMD_INIT + CMD_CENTER + CMD_BOLD_ON + CMD_BIG + h1 + "\n" + CMD_NORMAL + CMD_BOLD_OFF;
    receipt += formatWIB(order.timestamp || new Date().toISOString()) + "\n";
    receipt += "--------------------------------\n" + CMD_LEFT;
    receipt += "Nota: " + orderId + "\nKamar: " + order.roomNumber + "\nKsr : " + order.cashier + "\n--------------------------------\n";

    order.items.forEach(item => {
        const qtyDisplay = item.qty % 1 !== 0 ? item.qty.toFixed(2) : item.qty;
        const lineTotal = (item.qty * item.originalPrice).toLocaleString('id-ID');
        receipt += formatEscPosLine(`${qtyDisplay}x ${item.name.substring(0,18)}`, lineTotal, false) + "\n";
    });

    receipt += "--------------------------------\n";
    receipt += formatEscPosLine("Subtotal", order.subtotal.toLocaleString('id-ID'), false) + "\n";
    if (order.discounts && order.discounts > 0) { receipt += formatEscPosLine("Diskon", "-" + order.discounts.toLocaleString('id-ID'), false) + "\n"; }
    receipt += CMD_BOLD_ON + CMD_BIG + formatEscPosLine("TOTAL", order.grandTotal.toLocaleString('id-ID'), true) + "\n" + CMD_NORMAL + CMD_BOLD_OFF + "\n";
    receipt += formatEscPosLine(`Tercatat(${payMethod})`, deposit.toLocaleString('id-ID'), false) + "\n";
    receipt += CMD_BOLD_ON + formatEscPosLine("STATUS", remaining > 0 ? "BELUM LUNAS" : "LUNAS", false) + "\n" + CMD_BOLD_OFF;
    receipt += "--------------------------------\n" + CMD_CENTER + CMD_BOLD_ON + "TERIMA KASIH\n" + CMD_BOLD_OFF;
    receipt += "\n\n\n\n" + CMD_CUT;

    const encoder = new TextEncoder(); await sendToPrinter(encoder.encode(receipt));
};

window.updateTabLabels = function() {
    const btns = document.querySelectorAll(".antrean-btn");
    btns.forEach((btn, i) => {
        let prefix = (i === 0) ? "1️⃣" : (i === 1) ? "2️⃣" : "3️⃣";
        let room = antreans[i].room;
        // Extact just the Room/Name (Ignore long WA numbers) so the button doesn't stretch
        let displayName = room ? room.split('(')[0].trim().substring(0, 10) : "Order";
        btn.innerText = `${prefix} ${displayName}`;
    });
};

window.viewOrderDetailsGlobal = function(orderId) {
    let o = window.globalRecentOrders.find(x => x.orderId === orderId);
    if(!o) return;
    
    document.getElementById("detail-id").innerText = o.orderId;
    document.getElementById("detail-time").innerText = formatWIB(o.timestamp);
    document.getElementById("detail-cashier").innerText = o.cashier;
    document.getElementById("detail-room").innerText = o.roomNumber; 
    
    let itemsHtml = "";
    if (o.readableReceipt) {
        let lines = o.readableReceipt.split('\n');
        lines.forEach(line => {
            if(line.trim()) {
                // Adds break-inside avoid so 3-columns don't cut items in half
                itemsHtml += `<div style="break-inside: avoid; display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed #eee; color:#2c3e50;">
                    <span>${line.replace(/•\s*/, '')}</span>
                </div>`;
            }
        });
    }
    document.getElementById("detail-items").innerHTML = itemsHtml || "Belum ada item tercatat";
    
    document.getElementById("detail-subtotal").innerText = "Rp " + o.subtotal.toLocaleString('id-ID');
    document.getElementById("detail-discount").innerText = "-Rp " + o.discounts.toLocaleString('id-ID');
    document.getElementById("detail-grandtotal").innerText = "Rp " + o.grandTotal.toLocaleString('id-ID');
    
    document.getElementById("detail-cash-l").innerText = "Rp " + o.cashLaundryAmount.toLocaleString('id-ID');
    document.getElementById("detail-cash-h").innerText = "Rp " + o.cashHotelAmount.toLocaleString('id-ID');
    document.getElementById("detail-qris").innerText = "Rp " + o.qrisAmount.toLocaleString('id-ID');
    document.getElementById("detail-transfer").innerText = "Rp " + o.transferAmount.toLocaleString('id-ID');
    
    document.getElementById("btn-print-order-detail").onclick = () => window.printOrderGlobal(o.orderId);
    
    let detailModal = document.getElementById("order-detail-modal");
    detailModal.style.zIndex = "2500";
    detailModal.classList.remove("hidden");
};

window.showToast = function(message, isError = false) {
    let toast = document.getElementById("toast-notification");
    if (!toast) return;
    toast.innerText = message;
    toast.style.background = isError ? "#e74c3c" : "#27ae60";
    toast.style.opacity = "1";
    setTimeout(() => { toast.style.opacity = "0"; }, 3000);
};

window.printOrderGlobal = function(orderId) {
    if (window.currentPrintMode === 'desktop') {
        window.printOrderStandard(orderId);
        return;
    }
    
    // -- Logika Bluetooth Bawaan --
    let o = window.globalRecentOrders.find(x => x.orderId === orderId);
    if(!o) return;
    let content = `Nota: ${o.orderId}\nKamar: ${o.roomNumber}\nKasir: ${o.cashier}\nWaktu: ${formatWIB(o.timestamp)}\n--------------------------------\n`;
    content += o.readableReceipt;
    let total = `Subtotal: Rp ${o.subtotal.toLocaleString('id-ID')}\n`;
    if(o.discounts > 0) total += `Diskon: -Rp ${o.discounts.toLocaleString('id-ID')}\n`;
    total += `TOTAL: Rp ${o.grandTotal.toLocaleString('id-ID')}\n`;
    total += `\n[Pembayaran]\nCash Laundry: Rp ${o.cashLaundryAmount.toLocaleString('id-ID')}\nCash Hotel: Rp ${o.cashHotelAmount.toLocaleString('id-ID')}\nQRIS Lndry: Rp ${o.qrisAmount.toLocaleString('id-ID')}\nTrf Hotel : Rp ${o.transferAmount.toLocaleString('id-ID')}`;
    window.printGlobalReceipt("SALINAN NOTA", content, total, "TERIMA KASIH");
};

window.viewExpenseDetailsGlobal = function(expId) {
    let e = window.globalRecentExpenses.find(x => x.expenseId === expId);
    if(!e) return;
    document.getElementById("exp-det-id").innerText = e.expenseId;
    document.getElementById("exp-det-time").innerText = formatWIB(e.timestamp);
    document.getElementById("exp-det-cashier").innerText = e.cashier;
    document.getElementById("exp-det-drawer").innerText = e.drawer;
    document.getElementById("exp-det-cat").innerText = e.category;
    document.getElementById("exp-det-desc").innerText = e.description;
    document.getElementById("exp-det-amount").innerText = "Rp " + e.amount.toLocaleString('id-ID');
    
    document.getElementById("btn-print-exp-detail").onclick = () => window.printExpenseGlobal(e.expenseId);
    document.getElementById("expense-detail-modal").classList.remove("hidden");
};

window.printExpenseGlobal = function(expId) {
    if (window.currentPrintMode === 'desktop') {
        window.printExpenseStandard(expId);
        return;
    }

    let e = window.globalRecentExpenses.find(x => x.expenseId === expId);
    if(!e) return;
    let content = `ID: ${e.expenseId}\nKasir: ${e.cashier}\nWaktu: ${formatWIB(e.timestamp)}\nLaci: ${e.drawer}\nKategori: ${e.category}\nKet: ${e.description}`;
    let total = `TOTAL KELUAR: Rp ${e.amount.toLocaleString('id-ID')}`;
    window.printGlobalReceipt("BUKTI PENGELUARAN", content, total, "SIMPAN SEBAGAI BUKTI");
};

window.viewShiftDetailsGlobal = function(shiftId) {
    let s = window.globalRecentShifts.find(x => x.shiftId === shiftId);
    if(!s) return;
    
    document.getElementById("hist-sr-id").innerText = s.shiftId;
    document.getElementById("hist-sr-cashier").innerText = s.cashier;
    document.getElementById("hist-sr-orders").innerText = s.totalOrders;
    document.getElementById("hist-sr-omset-laundry").innerText = "Rp " + (s.omsetLaundry||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-omset-hotel").innerText = "Rp " + (s.omsetHotel||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-discounts").innerText = "-Rp " + (s.totalFree||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-cash-laundry").innerText = "Rp " + (s.cashLaundry||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-cash-hotel").innerText = "Rp " + (s.cashHotel||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-qris-laundry").innerText = "Rp " + (s.qrisLaundry||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-transfer-hotel").innerText = "Rp " + (s.transferHotel||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-exp-laundry").innerText = "Rp " + (s.expLaundry||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-exp-hotel").innerText = "Rp " + (s.expHotel||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-net-laundry").innerText = "Rp " + (s.netLaundry||0).toLocaleString('id-ID');
    document.getElementById("hist-sr-net-hotel").innerText = "Rp " + (s.netHotel||0).toLocaleString('id-ID');

    let foodHtml = "";
    if (typeof s.foodSummary === 'string') {
        let lines = s.foodSummary.split('\n');
        let currentLocBlock = "";

        lines.forEach(line => {
            if (line.startsWith("📍")) {
                // Tutup box lokasi sebelumnya jika ada
                if (currentLocBlock !== "") {
                    foodHtml += currentLocBlock + `</div>`;
                }
                // Buka box lokasi baru dengan style fluid yang sama seperti Open Shift
                currentLocBlock = `<div style="break-inside: avoid; margin-bottom: 12px; background: #f9f9f9; padding: 6px; border-radius: 6px; border: 1px solid #eee;">`;
                currentLocBlock += `<div style="font-weight:bold; color:#e67e22; border-bottom: 1px solid #ddd; padding-bottom: 2px;">${line}</div>`;
            } else if (line.startsWith("📁")) {
                currentLocBlock += `<div style="font-weight:bold; color:#7f8c8d; margin-top:6px; font-size:11px;">${line}</div>`;
            } else if (line.includes(":::")) {
                let parts = line.split(":::");
                currentLocBlock += `<div style="display:flex; justify-content:space-between; padding:2px 0; margin-left:10px;"><span>${parts[0].trim()}</span> <strong>${parts[1].trim()}x</strong></div>`;
            } else if (line.trim()) {
                currentLocBlock += `<div style="padding:2px 0; margin-left:10px;">${line}</div>`;
            }
        });

        // Pastikan box lokasi terakhir ditutup
        if (currentLocBlock !== "") {
            foodHtml += currentLocBlock + `</div>`;
        }
    }
    document.getElementById("hist-sr-items-summary").innerHTML = foodHtml || "Belum ada item terjual";
    
    let shiftModal = document.getElementById("shift-detail-modal");
    shiftModal.style.zIndex = "2000"; 
    shiftModal.classList.remove("hidden");
};

window.printShiftGlobal = async function(shiftId) {
    if (window.currentPrintMode === 'desktop') {
        window.printShiftStandard(shiftId);
        return;
    }

    let s = window.globalRecentShifts.find(x => x.shiftId === shiftId);
    if(!s) return;
    if (!btCharacteristic) return alert("⚠️ Printer belum terhubung!");
    await window.buildShiftReportReceipt(s);
};

// 3. CORE LOGIN FAST SYNC
window.attemptLogin = async function() {
    const pinInput = document.getElementById("cashier-pin"); const rawPin = pinInput.value.trim();
    if (!rawPin) return;
    let loginBtn = document.getElementById("btn-login");
    if(loginBtn) loginBtn.innerText = "Memverifikasi...";

    try {
        const hashedPin = await hashString(rawPin);
        let staff = await new Promise(res => db.transaction(["staff"], "readonly").objectStore("staff").get(hashedPin).onsuccess = e => res(e.target.result));
        
        if (!staff && navigator.onLine) {
            if(loginBtn) loginBtn.innerText = "Memverifikasi (Cepat)...";
            const response = await fetch(`${API_URL}?action=syncStaff&t=${Date.now()}`, { method: 'GET' });
            if (response.ok) {
                const result = await response.json();
                if (result.status === "Success" && result.data && result.data.staff) {
                    let txFast = db.transaction(["staff"], "readwrite");
                    txFast.objectStore("staff").clear();
                    result.data.staff.forEach(s => txFast.objectStore("staff").put(s)); 
                    await new Promise(r => txFast.oncomplete = r);
                    staff = result.data.staff.find(s => s.pin === hashedPin);
                }
            }
        }

        if (staff) {
            db.transaction(["active_shifts"], "readonly").objectStore("active_shifts").get(hashedPin).onsuccess = (shiftReq) => {
                const activeShift = shiftReq.target.result; currentCashier = staff.name; currentPin = hashedPin;
                if (activeShift) { currentShiftId = activeShift.shiftId; currentLoginTime = activeShift.loginTime; } 
                else {
                    currentShiftId = "SHF-" + Date.now(); currentLoginTime = new Date().toISOString(); 
                    db.transaction(["active_shifts"], "readwrite").objectStore("active_shifts").put({pin: hashedPin, shiftId: currentShiftId, loginTime: currentLoginTime, lastActiveTime: Date.now(), cashierName: currentCashier}); 
                }
                
                document.getElementById("login-screen").classList.add("hidden");
                document.getElementById("pos-screen").classList.remove("hidden");
                document.getElementById("display-cashier").innerText = currentCashier;
                
                window.switchWorkspace('new');
                
                db.transaction(["menu"], "readonly").objectStore("menu").getAll().onsuccess = (e) => {
                    globalMenuData = e.target.result || []; loadMenuUI();
                };
                window.lockMenu(); 

                if (navigator.onLine) {
                    setTimeout(() => { window.syncMasterData(); }, 1000);
                }
            };
        } else { alert("PIN Kasir Salah atau Belum Terdaftar!"); }
    } catch (err) { alert("Terjadi kesalahan sistem login."); console.error(err); } finally { 
        pinInput.value = ""; if(loginBtn) loginBtn.innerText = "Masuk / Buka Shift";
    }
};

window.switchWorkspace = function(type) {
    document.querySelectorAll('.ws-tab').forEach(b => b.classList.remove('active'));
    document.getElementById("main-workspace-wrapper").classList.add("hidden");
    document.getElementById("active-tickets-workspace").classList.add("hidden");
    
    let uWs = document.getElementById("unpaid-workspace");
    if(uWs) uWs.classList.add("hidden");
    
    if (type === 'new') {
        document.getElementById("tab-new-order").classList.add("active");
        document.getElementById("main-workspace-wrapper").classList.remove("hidden");
    } else if (type === 'tickets') {
        document.getElementById("tab-active-tickets").classList.add("active");
        document.getElementById("active-tickets-workspace").classList.remove("hidden");
        window.renderActiveTickets(); 
    } else if (type === 'unpaid') {
        document.getElementById("tab-unpaid-orders").classList.add("active");
        if(uWs) uWs.classList.remove("hidden");
        window.renderUnpaidOrders();
    }
};

window.lockScreen = function() { window.location.reload(); };

// 4. ANTREAN, KAMAR
window.switchAntrean = function(index) {
    if (currentAntreanIndex === index) return;
    antreans[currentAntreanIndex].cart = [...currentCart];
    antreans[currentAntreanIndex].isLocked = isMenuLocked;
    
    let ri = document.getElementById("room-input"); if (ri) antreans[currentAntreanIndex].room = ri.value;
    
    currentAntreanIndex = index;
    currentCart = [...antreans[currentAntreanIndex].cart]; 
    isMenuLocked = antreans[currentAntreanIndex].isLocked;
    
    
    if (ri) ri.value = antreans[currentAntreanIndex].room;
    
    window.updateTabLabels(); // <--- ADD THIS LINE HERE
    
    document.querySelectorAll(".antrean-btn").forEach((btn, i) => {

        if (i === index) { btn.classList.add("active"); btn.style.background = "#fff"; btn.style.color = "#2980b9"; } 
        else { btn.classList.remove("active"); btn.style.background = "#bdc3c7"; btn.style.color = "#fff"; }
    });

    let cis = document.getElementById("customer-input-section");
    let acb = document.getElementById("active-customer-banner");
    let gl = document.getElementById("glass-overlay");

    if (isMenuLocked) {
        if (cis) cis.classList.remove("hidden");
        if (acb) acb.classList.add("hidden");
        if (gl) { gl.style.opacity = "1"; gl.style.pointerEvents = "auto"; }
    } else {
        let roomDisp = antreans[currentAntreanIndex].room || "Tamu Umum";
        let acn = document.getElementById("active-room-display"); if (acn) acn.innerText = roomDisp;
        if (cis) cis.classList.add("hidden");
        if (acb) acb.classList.remove("hidden");
        if (gl) { gl.style.opacity = "0"; gl.style.pointerEvents = "none"; }
    }
    window.renderCart();
};

window.lockMenu = function() {
    isMenuLocked = true; 
    let cis = document.getElementById("customer-input-section"); if(cis) cis.classList.remove("hidden");
    let acb = document.getElementById("active-customer-banner"); if(acb) acb.classList.add("hidden");
    let gl = document.getElementById("glass-overlay"); if(gl) { gl.style.opacity = "1"; gl.style.pointerEvents = "auto"; }
    let ri = document.getElementById("room-input"); if(ri) ri.value = ""; 
    
    // ... existing code inside lockMenu
    currentCart = []; 
    antreans[currentAntreanIndex] = { cart: [], room: "", isLocked: true };
    
    window.updateTabLabels(); // <--- ADD THIS LINE HERE
    window.renderCart();
// ...
};

function proceedToUnlock(room) {
    let acn = document.getElementById("active-room-display"); if(acn) acn.innerText = room; 
    let cis = document.getElementById("customer-input-section"); if(cis) cis.classList.add("hidden");
    let acb = document.getElementById("active-customer-banner"); if(acb) acb.classList.remove("hidden");
    
    isMenuLocked = false; 
    let gl = document.getElementById("glass-overlay"); 
    if(gl) { gl.style.opacity = "0"; setTimeout(() => { gl.style.pointerEvents = "none"; }, 300); }
    
    antreans[currentAntreanIndex].isLocked = false; 
    antreans[currentAntreanIndex].room = room; 
    
    window.updateTabLabels(); // <--- ADD THIS LINE HERE
    window.renderCart();
// ...
}

window.unlockMenu = function(isGuest) {
    let room = "Tamu Umum";
    let ri = document.getElementById("room-input");
    
    if (isGuest) { 
        if(ri) ri.value = "";
        proceedToUnlock(room);
    } else { 
        room = ri ? ri.value.trim() : "";
        if (!room) return alert("Silakan ketik atau pilih nomor kamar terlebih dahulu.");
        proceedToUnlock(room);
    }
};

window.handleAutocomplete = function(e) {
    const val = e.target ? e.target.value.toLowerCase().trim() : ""; 
    const resBox = document.getElementById("autocomplete-results");
    if (!resBox) return;

    let matches = window.globalRoomList || [];
    if (val.length > 0) {
        matches = matches.filter(r => r.toLowerCase().includes(val));
    }
    
    if (matches.length > 0) {
        resBox.innerHTML = matches.map(r => `
            <div class="autocomplete-item" onmousedown="window.selectRoom('${r}')" style="padding: 12px 15px; border-bottom: 1px solid #eef2f3; cursor: pointer; text-align: left; background: #fff; font-size: 15px; z-index: 10000; position:relative;">
                <div style="font-weight: bold; color: #2980b9;">${r}</div>
            </div>`).join("");
        resBox.classList.remove("hidden"); resBox.style.display = "block";
    } else { 
        resBox.classList.add("hidden"); resBox.style.display = "none"; 
    }
};

window.selectRoom = function(room) {
    let ri = document.getElementById("room-input"); if(ri) ri.value = room;
    let rb = document.getElementById("autocomplete-results"); if(rb) { rb.classList.add("hidden"); rb.style.display = "none"; }
};

// 5. MENU & NUMPAD & TRANSAKSI (CART)
function loadMenuUI() {
    // 1. Setup Location (Layer 1)
    const locations = [...new Set(globalMenuData.map(i => i.location))]; 
    if (!currentLocation || !locations.includes(currentLocation)) currentLocation = locations[0];

    const locContainer = document.getElementById("location-container"); 
    if(locContainer) {
        locContainer.innerHTML = "";
        locations.forEach(loc => {
            const btn = document.createElement("button"); 
            btn.className = `cat-btn ${loc === currentLocation ? "active" : ""}`; 
            if(loc === currentLocation) {
                btn.style.background = "#fff";
                btn.style.color = "#2c3e50";
            } else {
                btn.style.background = "transparent";
                btn.style.color = "#bdc3c7";
            }
            btn.innerText = loc;
            btn.onclick = () => { 
                currentLocation = loc; 
                const availableCats = [...new Set(globalMenuData.filter(i => i.location === currentLocation).map(i => i.category))];
                currentCategory = availableCats[0];
                loadMenuUI();
            };
            locContainer.appendChild(btn);
        });
    }

    // 2. Setup Category (Layer 2)
    const filteredByLoc = globalMenuData.filter(i => i.location === currentLocation);
    const categories = [...new Set(filteredByLoc.map(i => i.category))]; 
    if (!currentCategory || !categories.includes(currentCategory)) currentCategory = categories[0];

    const catContainer = document.getElementById("category-container"); 
    if(catContainer) {
        catContainer.innerHTML = "";
        categories.forEach(cat => {
            const btn = document.createElement("button"); 
            btn.className = `cat-btn ${cat === currentCategory ? "active" : ""}`; 
            btn.innerText = cat;
            btn.onclick = () => { 
                currentCategory = cat; 
                document.querySelectorAll("#category-container .cat-btn").forEach(b => b.classList.remove("active")); 
                btn.classList.add("active"); 
                renderProductGrid(); 
            };
            catContainer.appendChild(btn);
        });
    }
    renderProductGrid();
}

function renderProductGrid() {
    const grid = document.getElementById("product-grid"); if(!grid) return;
    grid.innerHTML = "";
    globalMenuData.filter(i => i.location === currentLocation && i.category === currentCategory).forEach(item => {
        
        let cartItem = currentCart.find(i => i.itemId === item.itemId);
        let qtyInCart = cartItem ? cartItem.qty : 0;
        let stockRemaining = item.currentStock - qtyInCart;
        
        let isOutOfStock = item.trackStock && stockRemaining <= 0;
        
        const card = document.createElement("div"); 
        card.className = "product-card";
        if (isOutOfStock) card.style.opacity = "0.5"; 
        
        let stockLabel = item.trackStock ? `<div style="font-size:11px; color:#e74c3c; font-weight:bold; margin-top:5px;">Sisa Stok: ${stockRemaining}</div>` : "";

        card.innerHTML = `<div style="flex:1;"><h4 style="margin: 5px 0;">${item.name}</h4></div>
                          <div class="price-badge" style="${isOutOfStock ? 'background:#e74c3c; color:white;' : ''}">${isOutOfStock ? 'HABIS' : 'Rp ' + item.price.toLocaleString('id-ID')}</div>
                          ${stockLabel}`;
                          
        card.onclick = () => { 
            if(!isMenuLocked) { 
                if (isOutOfStock) return alert(`⚠️ Stok ${item.name} sudah habis!`);
                if (item.inputMode === "DECIMAL") window.openNumpad(item); 
                else window.addToCart(item, 1); 
            } 
        };
        grid.appendChild(card);
    });
}

window.openNumpad = function(item) { activeNumpadItem = item; numpadValue = "0"; let nd = document.getElementById("numpad-display"); if(nd) nd.innerText = "0"; let mod = document.getElementById("numpad-modal"); if(mod) mod.classList.remove("hidden"); };
window.closeNumpad = function() { let mod = document.getElementById("numpad-modal"); if(mod) mod.classList.add("hidden"); activeNumpadItem = null; };
window.numpadPress = function(val) {
    if (val === 'DEL') { numpadValue = numpadValue.slice(0, -1) || "0"; } else if (val === '.') { if (!numpadValue.includes('.')) numpadValue += '.'; } else { numpadValue = numpadValue === "0" ? String(val) : numpadValue + val; }
    let nd = document.getElementById("numpad-display"); if(nd) nd.innerText = numpadValue;
};
window.confirmNumpad = function() { let qty = parseFloat(numpadValue); if (qty > 0) window.addToCart(activeNumpadItem, qty); window.closeNumpad(); };

window.addToCart = function(item, qty) {
    let finalQty = qty;
    const existing = currentCart.find(i => i.itemId === item.itemId);
    
    if (!existing && item.hasMoq && item.moqQty > 0 && finalQty < item.moqQty) { 
        alert(`⚠️ Minimum Order (MOQ) untuk ${item.name} adalah ${item.moqQty}.\nJumlah otomatis disesuaikan.`); 
        finalQty = item.moqQty; 
    }
    
    if (item.trackStock && finalQty > item.currentStock) {
        alert(`⚠️ Stok tidak cukup! Sisa stok ${item.name} di sistem hanya: ${item.currentStock}`);
        return;
    }

    if (existing) { existing.qty += finalQty; } 
    else { currentCart.push({ ...item, qty: finalQty, originalPrice: item.price, workflow: item.workflow, trackStock: item.trackStock, currentStock: item.currentStock, hasMoq: item.hasMoq, moqQty: item.moqQty }); }
    
    window.renderCart();
    renderProductGrid(); 
};

window.updateCartItemQty = function(itemId, delta) {
    let existing = currentCart.find(i => i.itemId === itemId);
    if (existing) {
        if (delta > 0 && existing.trackStock && (existing.qty + delta) > existing.currentStock) {
            return alert(`⚠️ Stok maksimal tercapai! Sisa stok di sistem hanya: ${existing.currentStock}`);
        }

        existing.qty += delta;
        
        if (existing.hasMoq && existing.moqQty > 0) { 
            if (existing.qty > 0 && existing.qty < existing.moqQty) { 
                if (delta < 0) existing.qty = 0; 
                else existing.qty = existing.moqQty; 
            } 
        }
        
        if (existing.qty <= 0) currentCart = currentCart.filter(i => i.itemId !== itemId);
        
        window.renderCart();
        renderProductGrid(); 
    }
};

window.clearCart = function() {
    if (currentCart.length === 0) return alert("Keranjang sudah kosong!");
    if (confirm("Apakah Anda yakin ingin membatalkan order?")) { 
        currentCart = []; 
        window.renderCart(); 
        renderProductGrid(); 
    }
};

window.renderCart = function() {
    const container = document.getElementById("cart-items"); if(!container) return;
    container.innerHTML = ""; let total = 0;
    currentCart.forEach(item => {
        const lineTotal = item.qty * item.price; total += lineTotal; 
        const qtyDisplay = item.qty % 1 !== 0 ? item.qty.toFixed(2) : item.qty;
        container.innerHTML += `
        <div class="cart-item" style="display:flex; justify-content:space-between; align-items:center; padding:15px 0; border-bottom:1px solid #edf2f7; gap: 10px;">
            <div style="flex: 1;"><strong style="font-size: 16px; color: #2c3e50;">${item.name}</strong><br><small style="font-size: 13px; color: #7f8c8d;">Rp ${item.price.toLocaleString('id-ID')} x ${qtyDisplay}</small></div>
            <div style="display:flex; align-items:center; gap:12px; background: #f8f9fa; padding: 4px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <button onclick="window.updateCartItemQty('${item.itemId}', -1)" style="background:#e74c3c; color:white; border:none; width:45px; height:45px; border-radius:6px; font-weight:bold; font-size:22px; cursor:pointer;">-</button>
                <span style="font-size: 18px; font-weight: bold; min-width: 30px; text-align: center;">${qtyDisplay}</span>
                <button onclick="window.updateCartItemQty('${item.itemId}', 1)" style="background:#2ecc71; color:white; border:none; width:45px; height:45px; border-radius:6px; font-weight:bold; font-size:22px; cursor:pointer;">+</button>
            </div>
        </div>`;
    });
    let totalContainer = document.getElementById("cart-grand-total");
    if (totalContainer) totalContainer.innerText = `Rp ${total.toLocaleString('id-ID')}`;
    window.cartSubtotal = total; 
};

// SPLIT PAYMENT REVIEW
window.openReview = function() {
    if (currentCart.length === 0) return alert("Keranjang masih kosong!");
    let inputs = ["pay-qris", "pay-transfer", "pay-free"];
    inputs.forEach(id => { let el = document.getElementById(id); if(el) el.value = 0; });
    
    window.cartLaundryTotal = 0; window.cartHotelTotal = 0;
    currentCart.forEach(item => {
        let lineTotal = item.qty * item.price;
        if (item.location && item.location.toLowerCase().includes('laundry')) window.cartLaundryTotal += lineTotal;
        else window.cartHotelTotal += lineTotal;
    });

    window.cartSubtotal = window.cartLaundryTotal + window.cartHotelTotal;
    
    let rstL = document.getElementById("review-subtotal-laundry"); if(rstL) rstL.innerText = `Rp ${window.cartLaundryTotal.toLocaleString('id-ID')}`;
    let rstH = document.getElementById("review-subtotal-hotel"); if(rstH) rstH.innerText = `Rp ${window.cartHotelTotal.toLocaleString('id-ID')}`;

    // MENAMPILKAN ATAU MENYEMBUNYIKAN TOMBOL BAYAR NANTI
    let payLaterEnabled = window.globalSettings && String(window.globalSettings["Enable_Pay_Later"]).toUpperCase() === "TRUE";
    let btnPayLater = document.getElementById("btn-pay-later");
    if(btnPayLater) {
        if(payLaterEnabled) btnPayLater.classList.remove("hidden");
        else btnPayLater.classList.add("hidden");
    }

    window.calculateRemaining();
    let mod = document.getElementById("review-modal"); if(mod) mod.classList.remove("hidden");
};
window.closeReview = function() { let reviewModal = document.getElementById("review-modal"); if (reviewModal) { reviewModal.classList.add("hidden"); } };

window.calculateRemaining = function(manualCash = false) {
    let free = Number(document.getElementById("pay-free").value) || 0;
    let qris = Number(document.getElementById("pay-qris").value) || 0;
    let trans = Number(document.getElementById("pay-transfer").value) || 0;

    let remLaundry = Math.max(0, window.cartLaundryTotal - qris);
    let remHotel = Math.max(0, window.cartHotelTotal - trans);

    let discountLeft = free;
    if (remHotel >= discountLeft) {
        remHotel -= discountLeft;
    } else {
        discountLeft -= remHotel;
        remHotel = 0;
        remLaundry = Math.max(0, remLaundry - discountLeft);
    }

    let requiredCash = remLaundry + remHotel;
    window.cartGrandTotal = Math.max(0, window.cartSubtotal - free);
    
    let rgt = document.getElementById("review-grandtotal");
    if(rgt) rgt.innerText = `Rp ${window.cartGrandTotal.toLocaleString('id-ID')}`;

    if (!manualCash) {
        window.cashLaundryAmount = remLaundry;
        window.cashHotelAmount = remHotel;
        document.getElementById("pay-cash").value = requiredCash.toFixed(0);
    } else {
        let actualCash = Number(document.getElementById("pay-cash").value) || 0;
        if (actualCash >= requiredCash) {
            window.cashLaundryAmount = remLaundry;
            window.cashHotelAmount = remHotel + (actualCash - requiredCash);
        } else {
            if (actualCash >= remHotel) {
                window.cashHotelAmount = remHotel;
                window.cashLaundryAmount = actualCash - remHotel;
            } else {
                window.cashHotelAmount = actualCash;
                window.cashLaundryAmount = 0;
            }
        }
    }
};

window.triggerPayLater = function() {
    document.getElementById("pay-qris").value = 0;
    document.getElementById("pay-transfer").value = 0;
    document.getElementById("pay-cash").value = 0;
    window.calculateRemaining(true); 
    
    // Passing true as second parameter skips the prompt
    window.finalizeOrder(false, true); 
};

window.finalizeOrder = async function(shouldPrint, skipUnpaidPrompt = false) {
    window.calculateRemaining(true); 

    let cashL = window.cashLaundryAmount || 0; 
    let cashH = window.cashHotelAmount || 0;
    let qris = Number(document.getElementById("pay-qris").value) || 0;
    let transfer = Number(document.getElementById("pay-transfer").value) || 0;
    let free = Number(document.getElementById("pay-free").value) || 0;
    
    let totalPaid = cashL + cashH + qris + transfer; 
    let payLaterEnabled = window.globalSettings && String(window.globalSettings["Enable_Pay_Later"]).toUpperCase() !== "FALSE";

    if (Math.round(window.cartGrandTotal) > Math.round(totalPaid)) {
        if (!payLaterEnabled) {
            return alert("⚠️ Pembayaran Belum Cukup! (Fitur Kasbon dinonaktifkan di Settings)");
        } else if (!skipUnpaidPrompt) {
            if (!confirm("⚠️ Pembayaran KASBON terdeteksi.\nSisa hutang akan masuk ke tab 'Belum Lunas'. Lanjutkan?")) return;
        }
    }

    let roomNumber = antreans[currentAntreanIndex].room || "Tamu Umum";
    let hasTicketItem = currentCart.some(i => i.workflow === "TICKET");
    let finalStatus = hasTicketItem ? "Processing" : "Completed";

    const orderPayload = {
        orderId: "ORD-" + Date.now(), timestamp: new Date().toISOString(), cashier: currentCashier, shiftId: currentShiftId,
        roomNumber: roomNumber, orderStatus: finalStatus, items: currentCart, readableReceipt: currentCart.map(i => `${i.qty}x ${i.name}`).join('\n'),
        subtotal: window.cartSubtotal, discounts: free, grandTotal: window.cartGrandTotal,
        paymentMethod: "Split", cashLaundryAmount: cashL, cashHotelAmount: cashH, qrisAmount: qris, transferAmount: transfer, freeAmount: free, syncStatus: "Pending" 
    };

    db.transaction(["orders"], "readwrite").objectStore("orders").add(orderPayload);
    window.globalRecentOrders.unshift(orderPayload);
    
    if (finalStatus === "Processing") {
        window.activeLaundryTickets.push(orderPayload);
    }
    
    if (Math.round(window.cartGrandTotal) > Math.round(totalPaid)) {
        window.globalUnpaidOrders.unshift(orderPayload); 
    }

    // Di dalam finalizeOrder... cari blok if (shouldPrint ... )
    if (shouldPrint) {
        if (window.currentPrintMode === 'desktop') {
            window.globalRecentOrders.unshift(orderPayload); // Pastikan terbaca oleh router
            window.printOrderStandard(orderPayload.orderId);
        } else if (typeof window.buildEscPosReceipt === "function" && btCharacteristic) {
            await window.buildEscPosReceipt(orderPayload.orderId, orderPayload, totalPaid, window.cartGrandTotal - totalPaid, "Split");
        } else {
            alert("⚠️ Printer Bluetooth belum terhubung!");
        }
    }
    
    let mod = document.getElementById("review-modal"); if(mod) mod.classList.add("hidden");
    
    window.showToast("✅ Order berhasil disimpan!");
    
    window.lockMenu(); 
    window.renderProductGrid(); 
    window.extractUnpaidOrders(); 
    
    // UPDATE THE BADGE NUMBER HERE
    let tc = document.getElementById("ticket-count"); 
    if(tc) tc.innerText = window.activeLaundryTickets.length;
    
    window.runBackgroundSync();
};

window.renderActiveTickets = function() {
    try {
        const grid = document.getElementById("ticket-grid-container"); if(!grid) return;
        grid.innerHTML = "";
        if(!window.activeLaundryTickets || window.activeLaundryTickets.length === 0) {
            grid.innerHTML = `<p style="color:#7f8c8d;">Tidak ada layanan aktif saat ini.</p>`; return;
        }

        window.activeLaundryTickets.forEach((ticket) => {
            try {
                const isReady = ticket.orderStatus === "Ready for Pickup";
                const totalPaid = (Number(ticket.cashLaundryAmount)||0) + (Number(ticket.cashHotelAmount)||0) + (Number(ticket.qrisAmount)||0) + (Number(ticket.transferAmount)||0);
                const remaining = (Number(ticket.grandTotal)||0) - totalPaid;

                let receiptText = ticket.readableReceipt || "";
                if (!receiptText && Array.isArray(ticket.items)) {
                    receiptText = ticket.items.map(i => `${i.qty % 1 !== 0 ? i.qty.toFixed(2) : i.qty}x ${i.name}`).join('\n');
                }
                if (!receiptText) receiptText = "Rincian tidak tersedia";

                let buttonsHtml = "";
                if (!isReady) { 
                    buttonsHtml = `<button class="ticket-btn" style="background:#f39c12;" onclick="window.markTicketReady('${ticket.orderId}')">Tandai Selesai Diproses (Ready)</button>`; 
                } else { 
                    buttonsHtml = `<button class="ticket-btn" style="background:#2ecc71;" onclick="window.openSettlement('${ticket.orderId}', ${remaining})">Ambil Layanan & Pelunasan</button>`; 
                }
                
                let safeRemaining = Number(remaining) || 0;

                grid.innerHTML += `<div class="ticket-card ${isReady ? 'ready' : ''}">
                    <div class="ticket-header"><span>Kamar: ${ticket.roomNumber || '-'}</span> <span style="color:#7f8c8d; font-size:12px;">${ticket.orderId}</span></div>
                    <div style="font-size:14px; margin-bottom:10px; white-space:pre-wrap;">${receiptText}</div>
                    <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:10px; border-top:1px dashed #ddd; padding-top:5px;">
                        <span>Tagihan Sisa:</span> <strong style="color:#e74c3c;">Rp ${safeRemaining.toLocaleString('id-ID')}</strong>
                    </div>
                    ${buttonsHtml}
                </div>`;
            } catch(innerErr) { console.error("Error ticket item", innerErr); }
        });
    } catch(err) { console.error("Critical renderActiveTickets", err); }
};

window.markTicketReady = function(orderId) {
    if(confirm("Tandai pesanan ini selesai diproses dan siap diambil?")) {
        const ticket = activeLaundryTickets.find(t => t.orderId === orderId);
        if (ticket) {
            ticket.orderStatus = "Ready for Pickup"; ticket.syncStatus = "Pending";
            db.transaction(["orders"], "readwrite").objectStore("orders").put(ticket);
            window.renderActiveTickets(); window.runBackgroundSync();
        }
    }
};

window.openSettlement = function(orderId, remainingDue, isFromUnpaid = false) {
    activeSettlementTicket = window.globalRecentOrders.find(t => t.orderId === orderId);
    if(!activeSettlementTicket) activeSettlementTicket = activeLaundryTickets.find(t => t.orderId === orderId);
    if(!activeSettlementTicket) activeSettlementTicket = window.globalUnpaidOrders.find(t => t.orderId === orderId);
    if(!activeSettlementTicket) return alert("Order tidak ditemukan!");

    if (remainingDue <= 0) {
        if(confirm("Tagihan ini sudah LUNAS. Tandai selesai dan Ambil Layanan?")) {
            activeSettlementTicket.orderStatus = "Completed"; 
            activeSettlementTicket.syncStatus = "Pending";
            db.transaction(["orders"], "readwrite").objectStore("orders").put(activeSettlementTicket);
            activeLaundryTickets = activeLaundryTickets.filter(t => t.orderId !== activeSettlementTicket.orderId);
            window.renderActiveTickets(); 
            window.extractUnpaidOrders();
            window.runBackgroundSync();
            activeSettlementTicket = null;
        }
        return; 
    }
    
    let elAmt = document.getElementById("settle-amount"); if(elAmt) elAmt.innerText = `Rp ${remainingDue.toLocaleString('id-ID')}`;
    
    document.getElementById("settle-cash").value = remainingDue;
    document.getElementById("settle-qris").value = 0;
    document.getElementById("settle-transfer").value = 0;
    
    window.settlementMode = isFromUnpaid ? 'payOnly' : 'complete';
    document.getElementById("settlement-modal").classList.remove("hidden");
};

window.confirmSettlement = function() {
    if (!activeSettlementTicket) return;
    const cash = Number(document.getElementById("settle-cash").value) || 0; 
    const q = Number(document.getElementById("settle-qris").value) || 0; 
    const t = Number(document.getElementById("settle-transfer").value) || 0;
    
    // Kalkulasi subtotal Hotel vs Laundry berdasarkan riwayat item
    let cLTotal = 0; let cHTotal = 0;
    if (activeSettlementTicket.items && activeSettlementTicket.items.length > 0) {
        activeSettlementTicket.items.forEach(i => {
            let lt = i.qty * i.price;
            if(i.location && i.location.toLowerCase().includes('laundry')) cLTotal += lt;
            else cHTotal += lt;
        });
    } else if (activeSettlementTicket.readableReceipt) {
        let lines = activeSettlementTicket.readableReceipt.split('\n');
        lines.forEach(l => {
            let match = l.match(/\(Rp\s*([\d.]+)\)/);
            if(match) {
                let val = Number(match[1].replace(/\./g, ''));
                if(l.includes('[L]')) cLTotal += val;
                else cHTotal += val;
            }
        });
        if(cLTotal + cHTotal === 0) cHTotal = activeSettlementTicket.subtotal; 
    } else {
        cHTotal = activeSettlementTicket.subtotal; 
    }

    // Hitung sisa hutang spesifik per laci (termasuk potongan diskon)
    let remLaundry = Math.max(0, cLTotal - (activeSettlementTicket.cashLaundryAmount||0) - (activeSettlementTicket.qrisAmount||0));
    let remHotel = Math.max(0, cHTotal - (activeSettlementTicket.cashHotelAmount||0) - (activeSettlementTicket.transferAmount||0));

    let discountLeft = activeSettlementTicket.discounts || 0;
    if (remHotel >= discountLeft) { remHotel -= discountLeft; }
    else { discountLeft -= remHotel; remHotel = 0; remLaundry = Math.max(0, remLaundry - discountLeft); }

    // Hitung sisa hutang setelah bayar QRIS & Transfer barusan
    remLaundry = Math.max(0, remLaundry - q);
    remHotel = Math.max(0, remHotel - t);

    // Auto-split tunai yang diinput kasir
    let newCashL = 0; let newCashH = 0;
    if (cash >= (remLaundry + remHotel)) {
        newCashL = remLaundry;
        newCashH = remHotel + (cash - (remLaundry + remHotel));
    } else {
        if (cash >= remHotel) { newCashH = remHotel; newCashL = cash - remHotel; } 
        else { newCashH = cash; newCashL = 0; }
    }

    activeSettlementTicket.cashLaundryAmount = (activeSettlementTicket.cashLaundryAmount || 0) + newCashL;
    activeSettlementTicket.cashHotelAmount = (activeSettlementTicket.cashHotelAmount || 0) + newCashH;
    activeSettlementTicket.qrisAmount = (activeSettlementTicket.qrisAmount || 0) + q;
    activeSettlementTicket.transferAmount = (activeSettlementTicket.transferAmount || 0) + t;
    
    let totalPaidNow = activeSettlementTicket.cashHotelAmount + activeSettlementTicket.cashLaundryAmount + activeSettlementTicket.qrisAmount + activeSettlementTicket.transferAmount + (activeSettlementTicket.discounts||0);
    
    if (window.settlementMode === 'complete') {
        if (Math.round(activeSettlementTicket.grandTotal) > Math.round(totalPaidNow)) {
            alert("⚠️ Tagihan belum lunas sepenuhnya! Order tidak bisa diselesaikan hingga LUNAS.");
            return; 
        }
        activeSettlementTicket.orderStatus = "Completed"; 
        activeLaundryTickets = activeLaundryTickets.filter(tk => tk.orderId !== activeSettlementTicket.orderId);
    }
    
    activeSettlementTicket.syncStatus = "Pending";
    db.transaction(["orders"], "readwrite").objectStore("orders").put(activeSettlementTicket);
    
    let go = window.globalRecentOrders.find(o => o.orderId === activeSettlementTicket.orderId);
    if (go) Object.assign(go, activeSettlementTicket);

    let u = window.globalUnpaidOrders.find(o => o.orderId === activeSettlementTicket.orderId);
    if(u) Object.assign(u, activeSettlementTicket);

    document.getElementById("settlement-modal").classList.add("hidden"); 
    window.renderActiveTickets(); 
    window.extractUnpaidOrders();
    window.runBackgroundSync();
};

window.openExpenseModal = function() { 
    document.getElementById("expense-modal").classList.remove("hidden"); 
    const list = document.getElementById("expense-category-list");
    if(list) {
        list.innerHTML = "";
        db.transaction(["expense_categories"], "readonly").objectStore("expense_categories").getAll().onsuccess = (e) => {
            e.target.result.forEach(cat => { 
                const opt = document.createElement("option"); 
                opt.value = cat.name; 
                list.appendChild(opt); 
            });
        };
    }
};

window.saveExpense = function() {
    const amount = Number(document.getElementById("exp-amount").value); 
    const category = document.getElementById("exp-category").value.trim();
    const drawer = document.getElementById("exp-drawer").value;
    if (amount <= 0 || !category) return alert("Harap masukkan jumlah dan kategori yang benar.");
    
    db.transaction(["expense_categories"], "readwrite").objectStore("expense_categories").put({ name: category });

    const payload = { expenseId: "EXP-" + Date.now(), timestamp: new Date().toISOString(), cashier: currentCashier, shiftId: currentShiftId, drawer: drawer, category: category, description: document.getElementById("exp-desc").value || "-", amount: amount, status: "Active", syncStatus: "Pending" };
    db.transaction(["expenses"], "readwrite").objectStore("expenses").add(payload);
    
    document.getElementById("expense-modal").classList.add("hidden"); 
    document.getElementById("exp-amount").value = "";
    document.getElementById("exp-category").value = "";
    document.getElementById("exp-desc").value = "";
    alert("Pengeluaran Berhasil Dicatat!"); window.runBackgroundSync();
};

window.requestVoid = function(type, id) {
    currentVoidTarget = { type: type, id: id };
    document.getElementById("void-auth-modal").classList.remove("hidden");
};

window.submitVoidRequest = function() {
    let payload = { id: currentVoidTarget.id, type: currentVoidTarget.type, status: "Void Pending", syncStatus: "Pending" };
    db.transaction(["void_requests"], "readwrite").objectStore("void_requests").add(payload);
    
    document.getElementById("void-auth-modal").classList.add("hidden");
    alert("Permintaan pembatalan dikirim ke server. Menunggu persetujuan Admin.");
    window.runBackgroundSync();
    
    if(currentVoidTarget.type === 'orders') { let o = window.globalRecentOrders.find(x => x.orderId === currentVoidTarget.id); if(o) o.orderStatus = "Void Pending"; window.renderHistoryList('orders'); }
    if(currentVoidTarget.type === 'expenses') { let e = window.globalRecentExpenses.find(x => x.expenseId === currentVoidTarget.id); if(e) e.status = "Void Pending"; window.renderHistoryList('expenses'); }
    if(currentVoidTarget.type === 'shifts') { let s = window.globalRecentShifts.find(x => x.shiftId === currentVoidTarget.id); if(s) s.status = "Void Pending"; window.renderHistoryList('shifts'); }
};


window.openHistoryModal = function() { document.getElementById("history-modal").classList.remove("hidden"); window.renderHistoryList('orders'); };
window.renderHistoryList = function(type) {
    const container = document.getElementById("history-container"); 
    if(!container) return;
    container.innerHTML = "";
    
    if (type === 'orders') {
        const ordersToDisplay = window.globalRecentOrders || [];
        if(ordersToDisplay.length === 0) return container.innerHTML = `<div style="padding:20px; text-align:center;">Belum ada histori order di server.</div>`;
        
        ordersToDisplay.forEach(o => {
            let badge = o.orderStatus === "Voided" ? `<span class="status-badge status-voided">Dibatalkan</span>` : o.orderStatus === "Void Pending" ? `<span class="status-badge status-pending">Menunggu Admin</span>` : `<span class="status-badge status-paid">${o.orderStatus}</span>`;
            let btnBatal = (o.orderStatus !== "Voided" && o.orderStatus !== "Void Pending") ? `<button onclick="requestVoid('orders', '${o.orderId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #e74c3c; background:#f8d7da; color:#721c24;">❌ Batal</button>` : '';

            container.innerHTML += `<div class="history-row">
                <div><strong>Kamar: ${o.roomNumber}</strong><br><small style="color:#7f8c8d;">${formatTimeOnlyWIB(o.timestamp)} | Rp ${o.grandTotal.toLocaleString('id-ID')} | Kasir: ${o.cashier}</small></div>
                <div style="display:flex; align-items:center; gap:8px;">${badge}
                    ${btnBatal}
                    <button onclick="viewOrderDetailsGlobal('${o.orderId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #ddd; background:#fff;">👁️ Detail</button>
                    <button onclick="printOrderGlobal('${o.orderId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #ddd; background:#fff;">🖨️ Cetak</button>
                </div></div>`;
        });
        
    } else if (type === 'expenses') {
        const expensesToDisplay = window.globalRecentExpenses || [];
        if(expensesToDisplay.length === 0) return container.innerHTML = `<div style="padding:20px; text-align:center;">Belum ada pengeluaran dicatat di server.</div>`;
        
        expensesToDisplay.forEach(exp => {
            let badge = exp.status === "Voided" ? `<span class="status-badge status-voided">Dibatalkan</span>` : exp.status === "Void Pending" ? `<span class="status-badge status-pending">Menunggu Admin</span>` : `<span class="status-badge status-paid">Aktif</span>`;
            let btnBatal = (exp.status !== "Voided" && exp.status !== "Void Pending") ? `<button onclick="requestVoid('expenses', '${exp.expenseId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #e74c3c; background:#f8d7da; color:#721c24;">❌ Batal</button>` : '';

            container.innerHTML += `<div class="history-row">
                <div><strong>[${exp.drawer}] ${exp.category}</strong><br><small style="color:#7f8c8d;">${formatTimeOnlyWIB(exp.timestamp)} | Rp ${exp.amount.toLocaleString('id-ID')} | Kasir: ${exp.cashier}</small><br><small>${exp.description}</small></div>
                <div style="display:flex; align-items:center; gap:10px;">${badge}
                    ${btnBatal}
                    <button onclick="viewExpenseDetailsGlobal('${exp.expenseId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #ddd; background:#fff;">👁️ Detail</button>
                    <button onclick="printExpenseGlobal('${exp.expenseId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #ddd; background:#fff;">🖨️ Cetak</button>
                </div></div>`;
        });
        
        } else if (type === 'shifts') {
        const shiftsToDisplay = window.globalRecentShifts || [];
        if(shiftsToDisplay.length === 0) { return container.innerHTML = `<div style="padding:20px; text-align:center;">Belum ada histori shift di sistem server.</div>`; }
        
        shiftsToDisplay.slice(0, 20).forEach(s => {
            let badge = s.status === "Voided" ? `<span class="status-badge status-voided">Dibatalkan</span>` : s.status === "Void Pending" ? `<span class="status-badge status-pending">Menunggu Admin</span>` : ``;
            let btnBatal = (s.status !== "Voided" && s.status !== "Void Pending") ? `<button onclick="requestVoid('shifts', '${s.shiftId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #e74c3c; background:#f8d7da; color:#721c24; margin-right:5px;">❌ Batal</button>` : '';

            // ✅ PISAHKAN OMSET HOTEL & LAUNDRY DI SINI
            container.innerHTML += `<div class="history-row" style="align-items:flex-start;">
                <div><strong>Shift: ${s.shiftId}</strong><br><small style="color:#7f8c8d;">Kasir: ${s.cashier} | Keluar: ${formatWIB(s.logoutTime)}</small><br>${badge}</div>
                <div style="display:flex; text-align:right; align-items:center;">
                    <div style="margin-right:15px; text-align:right; font-size:13px; border-right:2px solid #eee; padding-right:15px;">
                        <div style="color:#e67e22; margin-bottom:4px;"><strong>Hotel:</strong> Rp ${(s.omsetHotel || 0).toLocaleString('id-ID')}</div>
                        <div style="color:#2980b9;"><strong>Lndry:</strong> Rp ${(s.omsetLaundry || 0).toLocaleString('id-ID')}</div>
                    </div>
                    ${btnBatal}
                    <button onclick="viewShiftDetailsGlobal('${s.shiftId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #ddd; background:#fff; margin-right:5px;">👁️ Detail</button>
                    <button onclick="printShiftGlobal('${s.shiftId}')" style="padding:6px; font-size:12px; cursor:pointer; border-radius:4px; border:1px solid #ddd; background:#fff;">🖨️ Cetak</button>
                </div></div>`;
        });
        
    } else if (type === 'cashflow') {
        let ledgerLaundry = [];
        let ledgerHotel = [];
        
        // 1. Ambil Pemasukan dari Transaksi (Pisahkan Laundry & Hotel)
        (window.globalRecentOrders || []).forEach(o => {
            if (o.orderStatus !== "Voided" && o.orderStatus !== "Void Pending") {
                let cashL = o.cashLaundryAmount || 0;
                let qrisL = o.qrisAmount || 0;
                if (cashL + qrisL > 0) {
                    ledgerLaundry.push({
                        timestamp: new Date(o.timestamp).getTime(), dateStr: o.timestamp, type: "IN",
                        title: `Penjualan (${o.roomNumber})`,
                        desc: `Cash: ${cashL.toLocaleString('id-ID')} | QRIS: ${qrisL.toLocaleString('id-ID')}`, 
                        amount: cashL + qrisL, cashier: o.cashier
                    });
                }
                
                let cashH = o.cashHotelAmount || 0;
                let transferH = o.transferAmount || 0;
                if (cashH + transferH > 0) {
                    ledgerHotel.push({
                        timestamp: new Date(o.timestamp).getTime(), dateStr: o.timestamp, type: "IN",
                        title: `Penjualan (${o.roomNumber})`,
                        desc: `Cash: ${cashH.toLocaleString('id-ID')} | Trf: ${transferH.toLocaleString('id-ID')}`, 
                        amount: cashH + transferH, cashier: o.cashier
                    });
                }
            }
        });

        // 2. Ambil Pengeluaran Laci
        (window.globalRecentExpenses || []).forEach(e => {
            if (e.status !== "Voided" && e.status !== "Void Pending") {
                let entry = {
                    timestamp: new Date(e.timestamp).getTime(), dateStr: e.timestamp, type: "OUT",
                    title: `Pengeluaran [${e.drawer}]`,
                    desc: `${e.category} - ${e.description}`, amount: e.amount, cashier: e.cashier
                };
                if (String(e.drawer).toLowerCase().includes("laundry")) ledgerLaundry.push(entry);
                else ledgerHotel.push(entry);
            }
        });

        // 3. Ambil Setoran/Tarik Uang
        (window.globalRecentDrops || []).forEach(d => {
            let entry = {
                timestamp: new Date(d.timestamp).getTime(), dateStr: d.timestamp, type: "OUT",
                title: `Tarik Uang [${d.drawer}]`,
                desc: d.notes || "-", amount: d.amount, cashier: d.cashier
            };
            if (String(d.drawer).toLowerCase().includes("laundry")) ledgerLaundry.push(entry);
            else ledgerHotel.push(entry);
        });

        // Urutkan dari yang terbaru ke terlama
        ledgerLaundry.sort((a, b) => b.timestamp - a.timestamp);
        ledgerHotel.sort((a, b) => b.timestamp - a.timestamp);
        
        // Kalkulasi Netto Masing-Masing Laci
        let inL = 0; let outL = 0;
        ledgerLaundry.forEach(i => i.type === 'IN' ? inL += i.amount : outL += i.amount);
        
        let inH = 0; let outH = 0;
        ledgerHotel.forEach(i => i.type === 'IN' ? inH += i.amount : outH += i.amount);

        // Template HTML untuk List
        let buildLedgerHTML = (ledgerData) => {
            if(ledgerData.length === 0) return `<div style="text-align:center; padding:10px; color:#7f8c8d;">Belum ada arus kas.</div>`;
            let r = "";
            ledgerData.forEach(item => {
                let color = item.type === 'IN' ? '#27ae60' : '#c0392b';
                let prefix = item.type === 'IN' ? '+' : '-';
                r += `<div class="history-row" style="align-items: center; border-left: 4px solid ${color}; margin-bottom:5px; padding: 10px;">
                    <div style="flex:1;">
                        <strong style="font-size:13px; color:#2c3e50;">${item.title}</strong><br>
                        <small style="color:#7f8c8d;">${formatTimeOnlyWIB(item.dateStr)} | Ksr: ${item.cashier}</small><br>
                        <small style="color:#34495e;">${item.desc}</small>
                    </div>
                    <div style="text-align: right;">
                        <strong style="color: ${color}; font-size: 14px;">${prefix} ${item.amount.toLocaleString('id-ID')}</strong>
                    </div>
                </div>`;
            });
            return r;
        };

        // Render 2 Kolom Bersebelahan
        let html = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom: 10px;">
            <div style="background:#fff; border:1px solid #ddd; border-radius:8px; padding:10px;">
                <h3 style="margin-top:0; color:#2980b9; text-align:center; border-bottom:2px solid #eee; padding-bottom:5px;">LACI LAUNDRY</h3>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;"><span>Masuk:</span> <strong style="color:#27ae60;">Rp ${inL.toLocaleString('id-ID')}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;"><span>Keluar:</span> <strong style="color:#c0392b;">Rp ${outL.toLocaleString('id-ID')}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:10px; border-top:1px dashed #ccc; padding-top:5px;"><span>Netto:</span> <strong>Rp ${(inL - outL).toLocaleString('id-ID')}</strong></div>
                <div style="max-height: 400px; overflow-y:auto; padding-right:5px;">${buildLedgerHTML(ledgerLaundry)}</div>
            </div>
            <div style="background:#fff; border:1px solid #ddd; border-radius:8px; padding:10px;">
                <h3 style="margin-top:0; color:#e67e22; text-align:center; border-bottom:2px solid #eee; padding-bottom:5px;">LACI HOTEL</h3>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;"><span>Masuk:</span> <strong style="color:#27ae60;">Rp ${inH.toLocaleString('id-ID')}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;"><span>Keluar:</span> <strong style="color:#c0392b;">Rp ${outH.toLocaleString('id-ID')}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:10px; border-top:1px dashed #ccc; padding-top:5px;"><span>Netto:</span> <strong>Rp ${(inH - outH).toLocaleString('id-ID')}</strong></div>
                <div style="max-height: 400px; overflow-y:auto; padding-right:5px;">${buildLedgerHTML(ledgerHotel)}</div>
            </div>
        </div>`;
        container.innerHTML = html;
    }
};

window.openCashDrop = function() { document.getElementById("cash-drop-modal").classList.remove("hidden"); };
window.submitCashDrop = function() {
    const amount = Number(document.getElementById("drop-amount").value) || 0;
    const drawer = document.getElementById("drop-drawer").value;
    if (amount <= 0) return alert("Masukkan nominal setor uang.");
    
    const payload = { dropId: "DRP-" + Date.now(), timestamp: new Date().toISOString(), cashier: currentCashier, shiftId: currentShiftId, drawer: drawer, amount: amount, notes: document.getElementById("drop-notes").value || "-", syncStatus: "Pending" };
    db.transaction(["cash_drops"], "readwrite").objectStore("cash_drops").add(payload);
    
    document.getElementById("cash-drop-modal").classList.add("hidden"); alert("Setoran berhasil dicatat!"); window.runBackgroundSync();
};

// Membuka modal dan mereset semua field
window.openEmergencyInbound = function() {
    let trackableItems = globalMenuData.filter(m => m.trackStock);
    let locs = [...new Set(trackableItems.map(m => m.location))];
    
    let locHtml = `<option value="">-- Pilih Lokasi --</option>`;
    locs.sort().forEach(l => locHtml += `<option value="${l}">${l}</option>`);
    
    document.getElementById("em-inbound-loc").innerHTML = locHtml;
    document.getElementById("em-inbound-cat").innerHTML = `<option value="">-- Pilih Kategori --</option>`;
    
    document.getElementById("em-inbound-item").value = "";
    document.getElementById("em-inbound-item-list").innerHTML = "";
    
    document.getElementById("em-inbound-qty").value = 1;
    document.getElementById("em-inbound-price").value = 0;
    document.getElementById("em-inbound-notes").value = "";
    document.getElementById("em-inbound-total-text").innerText = "Rp 0";
    
    document.getElementById("emergency-inbound-modal").classList.remove("hidden");
};

window.filterEmInboundCat = function() {
    let selLoc = document.getElementById("em-inbound-loc").value;
    let trackableItems = globalMenuData.filter(m => m.trackStock && m.location === selLoc);
    let cats = [...new Set(trackableItems.map(m => m.category))];
    
    let catHtml = `<option value="">-- Pilih Kategori --</option>`;
    cats.sort().forEach(c => catHtml += `<option value="${c}">${c}</option>`);
    
    document.getElementById("em-inbound-cat").innerHTML = catHtml;
    
    document.getElementById("em-inbound-item").value = "";
    document.getElementById("em-inbound-item-list").innerHTML = "";
};

window.filterEmInboundItem = function() {
    let selLoc = document.getElementById("em-inbound-loc").value;
    let selCat = document.getElementById("em-inbound-cat").value;
    
    let items = globalMenuData.filter(m => m.trackStock && m.location === selLoc && m.category === selCat);
    
    let itemHtml = ``;
    items.sort((a,b) => a.name.localeCompare(b.name)).forEach(i => {
        itemHtml += `<option value="${i.name}">Sisa Stok: ${i.currentStock}</option>`;
    });
    
    document.getElementById("em-inbound-item-list").innerHTML = itemHtml;
    document.getElementById("em-inbound-item").value = "";
};

window.calcEmTotal = function() {
    let qty = Number(document.getElementById("em-inbound-qty").value) || 0;
    let price = Number(document.getElementById("em-inbound-price").value) || 0;
    document.getElementById("em-inbound-total-text").innerText = "Rp " + (qty * price).toLocaleString('id-ID');
};

window.submitEmergencyInbound = async function() {
    let itemName = document.getElementById("em-inbound-item").value;
    let qty = Number(document.getElementById("em-inbound-qty").value);
    let unitPrice = Number(document.getElementById("em-inbound-price").value) || 0;
    let notes = document.getElementById("em-inbound-notes").value;

    if (!itemName || qty <= 0) return alert("⚠️ Harap pilih item dan masukkan jumlah yang valid!");

    let payload = {
        action: "emergencyInbound",
        data: {
            inboundId: "INB-EMG-" + Date.now(), // ID Unik
            timestamp: new Date().toISOString(),
            itemName: itemName,
            qty: qty,
            unitPrice: unitPrice,
            notes: notes,
            cashier: currentCashier
        }
    };

    // ✅ FIX: Hapus "window." agar tidak error "undefined"
    let menuItem = globalMenuData.find(m => m.name === itemName);
    if(menuItem) menuItem.currentStock += qty;
    window.renderProductGrid(); 

    document.getElementById("emergency-inbound-modal").classList.add("hidden");
    if (typeof window.showToast === 'function') window.showToast("⏳ Mengirim Data Inbound...");

    try {
        const response = await fetch(`${API_URL}?action=emergencyInbound`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.status === "Success") {
            if (typeof window.showToast === 'function') window.showToast("✅ Stok Darurat Berhasil Ditambah!");
            window.syncMasterData(); 
        } else throw new Error(result.message);
    } catch(e) {
        alert("⚠️ Gagal mengirim inbound: " + e);
        // Rollback jika gagal
        if(menuItem) menuItem.currentStock -= qty; 
        window.renderProductGrid();
    }
};

window.syncMasterData = async function(forceAwait = false) {
    let nTxt = document.getElementById("network-text"); let nDot = document.getElementById("network-dot");
    if (!navigator.onLine) { if(nTxt) nTxt.innerText = "Mode Offline"; if(nDot) nDot.style.backgroundColor = "#e74c3c"; return; }
    try {
        const response = await fetch(`${API_URL}?t=${Date.now()}`, { method: 'GET', headers: { 'Accept': 'application/json' } }); 
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        
        if (result.status === "Success") {
            window.masterDrawerBalanceLaundry = result.masterDrawerBalanceLaundry || 0;
            window.masterDrawerBalanceHotel = result.masterDrawerBalanceHotel || 0;
            window.globalRecentOrders = result.data.recentOrders || [];
            window.globalRecentExpenses = result.data.recentExpenses || [];
            window.globalRecentDrops = result.data.recentDrops || [];
            window.globalRecentShifts = result.recentShifts || [];
            window.globalPendingInbounds = result.data.pendingInbounds || [];
            
            window.globalSettings = result.data.settings || {};
            let payLaterEnabled = String(window.globalSettings["Enable_Pay_Later"]).toUpperCase() !== "FALSE";
            let hasUnpaid = window.globalUnpaidOrders && window.globalUnpaidOrders.length > 0;
            let tabUnpaid = document.getElementById("tab-unpaid-orders");
            
            if(tabUnpaid) {
                // Tampilkan tab JIKA fitur diaktifkan ATAU ada pelanggan yang masih menunggak
                if(payLaterEnabled || hasUnpaid) tabUnpaid.classList.remove("hidden");
                else tabUnpaid.classList.add("hidden");
            }

            window.globalRoomList = (result.data.settings["Room_List"] || "").split(",").map(r => r.trim()).filter(r => r);

            // ✅ FIX: Extract unsynced local orders to merge with server orders
            let localOrders = await new Promise(res => db.transaction(["orders"], "readonly").objectStore("orders").getAll().onsuccess = e => res(e.target.result));
            let pendingOrders = localOrders.filter(o => o.syncStatus === "Pending");

            let p1 = new Promise((resolve) => {
                let txFast = db.transaction(["staff", "menu", "expense_categories"], "readwrite");
                txFast.objectStore("staff").clear(); result.data.staff.forEach(s => txFast.objectStore("staff").put(s));
                txFast.objectStore("menu").clear(); result.data.menu.forEach(m => txFast.objectStore("menu").put(m));
                
                txFast.objectStore("expense_categories").clear();
                if (result.data.expenseCategories) {
                    result.data.expenseCategories.forEach(c => txFast.objectStore("expense_categories").put({name: c}));
                }

                txFast.oncomplete = () => {
                    globalMenuData = result.data.menu; 
                    
                    let serverActive = result.data.activeLaundryOrders || [];
                    pendingOrders.forEach(po => {
                        if (po.orderStatus === "Processing" || po.orderStatus === "Ready for Pickup") {
                            if (!serverActive.find(s => s.orderId === po.orderId)) serverActive.unshift(po);
                        }
                    });
                    window.activeLaundryTickets = serverActive;

                    let serverUnpaid = result.data.unpaidOrders || [];
                    pendingOrders.forEach(po => {
                        let totalPaid = (po.cashLaundryAmount||0) + (po.cashHotelAmount||0) + (po.qrisAmount||0) + (po.transferAmount||0);
                        if (Math.round(po.grandTotal) > Math.round(totalPaid) && po.orderStatus !== "Voided" && po.orderStatus !== "Void Pending") {
                            if (!serverUnpaid.find(s => s.orderId === po.orderId)) serverUnpaid.unshift(po);
                        }
                    });
                    window.globalUnpaidOrders = serverUnpaid;

                    // ✅ UPDATE THE BADGE NUMBER HERE
                    let tc = document.getElementById("ticket-count"); 
                    if(tc) tc.innerText = window.activeLaundryTickets.length;
                    
                    if (!document.getElementById("pos-screen").classList.contains("hidden")) { 
                        loadMenuUI(); 
                        window.renderActiveTickets();
                        window.extractUnpaidOrders();
                    }
                    if(nTxt) nTxt.innerText = "Online & Sinkron"; if(nDot) nDot.style.backgroundColor = "#2ecc71"; resolve();
                };
            });
            if(forceAwait) await p1; 
        }
    } catch (e) { if(nTxt) nTxt.innerText = "Gagal Sinkron"; if(nDot) nDot.style.backgroundColor = "#e74c3c"; }
};

window.extractUnpaidOrders = function() {
    window.activeUnpaidOrders = window.globalUnpaidOrders.filter(o => {
        if(o.orderStatus === "Voided" || o.orderStatus === "Void Pending") return false;
        // Total Paid explicitly ignores discount/free, because discounts lower the grandTotal directly.
        let totalPaid = (o.cashLaundryAmount||0) + (o.cashHotelAmount||0) + (o.qrisAmount||0) + (o.transferAmount||0);
        return Math.round(o.grandTotal) > Math.round(totalPaid);
    });
    
    let uc = document.getElementById("unpaid-count");
    if(uc) uc.innerText = window.activeUnpaidOrders.length;
    
    let uWs = document.getElementById("unpaid-workspace");
    if (uWs && !uWs.classList.contains("hidden")) window.renderUnpaidOrders();
};

window.renderUnpaidOrders = function() {
    try {
        const grid = document.getElementById("unpaid-grid-container"); if(!grid) return;
        grid.innerHTML = "";
        if(!window.activeUnpaidOrders || window.activeUnpaidOrders.length === 0) {
            grid.innerHTML = `<p style="color:#7f8c8d;">Tidak ada tagihan tertunggak.</p>`; return;
        }

        window.activeUnpaidOrders.forEach((order) => {
            try {
                let paid = (Number(order.cashLaundryAmount)||0) + (Number(order.cashHotelAmount)||0) + (Number(order.qrisAmount)||0) + (Number(order.transferAmount)||0);
                const remaining = (Number(order.grandTotal)||0) - paid;

                let receiptText = order.readableReceipt || "";
                if (!receiptText && Array.isArray(order.items)) {
                    receiptText = order.items.map(i => `${i.qty % 1 !== 0 ? i.qty.toFixed(2) : i.qty}x ${i.name}`).join('\n');
                }
                if (!receiptText) receiptText = "Rincian tidak tersedia";

                let buttonsHtml = `<button class="ticket-btn" style="background:#e74c3c;" onclick="window.openSettlement('${order.orderId}', ${remaining}, true)">💰 Lunasi / Cicil Tagihan</button>`;
                
                let safeRemaining = Number(remaining) || 0;

                grid.innerHTML += `<div class="ticket-card" style="border-left-color: #e74c3c;">
                    <div class="ticket-header"><span>Kamar: ${order.roomNumber || '-'}</span> <span style="color:#7f8c8d; font-size:12px;">${order.orderId}</span></div>
                    <div style="font-size:14px; margin-bottom:10px; white-space:pre-wrap;">${receiptText}</div>
                    <div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:10px; border-top:1px dashed #ddd; padding-top:5px;">
                        <span>Kekurangan:</span> <strong style="color:#e74c3c;">Rp ${safeRemaining.toLocaleString('id-ID')}</strong>
                    </div>
                    ${buttonsHtml}
                </div>`;
            } catch(innerErr) { console.error("Error unpaid item", innerErr); }
        });
    } catch(err) { console.error("Critical renderUnpaidOrders", err); }
};

window.manualPushSync = async function() { 
    let btn = document.querySelector("button[onclick*='manualPushSync']") || document.getElementById("btn-sync");
    let originalText = btn ? btn.innerHTML : "Sync";
    
    if (btn) btn.innerHTML = "⏳ Syncing...";
    
    await window.runBackgroundSync(); 
    await window.syncMasterData(true); 
    
    if (btn) btn.innerHTML = originalText;
    alert("Sinkronisasi Database Berhasil!"); 
};

window.runBackgroundSync = async function() {
    if (!navigator.onLine || isSyncing) return; 
    isSyncing = true; 
    try {
        // Fungsi helper cerdas untuk memproses setiap antrean data
        const syncItem = async (storeName, actionName, idField, deleteOnSuccess = false) => {
            let items = await new Promise(res => db.transaction([storeName], "readonly").objectStore(storeName).getAll().onsuccess = e => res(e.target.result));
            
            for (const item of items) {
                // Proses jika statusnya Pending ATAU jika ini tipe data yang harus dihapus setelah dikirim
                if (item.syncStatus === "Pending" || deleteOnSuccess) { 
                    try {
                        let r = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: actionName, data: item }) });
                        let resData = await r.json();
                        
                        // HANYA tandai selesai JIKA server menjawab "Success"
                        if (resData.status === "Success") {
                            if (deleteOnSuccess) {
                                db.transaction([storeName], "readwrite").objectStore(storeName).delete(item[idField]);
                            } else {
                                item.syncStatus = "Synced"; 
                                db.transaction([storeName], "readwrite").objectStore(storeName).put(item); 
                            }
                        }
                    } catch(e) {
                        console.error("Gagal sinkronisasi antrean:", storeName, e);
                    }
                }
            }
        };

        // Eksekusi semua antrean secara berurutan
        await syncItem("orders", "syncOrder", "orderId");
        await syncItem("expenses", "syncExpense", "expenseId");
        await syncItem("cash_drops", "syncCashDrop", "dropId", true);
        await syncItem("shift_reports", "syncShiftReport", "shiftId", true);
        await syncItem("void_requests", "requestVoid", "id", true);
        await syncItem("stock_inbounds", "confirmInbound", "inboundId", true);
        await syncItem("stock_opnames", "syncOpname", "opnameId", true);

    } finally { 
        isSyncing = false; 
    }
};

// ==========================================
// STOCK INBOUND (BATCH CONFIRMATION)
// ==========================================
window.openInboundModal = function() {
    const container = document.getElementById("inbound-list-container");
    container.innerHTML = "";
    if (!window.globalPendingInbounds || window.globalPendingInbounds.length === 0) {
        container.innerHTML = `<div style="padding:20px; text-align:center; color:#7f8c8d;">Tidak ada pengiriman stok yang tertunda.</div>`;
    } else {
        window.globalPendingInbounds.forEach((inb, index) => {
            // Hilangkan tombol Terima individual
            container.innerHTML += `
            <div class="history-row" style="margin-bottom:10px; border-radius:6px; border:1px solid #eee; padding:15px;">
                <div style="flex:1;">
                    <strong style="color:#2980b9; font-size:16px;">${inb.itemName}</strong><br>
                    <small style="color:#7f8c8d;">Dari: ${inb.sender} | Dikirim: ${inb.qtySent}</small><br>
                    <small style="color:#e67e22;">Catatan: ${inb.notes || "-"}</small>
                </div>
                <div style="display:flex; align-items:center; gap:10px; background:#f4f7f6; padding:8px; border-radius:8px;">
                    <button onclick="adjInbQty(${index}, -1)" style="padding:8px 12px; background:#e74c3c; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">-</button>
                    <input type="number" id="inb-qty-${index}" value="${inb.qtySent}" style="width:60px; text-align:center; padding:8px; border:1px solid #ccc; border-radius:4px; font-weight:bold;">
                    <button onclick="adjInbQty(${index}, 1)" style="padding:8px 12px; background:#2ecc71; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">+</button>
                </div>
            </div>`;
        });
        
        // Tambahkan Tombol Batch "Konfirmasi Semua" di bagian bawah list
        container.innerHTML += `
        <div style="text-align: right; margin-top: 15px;">
            <button onclick="window.submitBatchInbound()" style="padding:12px 20px; background:#e67e22; color:white; border:none; border-radius:8px; font-weight:bold; font-size:15px; cursor:pointer;">
                ✅ Konfirmasi Semua Item
            </button>
        </div>`;
    }
    document.getElementById("inbound-modal").classList.remove("hidden");
};

window.adjInbQty = function(index, delta) {
    let input = document.getElementById(`inb-qty-${index}`);
    let current = Number(input.value) || 0;
    input.value = Math.max(0, current + delta);
};

window.submitBatchInbound = function() {
    if (!window.globalPendingInbounds || window.globalPendingInbounds.length === 0) return;

    let hasDiscrepancy = false;
    let batchData = [];

    // 1. Kumpulkan data dan deteksi selisih
    window.globalPendingInbounds.forEach((inb, index) => {
        let actualQty = Number(document.getElementById(`inb-qty-${index}`).value) || 0;
        if (actualQty !== Number(inb.qtySent)) hasDiscrepancy = true;

        batchData.push({
            inboundId: inb.inboundId,
            itemName: inb.itemName,
            qtySent: inb.qtySent,
            qtyReceived: actualQty,
            cashier: currentCashier,
            syncStatus: "Pending"
        });
    });

    // 2. Minta konfirmasi dari kasir
    if (hasDiscrepancy) {
        if(!confirm("⚠️ Terdapat SELISIH jumlah antara barang yang dikirim Admin dan yang Anda terima.\n\nItem yang berselisih akan ditandai dan membutuhkan Otorisasi Admin di Spreadsheet. Tetap konfirmasi semua?")) {
            return; // Batal submit jika kasir menolak
        }
    } else {
        if(!confirm("Konfirmasi penerimaan semua barang ini?")) return;
    }

    // 3. Simpan ke Antrean Lokal & Update Memori UI
    batchData.forEach(payload => {
        db.transaction(["stock_inbounds"], "readwrite").objectStore("stock_inbounds").add(payload);

        // Jika tidak ada selisih, stok langsung ditambah di UI kasir (optimistic update)
        if (payload.qtyReceived === Number(payload.qtySent)) {
            let mItem = globalMenuData.find(m => m.name === payload.itemName);
            if(mItem) mItem.currentStock += payload.qtyReceived;
        }
    });

    // 4. BERSUHKAN MEMORI secara instan agar list benar-benar kosong!
    window.globalPendingInbounds = [];
    document.getElementById("inbound-modal").classList.add("hidden");

    // 5. Update UI & Kirim Sinkronisasi
    window.renderProductGrid();
    window.runBackgroundSync();

    if (typeof window.showToast === 'function') window.showToast("✅ Konfirmasi Berhasil Tersimpan!");
};

// ==========================================
// STOCK OPNAME (TABULAR)
// ==========================================
window.openOpnameModal = function() {
    const container = document.getElementById("opname-list-container");
    let trackableItems = globalMenuData.filter(m => m.trackStock);
    
    trackableItems.sort((a, b) => {
        if (a.location !== b.location) return a.location.localeCompare(b.location);
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
    });

    const locs = [...new Set(trackableItems.map(m => m.location))];
    const cats = [...new Set(trackableItems.map(m => m.category))];
    
    let locHtml = `<option value="">Semua Lokasi</option>`;
    locs.forEach(l => locHtml += `<option value="${l}">${l}</option>`);
    document.getElementById("opname-filter-loc").innerHTML = locHtml;

    let catHtml = `<option value="">Semua Kategori</option>`;
    cats.forEach(c => catHtml += `<option value="${c}">${c}</option>`);
    document.getElementById("opname-filter-cat").innerHTML = catHtml;
    
    document.getElementById("opname-search").value = "";

    if (trackableItems.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 20px; color:#7f8c8d;">Tidak ada item yang dilacak stoknya.</div>`;
    } else {
        let html = `<table style="width:100%; border-collapse: collapse; font-size: 13px;">
            <thead>
                <tr style="background: #2c3e50; color: white; text-align: left;">
                    <th style="padding: 10px; border-radius: 6px 0 0 0;">Lokasi & Kategori</th>
                    <th style="padding: 10px;">Nama Item</th>
                    <th style="padding: 10px; text-align: center;">Sistem</th>
                    <th style="padding: 10px; text-align: center;">Fisik</th>
                    <th style="padding: 10px; border-radius: 0 6px 0 0;">Catatan</th>
                </tr>
            </thead>
            <tbody>`;
        
        trackableItems.forEach((m, index) => {
            html += `
                <tr class="opname-row" data-loc="${m.location}" data-cat="${m.category}" data-name="${m.name.toLowerCase()}" style="border-bottom: 1px solid #ddd; background: ${index % 2 === 0 ? '#fff' : '#fcfcfc'};">
                    <td style="padding: 10px; color: #7f8c8d; font-size:11px;">${m.location} <br> <strong>${m.category}</strong></td>
                    <td style="padding: 10px; color: #2980b9; font-weight: bold;">${m.name}</td>
                    <td style="padding: 10px; text-align: center; font-weight: bold;">${m.currentStock}</td>
                    <td style="padding: 10px; text-align: center;">
                        <input type="number" id="opn-qty-${m.itemId}" placeholder="${m.currentStock}" style="width: 70px; padding: 6px; text-align: center; border: 1px solid #bdc3c7; border-radius: 4px; font-weight: bold;">
                    </td>
                    <td style="padding: 10px;">
                        <input type="text" id="opn-note-${m.itemId}" placeholder="Catatan..." style="width: 100%; padding: 6px; border: 1px solid #bdc3c7; border-radius: 4px;">
                    </td>
                </tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }
    
    window.filterOpnameList();
    document.getElementById("opname-modal").classList.remove("hidden");
};

window.filterOpnameList = function() {
    let locFilter = document.getElementById("opname-filter-loc").value;
    let catFilter = document.getElementById("opname-filter-cat").value;
    let search = document.getElementById("opname-search").value.toLowerCase();
    
    let rows = document.querySelectorAll(".opname-row");
    rows.forEach(row => {
        let rLoc = row.getAttribute("data-loc");
        let rCat = row.getAttribute("data-cat");
        let rName = row.getAttribute("data-name");
        
        let show = true;
        if (locFilter && rLoc !== locFilter) show = false;
        if (catFilter && rCat !== catFilter) show = false;
        if (search && !rName.includes(search)) show = false;
        
        row.style.display = show ? "" : "none";
    });
};

window.submitOpname = function() {
    let trackableItems = globalMenuData.filter(m => m.trackStock);
    let changesMade = 0;
    
    trackableItems.forEach((m) => {
        let qtyEl = document.getElementById(`opn-qty-${m.itemId}`);
        let noteEl = document.getElementById(`opn-note-${m.itemId}`);
        
        if (qtyEl && qtyEl.value !== "") {
            let physStock = Number(qtyEl.value);
            let diff = physStock - m.currentStock;
            let note = noteEl ? noteEl.value.trim() : "";
            if (!note) note = "-";
            
            if (diff !== 0) {
                let payload = { 
                    opnameId: "OPN-" + Date.now() + "-" + m.itemId, timestamp: new Date().toISOString(), cashier: currentCashier, 
                    itemName: m.name, systemStock: m.currentStock, physicalStock: physStock, difference: diff, notes: note, syncStatus: "Pending" 
                };
                
                db.transaction(["stock_opnames"], "readwrite").objectStore("stock_opnames").add(payload);
                m.currentStock = physStock; // Optimistic update: langsung ubah di layar kasir
                changesMade++;
            }
        }
    });
    
    if (changesMade === 0) return alert("Tidak ada perubahan stok fisik yang dimasukkan.");
    
    document.getElementById("opname-modal").classList.add("hidden");
    
    // Tampilkan Notifikasi Sistem "Pending Auth"
    if (typeof window.showToast === 'function') {
        window.showToast(`✅ ${changesMade} Laporan Opname dicatat! Menunggu Auth Admin.`);
    } else {
        alert(`✅ ${changesMade} Laporan Opname dicatat! Status: Menunggu Auth Admin.`);
    }
    
    window.renderProductGrid();
    window.runBackgroundSync();
};

window.openShiftReport = async function() {
    if (!db || !currentShiftId) return alert("Anda belum membuka shift kasir.");
    
    let btn = document.getElementById("btn-shift-top");
    let originalText = btn ? btn.innerText : "📊 Shift";
    if (btn) btn.innerText = "⏳ Sinkronisasi...";
    
    // GUARANTEE DRAWER ACCURACY: Push local changes, pull exact Setting numbers
    await window.runBackgroundSync();
    await window.syncMasterData(true);
    
    if (btn) btn.innerText = originalText;

    let activeOrders = await new Promise(res => db.transaction(["orders"], "readonly").objectStore("orders").getAll().onsuccess = e => res(e.target.result));
    let activeExpenses = await new Promise(res => db.transaction(["expenses"], "readonly").objectStore("expenses").getAll().onsuccess = e => res(e.target.result));
    let activeDrops = await new Promise(res => db.transaction(["cash_drops"], "readonly").objectStore("cash_drops").getAll().onsuccess = e => res(e.target.result));

    let shiftOrders = activeOrders.filter(o => o.shiftId === currentShiftId && o.orderStatus !== "Voided" && o.orderStatus !== "Void Pending");
    let shiftExpenses = activeExpenses.filter(e => e.shiftId === currentShiftId && e.status !== "Voided" && e.status !== "Void Pending");
    let shiftDrops = activeDrops.filter(d => d.shiftId === currentShiftId);
    
    let tOrders = 0; let tFree = 0; let omsetL = 0; let omsetH = 0; let cashL = 0; let cashH = 0; let qrisL = 0; let transferH = 0;
    let foodSummary = {};
    
    shiftOrders.forEach(o => {
        tOrders++; tFree += (o.discounts || 0);
        cashL += (o.cashLaundryAmount || 0); cashH += (o.cashHotelAmount || 0);
        qrisL += (o.qrisAmount || 0); transferH += (o.transferAmount || 0);
        
        let orderOmsetL = 0; let orderOmsetH = 0;
        if (o.items) o.items.forEach(i => { 
            let lineTotal = i.qty * i.price;
            if(i.location && i.location.toLowerCase().includes('laundry')) orderOmsetL += lineTotal;
            else orderOmsetH += lineTotal;
            
            let loc = i.location || "Lainnya"; let cat = i.category || "Lainnya";
            if(!foodSummary[loc]) foodSummary[loc] = {};
            if(!foodSummary[loc][cat]) foodSummary[loc][cat] = {};
            foodSummary[loc][cat][i.name] = (foodSummary[loc][cat][i.name] || 0) + i.qty;
        });
        omsetL += orderOmsetL; omsetH += orderOmsetH;
    });

    let expL = 0; let expH = 0;
    shiftExpenses.forEach(e => {
        if (e.drawer === 'Laundry') expL += e.amount;
        else expH += e.amount;
    });
    
    let dropL = 0; let dropH = 0;
    shiftDrops.forEach(d => {
        if (d.drawer === 'Laundry') dropL += d.amount;
        else dropH += d.amount;
    });

    // Uang fisik aktual = Cash Masuk - Expense - Uang Ditarik ke Admin/Bank
    let netL = cashL - expL - dropL;
    let netH = cashH - expH - dropH;

    window.currentShiftData = { 
        shiftId: currentShiftId, loginTime: currentLoginTime, logoutTime: new Date().toISOString(), cashier: currentCashier, 
        totalOrders: tOrders, totalFree: tFree, omsetLaundry: omsetL, omsetHotel: omsetH,
        cashLaundry: cashL, cashHotel: cashH, qrisLaundry: qrisL, transferHotel: transferH,
        expLaundry: expL, expHotel: expH, dropLaundry: dropL, dropHotel: dropH,
        netLaundry: netL, netHotel: netH, foodSummary: foodSummary
    };
    
    if (document.getElementById("sr-orders")) document.getElementById("sr-orders").innerText = tOrders;
    if (document.getElementById("sr-omset-laundry")) document.getElementById("sr-omset-laundry").innerText = "Rp " + omsetL.toLocaleString('id-ID');
    if (document.getElementById("sr-omset-hotel")) document.getElementById("sr-omset-hotel").innerText = "Rp " + omsetH.toLocaleString('id-ID');
    if (document.getElementById("sr-discounts")) document.getElementById("sr-discounts").innerText = "-Rp " + tFree.toLocaleString('id-ID');
    
    if (document.getElementById("sr-cash-laundry")) document.getElementById("sr-cash-laundry").innerText = "Rp " + cashL.toLocaleString('id-ID');
    if (document.getElementById("sr-cash-hotel")) document.getElementById("sr-cash-hotel").innerText = "Rp " + cashH.toLocaleString('id-ID');
    if (document.getElementById("sr-qris-laundry")) document.getElementById("sr-qris-laundry").innerText = "Rp " + qrisL.toLocaleString('id-ID');
    if (document.getElementById("sr-transfer-hotel")) document.getElementById("sr-transfer-hotel").innerText = "Rp " + transferH.toLocaleString('id-ID');

    if (document.getElementById("sr-exp-laundry")) document.getElementById("sr-exp-laundry").innerText = "Rp " + (expL + dropL).toLocaleString('id-ID');
    if (document.getElementById("sr-exp-hotel")) document.getElementById("sr-exp-hotel").innerText = "Rp " + (expH + dropH).toLocaleString('id-ID');

    // 👉 PERFECT SYNC UI: We pull EXACTLY what the Google Sheet Settings says
    if (document.getElementById("sr-net-laundry")) document.getElementById("sr-net-laundry").innerText = "Rp " + window.masterDrawerBalanceLaundry.toLocaleString('id-ID');
    if (document.getElementById("sr-net-hotel")) document.getElementById("sr-net-hotel").innerText = "Rp " + window.masterDrawerBalanceHotel.toLocaleString('id-ID');

    let foodHtml = "";
    for (const [locName, categories] of Object.entries(foodSummary)) {
        foodHtml += `<div style="break-inside: avoid; margin-bottom: 12px; background: #f9f9f9; padding: 6px; border-radius: 6px; border: 1px solid #eee;">`;
        foodHtml += `<div style="font-weight:bold; color:#e67e22; border-bottom: 1px solid #ddd; padding-bottom: 2px;">📍 ${locName}</div>`;
        for (const [catName, items] of Object.entries(categories)) {
            foodHtml += `<div style="font-weight:bold; color:#7f8c8d; margin-top:6px; font-size:11px;">📁 ${catName}</div>`;
            for (const [name, qty] of Object.entries(items)) {
                let qtyStr = (qty % 1 !== 0) ? Number(qty).toFixed(2) : qty;
                foodHtml += `<div style="display:flex; justify-content:space-between; padding:2px 0; margin-left:10px;"><span>${name}</span> <strong>${qtyStr}x</strong></div>`;
            }
        }
        foodHtml += `</div>`;
    }
    if (document.getElementById("sr-items-summary")) document.getElementById("sr-items-summary").innerHTML = foodHtml || "Belum ada item terjual";

    const endBtn = document.getElementById("btn-end-shift");
    if(endBtn) endBtn.classList.remove("hidden");

    document.getElementById("shift-report-modal").classList.remove("hidden");
};

window.printCurrentShiftReport = async function() {
    const data = window.currentShiftData;
    if (!data) return alert("Data ringkasan shift tidak tersedia untuk dicetak.");
    if (!btCharacteristic) {
        alert("⚠️ Printer belum terhubung. Silakan nyalakan bluetooth dan klik tombol 'Printer: Offline' di menu atas.");
        return;
    }
    try {
        await window.buildShiftReportReceipt(data);
        alert("Laporan penutupan shift berhasil dikirim ke printer!");
    } catch (e) { alert("Gagal mencetak laporan: " + e.toString()); }
};

window.triggerEndShift = async function(isAutoClose = false) {
    const data = window.currentShiftData; if (!data) return alert("Gagal mengambil data shift kasir.");
    
    if (!isAutoClose) {
        if (!confirm("Apakah Anda yakin ingin MENGAKHIRI SHIFT?")) return;
        
        if (!btCharacteristic) {
            alert("⚠️ Printer belum terhubung! Laporan Penutupan Shift batal dicetak, namun Shift TETAP BERHASIL DITUTUP dan akan direkam ke sistem.");
        } else {
            try { await window.buildShiftReportReceipt(data); } 
            catch (e) { alert("⚠️ Gagal mencetak laporan ke printer (" + e.toString() + "). Namun Shift TETAP BERHASIL DITUTUP dan akan direkam ke sistem."); }
        }
    }
    
    let tx = db.transaction(["local_shift_history", "shift_reports", "active_shifts"], "readwrite");
    tx.objectStore("local_shift_history").add(data); tx.objectStore("shift_reports").add(data);
    tx.objectStore("active_shifts").delete(currentPin);
    
    tx.oncomplete = async () => {
        let mod = document.getElementById("shift-report-modal");
        if(mod) mod.classList.add("hidden");
        await window.runBackgroundSync(); 
        
        if(isAutoClose) alert("Sistem logout otomatis karena tidak ada aktivitas selama 6 jam. Laporan shift telah disimpan.");
        window.location.reload(); 
    };
};

let idleTime = 0;
function resetIdleTimer() { idleTime = 0; }

window.onload = async () => { 
    await initDB(); 
    window.syncMasterData(); 
    
    // Listen for activity to reset idle timer
    document.addEventListener("mousemove", resetIdleTimer);
    document.addEventListener("keypress", resetIdleTimer);
    document.addEventListener("touchstart", resetIdleTimer);

    document.addEventListener("mousedown", function(e) {
        let resBox = document.getElementById('autocomplete-results');
        if (resBox && !e.target.closest('#autocomplete-results') && e.target.id !== 'room-input') { 
            resBox.classList.add('hidden'); resBox.style.display = "none"; 
        }
    });

    window.setInterval(window.runBackgroundSync, 5000); 
    window.setInterval(window.syncMasterData, 30000); 
    
    // AUTO LOGOUT LOGIC (Checks every 30 seconds)
    window.setInterval(async () => {
        if (!currentShiftId) return; // Not logged in
        idleTime += 30; // Add 30 seconds

        // 6 Hours = 21600 seconds
        if (idleTime >= 21600) {
            let activeOrders = await new Promise(res => db.transaction(["orders"], "readonly").objectStore("orders").getAll().onsuccess = e => res(e.target.result));
            let shiftOrders = activeOrders.filter(o => o.shiftId === currentShiftId);
            
            let shiftStartTime = new Date(currentLoginTime).getTime();
            let shiftDurationMinutes = (Date.now() - shiftStartTime) / 1000 / 60;

            // Ghost Shift Rule: < 5 minutes AND 0 orders
            if (shiftOrders.length === 0 && shiftDurationMinutes < 5) {
                db.transaction(["active_shifts"], "readwrite").objectStore("active_shifts").delete(currentPin);
                alert("Sistem mendeteksi shift kosong. Logout otomatis.");
                window.location.reload();
            } else {
                // Legitimate Shift: Auto-End & Report
                await window.openShiftReport();
                // Force close without printing
                window.triggerEndShift(true); 
            }
        }
    }, 30000);
};
