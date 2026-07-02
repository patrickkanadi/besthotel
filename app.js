const API_URL = "https://script.google.com/macros/s/AKfycbykTybIX-9YVGytTKeCBbDdpU9ihP3lbYFaAEBJQA0iE7uaPpI7Te1U568pZdTian_-mw/exec"; // REPLACE THIS
const DB_NAME = "Hotel_POS";
const DB_VERSION = 2; 
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
window.masterDrawerBalance = 0; let isLoggingOut = false; let currentVoidTarget = { type: null, id: null };
let isMenuLocked = true; let isSyncing = false;
window.enableDrawerTracking = true;

window.globalRoomList = [];
window.globalRecentOrders = [];
window.globalRecentExpenses = [];
window.globalRecentShifts = [];

let btDevice = null; let btCharacteristic = null;
window.lastActivityWrite = Date.now();

// 1. INIT DB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
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
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(db); };
        request.onerror = (e) => { reject(e); };
    });
}

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

// 3. CORE LOGIN FAST SYNC
window.attemptLogin = async function() {
    const pinInput = document.getElementById("cashier-pin"); const rawPin = pinInput.value.trim();
    if (!rawPin) return;
    let loginBtn = document.getElementById("btn-login");
    if(loginBtn) loginBtn.innerText = "Memverifikasi...";

    try {
        const hashedPin = await hashString(rawPin);
        let staff = await new Promise(res => db.transaction(["staff"], "readonly").objectStore("staff").get(hashedPin).onsuccess = e => res(e.target.result));
        
// 🚀 FAST SYNC LOGIC: Only pull the Staff PINs to get you in instantly
        if (!staff && navigator.onLine) {
            if(loginBtn) loginBtn.innerText = "Memverifikasi PIN (Cepat)...";
            const response = await fetch(`${API_URL}?action=syncStaff&t=${Date.now()}`, { method: 'GET' });
            if (response.ok) {
                const result = await response.json();
                if (result.status === "Success" && result.data && result.data.staff) {
                    let txFast = db.transaction(["staff"], "readwrite");
                    txFast.objectStore("staff").clear();
                    
                    // CHANGED TO .put() TO PREVENT CRASHES FROM DUPLICATE PINS
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
                
                // Load menu UI from whatever is currently stored locally
                db.transaction(["menu"], "readonly").objectStore("menu").getAll().onsuccess = (e) => {
                    globalMenuData = e.target.result || []; loadMenuUI();
                };
                window.lockMenu(); 
                
                // Trigger the heavy menu download silently in the background
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
    if (type === 'new') {
        document.getElementById("tab-new-order").classList.add("active");
        document.getElementById("main-workspace-wrapper").classList.remove("hidden");
    } else {
        document.getElementById("tab-active-tickets").classList.add("active");
        document.getElementById("active-tickets-workspace").classList.remove("hidden");
        window.renderActiveTickets(); 
    }
};
window.lockScreen = function() { window.location.reload(); };

// 4. ANTREAN, PELANGGAN, KAMAR
window.switchAntrean = function(index) {
    if (currentAntreanIndex === index) return;
    antreans[currentAntreanIndex].cart = [...currentCart];
    antreans[currentAntreanIndex].isLocked = isMenuLocked;
    
    let ri = document.getElementById("room-input"); if (ri) antreans[currentAntreanIndex].room = ri.value;
    
    currentAntreanIndex = index;
    currentCart = [...antreans[currentAntreanIndex].cart]; 
    isMenuLocked = antreans[currentAntreanIndex].isLocked;
    
    if (ri) ri.value = antreans[currentAntreanIndex].room;

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
        let roomDisp = antreans[currentAntreanIndex].room || "Tanpa Kamar";
        let acn = document.getElementById("active-room-display"); if (acn) acn.innerText = roomDisp;
        if (cis) cis.classList.add("hidden");
        if (acb) acb.classList.remove("hidden");
        if (gl) { gl.style.opacity = "0"; gl.style.pointerEvents = "none"; }
    }
    window.renderCart();
};

window.lockMenu = function() {
    isMenuLocked = true; 
    let pf = document.getElementById("pay-free"); if (pf) { if(pf.tagName === 'INPUT') pf.value = 0; else pf.innerText = 0; }
    let cis = document.getElementById("customer-input-section"); if(cis) cis.classList.remove("hidden");
    let acb = document.getElementById("active-customer-banner"); if(acb) acb.classList.add("hidden");
    let gl = document.getElementById("glass-overlay"); if(gl) { gl.style.opacity = "1"; gl.style.pointerEvents = "auto"; }
    let ri = document.getElementById("room-input"); if(ri) ri.value = ""; 
    
    currentCart = []; 
    antreans[currentAntreanIndex] = { cart: [], room: "", isLocked: true };
    window.renderCart();
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
    window.renderCart();
}

window.unlockMenu = function(isGuest) {
    let room = "Tanpa Kamar";
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

    if (val.length === 0) {
        resBox.classList.add("hidden"); resBox.style.display = "none";
        return;
    }

    let matches = window.globalRoomList.filter(r => r.toLowerCase().includes(val));
    
    if (matches.length > 0) {
        resBox.innerHTML = matches.map(r => `
            <div class="autocomplete-item" onmousedown="window.selectRoom('${r}')" style="padding: 12px 15px; border-bottom: 1px solid #eef2f3; cursor: pointer; text-align: left; background: #fff; font-size: 15px; z-index: 10000; position:relative;">
                <div style="font-weight: bold; color: #2980b9;">🚪 Kamar ${r}</div>
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
        const card = document.createElement("div"); card.className = "product-card";
        card.innerHTML = `<div><h4>${item.name}</h4></div><div class="price-badge">Rp ${item.price.toLocaleString('id-ID')}</div>`;
        card.onclick = () => { if(!isMenuLocked) { if(item.inputMode === "DECIMAL") window.openNumpad(item); else window.addToCart(item, 1); } };
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
    const existing = currentCart.find(i => i.itemId === item.itemId);
    if (existing) { existing.qty += qty; } else { currentCart.push({ ...item, qty: qty, originalPrice: item.price }); }
    window.renderCart();
};

window.updateCartItemQty = function(itemId, delta) {
    let existing = currentCart.find(i => i.itemId === itemId);
    if (existing) {
        existing.qty += delta;
        if (existing.qty <= 0) currentCart = currentCart.filter(i => i.itemId !== itemId);
        window.renderCart();
    }
};

window.clearCart = function() {
    if (currentCart.length === 0) return alert("Keranjang sudah kosong!");
    if (confirm("Apakah Anda yakin ingin membatalkan order?")) { currentCart = []; window.renderCart(); }
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
    window.cartSubtotal = total; window.cartGrandTotal = total;
};

window.openReview = function() {
    if (currentCart.length === 0) return alert("Keranjang masih kosong!");
    let inputs = ["pay-cash", "pay-qris", "pay-transfer"];
    inputs.forEach(id => { let el = document.getElementById(id); if(el && el.tagName === 'INPUT') el.value = 0; });
    let pf = document.getElementById("pay-free"); if(pf) { if(pf.tagName === 'INPUT') pf.value = 0; else pf.innerText = 0; }
    
    window.cartSubtotal = currentCart.reduce((sum, item) => sum + (item.qty * item.price), 0);
    window.cartGrandTotal = window.cartSubtotal;
    
    let rst = document.getElementById("review-subtotal"); if(rst) rst.innerText = `Rp ${window.cartSubtotal.toLocaleString('id-ID')}`;
    let rgt = document.getElementById("review-grandtotal"); if(rgt) rgt.innerText = `Rp ${window.cartGrandTotal.toLocaleString('id-ID')}`;
    window.applyPromo();
    let mod = document.getElementById("review-modal"); if(mod) mod.classList.remove("hidden");
};
window.closeReview = function() { let reviewModal = document.getElementById("review-modal"); if (reviewModal) { reviewModal.classList.add("hidden"); } };

window.calculateRemaining = function() {
    let pc = document.getElementById("pay-cash"); let c = pc ? Number(pc.value) : 0;
    let elQ = document.getElementById("pay-qris"); let q = elQ ? Number(elQ.value) : 0;
    let elT = document.getElementById("pay-transfer"); let t = elT ? Number(elT.value) : 0;
    let pf = document.getElementById("pay-free"); let f = pf ? Number(pf.value) : 0;
    
    window.cartGrandTotal = Math.max(0, window.cartSubtotal - f);
    let rgt = document.getElementById("review-grandtotal");
    if(rgt) rgt.innerText = `Rp ${window.cartGrandTotal.toLocaleString('id-ID')}`;

    const totalAccounted = c + q + t; 
    const remaining = Math.max(0, window.cartGrandTotal - totalAccounted);
    let rr = document.getElementById("review-remaining");
    if(rr) rr.innerText = `Rp ${remaining.toLocaleString('id-ID')}`;
};
window.applyPromo = window.calculateRemaining;

window.finalizeOrder = async function(shouldPrint) {
    let pc = document.getElementById("pay-cash"); let cash = pc ? Number(pc.value) : 0;
    let elQ = document.getElementById("pay-qris"); let qris = elQ ? Number(elQ.value) : 0;
    let elT = document.getElementById("pay-transfer"); let transfer = elT ? Number(elT.value) : 0;
    let pf = document.getElementById("pay-free"); let free = pf ? Number(pf.value) : 0;
    
    if ((window.cartGrandTotal - (cash + qris + transfer)) > 0) return alert("⚠️ Pembayaran Belum Cukup!");

    let roomNumber = antreans[currentAntreanIndex].room || "Tanpa Kamar";
    let finalStatus = "Completed"; 

    const orderPayload = {
        orderId: "ORD-" + Date.now(), timestamp: new Date().toISOString(), cashier: currentCashier, shiftId: currentShiftId,
        roomNumber: roomNumber, orderStatus: finalStatus, items: currentCart, subtotal: window.cartSubtotal, discounts: free, grandTotal: window.cartGrandTotal,
        paymentMethod: "Split", cashAmount: cash, qrisAmount: qris, transferAmount: transfer, freeAmount: free, syncStatus: "Pending" 
    };

    db.transaction(["orders"], "readwrite").objectStore("orders").add(orderPayload);
    
    if (shouldPrint && typeof window.buildEscPosReceipt === "function") {
        await window.buildEscPosReceipt(orderPayload.orderId, orderPayload, (cash + qris + transfer), 0, "Split");
    }
    
    let mod = document.getElementById("review-modal"); if(mod) mod.classList.add("hidden");
    window.lockMenu(); renderProductGrid(); window.runBackgroundSync();
};

window.renderActiveTickets = function() {
    const grid = document.getElementById("ticket-grid-container"); if(!grid) return;
    grid.innerHTML = "";
    activeLaundryTickets.forEach((ticket) => {
        const totalPaid = (ticket.cashAmount||0) + (ticket.qrisAmount||0) + (ticket.transferAmount||0) + (ticket.freeAmount||0);
        const remaining = ticket.grandTotal - totalPaid;
        let receiptText = ticket.items.map(i => `${i.qty % 1 !== 0 ? i.qty.toFixed(2) : i.qty}x ${i.name}`).join('\n');
        
        let buttonsHtml = `<button class="ticket-btn" style="background:#2ecc71;" onclick="window.openSettlement('${ticket.orderId}', ${remaining})">Pelunasan Tagihan</button>`;
        grid.innerHTML += `<div class="ticket-card"><div class="ticket-header"><span>Kamar: ${ticket.roomNumber}</span> <span style="color:#7f8c8d; font-size:12px;">${ticket.orderId}</span></div><div style="font-size:14px; margin-bottom:10px; white-space:pre-wrap;">${receiptText}</div><div style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:10px; border-top:1px dashed #ddd; padding-top:5px;"><span>Tagihan Sisa:</span> <strong style="color:#e74c3c;">Rp ${remaining.toLocaleString('id-ID')}</strong></div>${buttonsHtml}</div>`;
    });
};

window.openSettlement = function(orderId, remainingDue) {
    activeSettlementTicket = activeLaundryTickets.find(t => t.orderId === orderId);
    if (remainingDue <= 0) {
        if(confirm("Tagihan ini sudah LUNAS. Tandai selesai?")) {
            activeSettlementTicket.orderStatus = "Completed"; 
            activeSettlementTicket.syncStatus = "Pending";
            db.transaction(["orders"], "readwrite").objectStore("orders").put(activeSettlementTicket);
            activeLaundryTickets = activeLaundryTickets.filter(t => t.orderId !== activeSettlementTicket.orderId);
            window.renderActiveTickets(); window.runBackgroundSync();
            activeSettlementTicket = null;
        }
        return; 
    }
    let elAmt = document.getElementById("settle-amount"); if(elAmt) elAmt.innerText = `Rp ${remainingDue.toLocaleString('id-ID')}`;
    let elCash = document.getElementById("settle-cash"); if(elCash) elCash.value = remainingDue;
    document.getElementById("settlement-modal").classList.remove("hidden");
};

window.confirmSettlement = function() {
    if (!activeSettlementTicket) return;
    const c = Number(document.getElementById("settle-cash").value) || 0; const q = Number(document.getElementById("settle-qris").value) || 0; const t = Number(document.getElementById("settle-transfer").value) || 0;
    activeSettlementTicket.cashAmount += c; activeSettlementTicket.qrisAmount += q; activeSettlementTicket.transferAmount += t;
    activeSettlementTicket.orderStatus = "Completed"; activeSettlementTicket.syncStatus = "Pending";
    db.transaction(["orders"], "readwrite").objectStore("orders").put(activeSettlementTicket);
    activeLaundryTickets = activeLaundryTickets.filter(t => t.orderId !== activeSettlementTicket.orderId);
    document.getElementById("settlement-modal").classList.add("hidden"); window.renderActiveTickets(); window.runBackgroundSync();
};

window.openExpenseModal = function() { document.getElementById("expense-modal").classList.remove("hidden"); };
window.saveExpense = function() {
    const amount = Number(document.getElementById("exp-amount").value); const category = document.getElementById("exp-category").value.trim();
    if (amount <= 0 || !category) return alert("Harap masukkan jumlah dan kategori yang benar.");
    const payload = { expenseId: "EXP-" + Date.now(), timestamp: new Date().toISOString(), cashier: currentCashier, shiftId: currentShiftId, category: category, description: document.getElementById("exp-desc").value || "-", amount: amount, status: "Active", syncStatus: "Pending" };
    db.transaction(["expenses"], "readwrite").objectStore("expenses").add(payload);
    document.getElementById("expense-modal").classList.add("hidden"); alert("Pengeluaran Berhasil Dicatat!"); window.runBackgroundSync();
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
            let badge = o.orderStatus === "Voided" ? `<span class="status-badge status-voided">Dibatalkan</span>` : `<span class="status-badge status-paid">${o.orderStatus}</span>`;
            container.innerHTML += `<div class="history-row"><div><strong>Kamar: ${o.roomNumber}</strong><br><small style="color:#7f8c8d;">${formatTimeOnlyWIB(o.timestamp)} | Rp ${o.grandTotal.toLocaleString('id-ID')} | Kasir: ${o.cashier}</small></div><div style="display:flex; align-items:center; gap:8px;">${badge}</div></div>`;
        });
        
    } else if (type === 'expenses') {
        const expensesToDisplay = window.globalRecentExpenses || [];
        if(expensesToDisplay.length === 0) return container.innerHTML = `<div style="padding:20px; text-align:center;">Belum ada pengeluaran dicatat di server.</div>`;
        
        expensesToDisplay.forEach(exp => {
            let badge = exp.status === "Voided" ? `<span class="status-badge status-voided">Dibatalkan</span>` : `<span class="status-badge status-paid">Aktif</span>`;
            container.innerHTML += `<div class="history-row"><div><strong>${exp.category}</strong><br><small style="color:#7f8c8d;">${formatTimeOnlyWIB(exp.timestamp)} | Rp ${exp.amount.toLocaleString('id-ID')} | Kasir: ${exp.cashier}</small><br><small>${exp.description}</small></div><div style="display:flex; align-items:center; gap:10px;">${badge}</div></div>`;
        });
        
    } else if (type === 'shifts') {
        const shiftsToDisplay = window.globalRecentShifts || [];
        if(shiftsToDisplay.length === 0) { 
            container.innerHTML = `<div style="padding:20px; text-align:center;">Belum ada histori shift di sistem server.</div>`; 
            return; 
        }
        
        shiftsToDisplay.slice(0, 20).forEach(s => {
            container.innerHTML += `<div class="history-row" style="align-items:flex-start;"><div><strong>Shift: ${s.shiftId}</strong><br><small style="color:#7f8c8d;">Kasir: ${s.cashier} | Keluar: ${formatWIB(s.logoutTime)}</small></div><div style="display:flex; text-align:right; align-items:center;"><div><strong style="margin-right:15px;">Omset: Rp ${(s.totalOmset || 0).toLocaleString('id-ID')}</strong></div></div></div>`;
        });
    }
};

