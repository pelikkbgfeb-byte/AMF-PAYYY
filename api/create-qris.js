let currentSaldo = 0;
let merchantSaldoTarik = 0;
let merchantInToday = 0;
let isSaldoHidden = false;
let selectedEwalletProvider = '';
let currentTotalPay = 0;
let currentNominalClean = 0;
let currentFeeGateway = 0;
let generatedQrUrl = '';
let isPaymentSuccess = false;
let paymentInterval = null;

function showNotification(message) {
    const toast = document.getElementById('app-notification');
    const toastMsg = document.getElementById('toast-message');
    if (toast && toastMsg) {
        toastMsg.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

function switchAppTab(tabId, element) {
    const tabs = document.querySelectorAll('.app-tab');
    if (tabs.length === 0) {
        window.location.href = `dashboard.html#${tabId}`;
        return;
    }
    tabs.forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-5 .nav-item-5').forEach(item => item.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    if (element) element.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', () => {
    localStorage.removeItem('amf_trx_list');

    if (window.location.hash) {
        const tabId = window.location.hash.substring(1);
        const targetTab = document.getElementById(tabId);
        if (targetTab) {
            document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
            targetTab.classList.add('active');
        }
    }
    currentSaldo = parseInt(localStorage.getItem('amf_saldo') || '0');
    const saldoTextEl = document.getElementById('saldo-text');
    if (saldoTextEl) saldoTextEl.textContent = "Rp " + currentSaldo.toLocaleString('id-ID');
    renderTransactions();
});

function openTopupPage() {
    const tabs = document.querySelectorAll('.app-tab');
    if (tabs.length === 0) {
        window.location.href = 'dashboard.html#tab-topup-saldo';
        return;
    }
    switchAppTab('tab-topup-saldo', document.querySelectorAll('.nav-item-5')[3]);
    const input = document.getElementById('topup-nominal-input');
    if (input) input.value = '';
    calculateGatewayFee();
}

function setTopupNominal(amount) {
    const input = document.getElementById('topup-nominal-input');
    if (input) {
        input.value = amount;
        calculateGatewayFee();
    }
}

function calculateGatewayFee() {
    const input = document.getElementById('topup-nominal-input');
    const nominal = input ? parseInt(input.value) || 0 : 0;
    
    currentNominalClean = nominal;
    currentFeeGateway = nominal > 0 ? Math.round(nominal * 0.003) : 0;
    currentTotalPay = nominal + currentFeeGateway;

    const sumNominal = document.getElementById('summary-nominal');
    const sumFee = document.getElementById('summary-fee');
    const sumTotal = document.getElementById('summary-total');

    if (sumNominal) sumNominal.textContent = "Rp " + nominal.toLocaleString('id-ID');
    if (sumFee) sumFee.textContent = "Rp " + currentFeeGateway.toLocaleString('id-ID');
    if (sumTotal) sumTotal.textContent = "Rp " + currentTotalPay.toLocaleString('id-ID');
}

// Fungsi Request QRIS menembak ke API Serverless Vercel (`/api/create-qris`)
async function requestKaseraQrisLive(nominal) {
    try {
        const response = await fetch('/api/create-qris', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: nominal })
        });

        const result = await response.json();
        if (result.success && result.data) {
            return result.data;
        } else {
            console.error("Gagal dari backend Vercel:", result);
            showNotification(result.message || 'Gagal membuat QRIS');
            return null;
        }
    } catch (err) {
        console.error('Network Error:', err);
        showNotification('Terjadi kesalahan koneksi ke server');
        return null;
    }
}