window.openCashDrop = function() { document.getElementById("cash-drop-modal").classList.remove("hidden"); };
window.submitCashDrop = function() {
    const amount = Number(document.getElementById("drop-amount").value) || 0;
    if (amount <= 0) return alert("Masukkan nominal setor uang.");
    const payload = { dropId: "DRP-" + Date.now(), timestamp: new Date().toISOString(), cashier: currentCashier, shiftId: currentShiftId, amount: amount, notes: document.getElementById("drop-notes").value || "-", syncStatus: "Pending" };
    db.transaction(["cash_drops"], "readwrite").objectStore("cash_drops").add(payload);
    document.getElementById("cash-drop-modal").classList.add("hidden"); alert("Setoran berhasil dicatat!"); window.runBackgroundSync();
};

window.syncMasterData = async function(forceAwait = false) {
    let nTxt = document.getElementById("network-text"); let nDot = document.getElementById("network-dot");
    if (!navigator.onLine) { if(nTxt) nTxt.innerText = "Mode Offline"; if(nDot) nDot.style.backgroundColor = "#e74c3c"; return; }
    try {
        const response = await fetch(`${API_URL}?t=${Date.now()}`, { method: 'GET' }); 
        if (!response.ok) throw new Error("Network response was not ok");
        const result = await response.json();
        
        if (result.status === "Success") {
            window.masterDrawerBalance = result.masterDrawerBalance || 0;
            window.globalRecentOrders = result.data.recentOrders || [];
            window.globalRecentExpenses = result.data.recentExpenses || [];
            window.globalRecentShifts = result.recentShifts || [];
            
            // Parse Room List
            window.globalRoomList = (result.data.settings["Room_List"] || "").split(",").map(r => r.trim()).filter(r => r);

            let p1 = new Promise((resolve) => {
                let txFast = db.transaction(["staff", "menu"], "readwrite");
                txFast.objectStore("staff").clear(); 
                
                // CHANGED TO .put() TO PREVENT CRASHES
                result.data.staff.forEach(s => txFast.objectStore("staff").put(s));
                
                txFast.objectStore("menu").clear(); 
                
                // CHANGED TO .put() TO PREVENT CRASHES FROM DUPLICATE ITEM IDs
                result.data.menu.forEach(m => txFast.objectStore("menu").put(m));
                
                txFast.oncomplete = () => {
                    globalMenuData = result.data.menu; 
                    if (!document.getElementById("pos-screen").classList.contains("hidden")) { loadMenuUI(); }
                    if(nTxt) nTxt.innerText = "Online & Sinkron"; if(nDot) nDot.style.backgroundColor = "#2ecc71"; 
                    resolve();
                };
                
                // ADDED ERROR CATCHER SO IT DOESN'T FAIL SILENTLY
                txFast.onerror = (e) => {
                    console.error("Database Save Error:", e.target.error);
                    if(nTxt) nTxt.innerText = "Error Data Ganda"; if(nDot) nDot.style.backgroundColor = "#e74c3c";
                    resolve();
                };
            });
            if(forceAwait) await p1;
        }
    } catch (e) { if(nTxt) nTxt.innerText = "Gagal Sinkron"; if(nDot) nDot.style.backgroundColor = "#e74c3c"; }
};

window.manualPushSync = async function() { await window.runBackgroundSync(); await window.syncMasterData(); alert("Sinkronisasi Database Berhasil!"); };

window.runBackgroundSync = async function() {
    if (!navigator.onLine || isSyncing) return; isSyncing = true; 
    try {
        let orders = await new Promise(res => db.transaction(["orders"], "readonly").objectStore("orders").getAll().onsuccess = e => res(e.target.result));
        for (const order of orders) {
            if (order.syncStatus === "Pending") {
                try {
                    let r = await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: "syncOrder", data: order }) });
                    order.syncStatus = "Synced"; db.transaction(["orders"], "readwrite").objectStore("orders").put(order); 
                } catch(e) {}
            }
        }
        let expenses = await new Promise(res => db.transaction(["expenses"], "readonly").objectStore("expenses").getAll().onsuccess = e => res(e.target.result));
        for (const exp of expenses) {
            if (exp.syncStatus === "Pending") {
                try {
                    let r = await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: "syncExpense", data: exp }) });
                    exp.syncStatus = "Synced"; db.transaction(["expenses"], "readwrite").objectStore("expenses").put(exp); 
                } catch(e) {}
            }
        }
        let cashDrops = await new Promise(res => db.transaction(["cash_drops"], "readonly").objectStore("cash_drops").getAll().onsuccess = e => res(e.target.result));
        for (const drop of cashDrops) {
            try {
                let r = await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ action: "syncCashDrop", data: drop }) });
                db.transaction(["cash_drops"], "readwrite").objectStore("cash_drops").delete(drop.dropId);
            } catch(e) {}
        }
    } finally { isSyncing = false; }
};