async function processTopupAutomatic() {
    if (currentNominalClean <= 0) {
        showNotification('Masukkan nominal deposit terlebih dahulu!');
        return;
    }

    showNotification('Memproses tagihan QRIS Live...');
    
    const backendData = await requestKaseraQrisLive(currentNominalClean);
    if (!backendData || !backendData.qrString) {
        return;
    }

    currentTotalPay = backendData.amount || currentTotalPay;
    currentFeeGateway = backendData.fee || currentFeeGateway;
    const rawQrString = backendData.qrString;
    
    generatedQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(rawQrString)}`;

    isPaymentSuccess = false;
    const modal = document.getElementById('modal-struk-receipt');
    const now = new Date();
    const timeStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ", " + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + " WITA";
    
    const storeTitleEl = document.getElementById('struk-store-brand-title');
    if (storeTitleEl) storeTitleEl.textContent = "Rincian Pembayaran QRIS";

    const trxId = backendData.externalId || ("AMF" + Math.floor(100000 + Math.random() * 900000));
    document.getElementById('struk-trx-id').textContent = trxId;
    document.getElementById('struk-date-time').textContent = timeStr;
    document.getElementById('struk-nominal').textContent = "Rp " + currentNominalClean.toLocaleString('id-ID');
    document.getElementById('struk-fee').textContent = "Rp " + currentFeeGateway.toLocaleString('id-ID');
    document.getElementById('summary-total-struk').textContent = "Rp " + currentTotalPay.toLocaleString('id-ID');

    document.getElementById('struk-qr-box').innerHTML = `<img src="${generatedQrUrl}" alt="QRIS Struk" style="width:150px;height:150px;object-fit:contain;">`;

    const statusBox = document.getElementById('struk-status-box-id');
    const actionBtn = document.getElementById('struk-action-btn');
    
    statusBox.textContent = "STATUS: PENDING (MENUNGGU PEMBAYARAN)";
    statusBox.className = "struk-status-box status-pending";
    statusBox.style.cursor = "pointer";
    statusBox.onclick = () => triggerPaymentSuccessRealtime();
    if (actionBtn) actionBtn.style.display = 'none';

    if (modal) modal.classList.add('active');

    addTransactionRecord(`Top-up QRIS (${trxId})`, currentTotalPay, 'Pending');
    startPaymentChecker();
}

function startPaymentChecker() {
    if (paymentInterval) clearInterval(paymentInterval);

    paymentInterval = setInterval(async () => {
        if (isPaymentSuccess) {
            clearInterval(paymentInterval);
            return;
        }
    }, 4000);
}

function triggerPaymentSuccessRealtime() {
    if (isPaymentSuccess) return;
    isPaymentSuccess = true;

    const statusBox = document.getElementById('struk-status-box-id');
    const actionBtn = document.getElementById('struk-action-btn');

    statusBox.textContent = "STATUS: BERHASIL (PEMBAYARAN DITERIMA)";
    statusBox.className = "struk-status-box status-berhasil";
    if (actionBtn) actionBtn.style.display = 'block';

    currentSaldo += currentNominalClean;
    merchantSaldoTarik = parseInt(localStorage.getItem('amf_m_tarik') || '0') + currentNominalClean;
    merchantInToday = parseInt(localStorage.getItem('amf_m_today') || '0') + currentNominalClean;

    localStorage.setItem('amf_saldo', currentSaldo);
    localStorage.setItem('amf_m_tarik', merchantSaldoTarik);
    localStorage.setItem('amf_m_today', merchantInToday);

    addTransactionRecord('Top-up Saldo QRIS', currentTotalPay, 'Berhasil');

    const saldoTextEl = document.getElementById('saldo-text');
    if (saldoTextEl) saldoTextEl.textContent = "Rp " + currentSaldo.toLocaleString('id-ID');

    showNotification(`Saldo Rp ${currentNominalClean.toLocaleString('id-ID')} Berhasil Masuk!`);
}

function closeStrukModal() {
    if (paymentInterval) clearInterval(paymentInterval);
    document.getElementById('modal-struk-receipt').classList.remove('active');
    switchAppTab('tab-home', document.querySelectorAll('.nav-item-5')[0]);
}

function addTransactionRecord(title, nominal, status) {
    let existingTrx = JSON.parse(localStorage.getItem('amf_trx_list') || '[]');
    const now = new Date();
    const timeString = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ", " + now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + " WITA";

    existingTrx.unshift({ title, nominal, status, time: timeString });
    localStorage.setItem('amf_trx_list', JSON.stringify(existingTrx));
    renderTransactions();
}

function renderTransactions() {
    const trxContainer = document.getElementById('transaction-container');
    if (!trxContainer) return;

    let existingTrx = JSON.parse(localStorage.getItem('amf_trx_list') || '[]');
    if (existingTrx.length === 0) {
        trxContainer.innerHTML = `<div class="empty-trx" style="text-align: center; color: #a0aec0; padding: 25px 0; font-size: 0.85rem;">Belum ada catatan transaksi.</div>`;
        return;
    }

    let html = '';
    existingTrx.forEach(trx => {
        const statusColor = trx.status === 'Berhasil' ? '#10b981' : '#f59e0b';
        html += `
            <div class="trx-item">
                <div class="trx-icon success"><i class="fa-solid fa-check"></i></div>
                <div class="trx-details">
                    <h4>${trx.title}</h4>
                    <small>${trx.time} • <span style="font-weight:700; color:${statusColor};">${trx.status}</span></small>
                </div>
                <span class="trx-status">Rp ${trx.nominal.toLocaleString('id-ID')}</span>
            </div>
        `;
    });
    trxContainer.innerHTML = html;
}

function toggleAllSalutation() {
    const saldoTextEl = document.getElementById('saldo-text');
    const eyeIcon = document.getElementById('toggle-eye');

    if (!isSaldoHidden) {
        saldoTextEl.textContent = "Rp ••••••••";
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
        isSaldoHidden = true;
    } else {
        const current = parseInt(localStorage.getItem('amf_saldo') || '0');
        saldoTextEl.textContent = "Rp " + current.toLocaleString('id-ID');
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
        isSaldoHidden = false;
    }
}

function openEwalletMenu(provider) {
    selectedEwalletProvider = provider;
    const tabs = document.querySelectorAll('.app-tab');
    if (tabs.length === 0) {
        window.location.href = `dashboard.html#tab-ewallet-menu`;
        return;
    }
    tabs.forEach(tab => tab.classList.remove('active'));
    document.getElementById('tab-ewallet-menu').classList.add('active');
    document.getElementById('ewallet-title-text').textContent = `Top Up ${provider}`;
    document.getElementById('ewallet-label').textContent = `Nomor Tujuan / HP ${provider}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function simulateEwalletTopup() {
    const phoneInput = document.getElementById('ewallet-phone');
    const nominalInput = document.getElementById('ewallet-nominal');
    const phone = phoneInput ? phoneInput.value : '';
    const nominal = nominalInput ? parseInt(nominalInput.value) || 0 : 0;

    if (!phone || nominal <= 0) {
        showNotification('Lengkapi nomor tujuan dan nominal!');
        return;
    }

    currentSaldo += nominal;
    localStorage.setItem('amf_saldo', currentSaldo);
    document.getElementById('saldo-text').textContent = "Rp " + currentSaldo.toLocaleString('id-ID');
    addTransactionRecord(`Top-up ${selectedEwalletProvider}`, nominal, 'Berhasil');
    
    phoneInput.value = '';
    nominalInput.value = '';
    showNotification(`Transaksi ${selectedEwalletProvider} Berhasil!`);
    switchAppTab('tab-home', document.querySelectorAll('.nav-item-5')[0]);
}

let currentSlideIndex = 0;
const totalSlides = 3;
function updateSlider() {
    const sliderTrack = document.querySelector('.slider-track');
    const dots = document.querySelectorAll('.dot');
    if (sliderTrack) {
        sliderTrack.style.transform = `translateX(-${currentSlideIndex * (100 / totalSlides)}%)`;
        dots.forEach((dot, index) => dot.classList.toggle('active', index === currentSlideIndex));
    }
}
function nextSlide() {
    currentSlideIndex = (currentSlideIndex + 1) % totalSlides;
    updateSlider();
}
function currentSlide(index) {
    currentSlideIndex = index;
    updateSlider();
}
setInterval(nextSlide, 4000);