window.openShiftReport = function() {
    if (!db || !currentShiftId) return alert("Anda belum membuka shift kasir.");
    let tx = db.transaction(["orders", "expenses"], "readonly");
    let activeOrders = []; let activeExpenses = [];
    tx.objectStore("orders").getAll().onsuccess = (ev) => { activeOrders = ev.target.result; };
    tx.objectStore("expenses").getAll().onsuccess = (ev) => { activeExpenses = ev.target.result; };

    tx.oncomplete = () => {
        let shiftOrders = activeOrders.filter(o => o.shiftId === currentShiftId);
        let shiftExpenses = activeExpenses.filter(e => e.shiftId === currentShiftId);
        let tCust = 0; let tOrders = 0; let tOmset = 0; let tCash = 0; let tQris = 0; let tTransfer = 0; let tFree = 0; let tExpense = 0; let foodSummary = {};
        
        shiftOrders.forEach(o => {
            tOrders++; if (o.roomNumber && o.roomNumber !== "Tanpa Kamar") tCust++;
            tOmset += o.grandTotal; tCash += (o.cashAmount || 0); tQris += (o.qrisAmount || 0); tTransfer += (o.transferAmount || 0); tFree += (o.freeAmount || 0);
            if (o.items) o.items.forEach(i => { foodSummary[i.name] = (foodSummary[i.name] || 0) + i.qty; });
        });
        shiftExpenses.forEach(exp => { tExpense += (exp.amount || 0); });
        let netCash = Math.max(0, tCash - tExpense);

        window.currentShiftData = { 
            shiftId: currentShiftId, loginTime: currentLoginTime, logoutTime: new Date().toISOString(), cashier: currentCashier, 
            totalCustomers: tCust, totalOrders: tOrders, totalOmset: tOmset, totalCash: tCash, totalQris: tQris, totalTransfer: tTransfer, totalFree: tFree, totalExpenses: tExpense, netCash: netCash, foodSummary: foodSummary
        };
        
        if (document.getElementById("sr-orders")) document.getElementById("sr-orders").innerText = tOrders;
        if (document.getElementById("sr-customers")) document.getElementById("sr-customers").innerText = tCust;
        if (document.getElementById("sr-omset")) document.getElementById("sr-omset").innerText = "Rp " + tOmset.toLocaleString('id-ID');
        if (document.getElementById("sr-cash")) document.getElementById("sr-cash").innerText = "Rp " + tCash.toLocaleString('id-ID');
        if (document.getElementById("sr-qris")) document.getElementById("sr-qris").innerText = "Rp " + tQris.toLocaleString('id-ID');
        if (document.getElementById("sr-transfer")) document.getElementById("sr-transfer").innerText = "Rp " + tTransfer.toLocaleString('id-ID');
        if (document.getElementById("sr-free")) document.getElementById("sr-free").innerText = "Rp " + tFree.toLocaleString('id-ID');
        if (document.getElementById("sr-expense")) document.getElementById("sr-expense").innerText = "Rp " + tExpense.toLocaleString('id-ID');
        if (document.getElementById("sr-net")) document.getElementById("sr-net").innerText = "Rp " + netCash.toLocaleString('id-ID');

        let foodHtml = "";
        for (const [name, qty] of Object.entries(foodSummary)) {
            let qtyStr = (qty % 1 !== 0) ? Number(qty).toFixed(2) : qty;
            foodHtml += `<div style="display:flex; justify-content:space-between; border-bottom:1px dashed #eee; padding:4px 0;"><span>${name}</span> <strong>${qtyStr}x</strong></div>`;
        }
        if (document.getElementById("sr-items-summary")) document.getElementById("sr-items-summary").innerHTML = foodHtml || "Belum ada item terjual";

        document.getElementById("shift-report-modal").classList.remove("hidden");
    };
};

window.triggerEndShift = async function() {
    const data = window.currentShiftData; if (!data) return alert("Gagal mengambil data shift kasir.");
    if (!confirm("Apakah Anda yakin ingin MENGAKHIRI SHIFT?")) return;
    
    let tx = db.transaction(["local_shift_history", "shift_reports", "active_shifts"], "readwrite");
    tx.objectStore("local_shift_history").add(data); tx.objectStore("shift_reports").add(data);
    tx.objectStore("active_shifts").delete(currentPin);
    
    tx.oncomplete = async () => {
        document.getElementById("shift-report-modal").classList.add("hidden");
        alert("Shift Berhasil Ditutup! Memproses sinkronisasi cloud akhir...");
        await window.runBackgroundSync(); window.location.reload(); 
    };
};

window.onload = async () => { 
    await initDB(); 
    window.syncMasterData(); 
    
    document.addEventListener("mousedown", function(e) {
        let resBox = document.getElementById('autocomplete-results');
        if (resBox && !e.target.closest('#autocomplete-results') && e.target.id !== 'room-input') { 
            resBox.classList.add('hidden'); resBox.style.display = "none"; 
        }
    });

    window.setInterval(window.runBackgroundSync, 5000); 
    window.setInterval(window.syncMasterData, 30000); 
};
