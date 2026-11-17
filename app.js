if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker terdaftar!', reg))
      .catch(err => console.log('Gagal daftar SW:', err));
  });
}

const API_URL = "https://script.google.com/macros/s/AKfycby6HDy74_urEl7CLT5dNfaqqpqAmN1sHftd5qlFfxzZTxmZSjZqoyUcmdvFCDy8AGt_7A/exec";
const IMGBB_API_KEY = "9af84f306754d5637a4026a11259dab3"; 

let currentUser = null;
let currentRole = "USER";
let globalDataArr = { transaksi: [], hutang: [], piutang: [], wishlist: [], tagihan: [] };
let isAntiIntipActive = false;
let regStep = "send_otp";
let forgotStep = "send_otp";

// Matriks Kurs Acuan Default (Fallback jika offline/gagal fetch)
let KURS_ACUAN = {
    'IDR': 1,
    'USD': 18250,
    'RINGGIT': 4100,
    'KHMR': 4.5,
    'BAHT': 520,
    'AMD': 45
};

// Cek Sesi Saat Halaman Dimuat
document.addEventListener("DOMContentLoaded", () => {
    inisialisasiFiturTambahanUI();
    ambilKursRealTime();
    const savedUser = localStorage.getItem("danaku_user");
    if(savedUser) {
        currentUser = savedUser;
        currentRole = localStorage.getItem("danaku_role") || "USER";
        bukaAplikasiUtama();
    }
});

// ================= FETCH KURS REAL-TIME DARI API PUBLIK =================
async function ambilKursRealTime() {
    try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await res.json();
        
        if (data && data.result === "success" && data.rates) {
            const rateUSD_IDR = data.rates.IDR;
            const rateUSD_MYR = data.rates.MYR;
            const rateUSD_THB = data.rates.THB;
            
            if(rateUSD_IDR) {
                KURS_ACUAN['USD'] = rateUSD_IDR;
                if(rateUSD_MYR) KURS_ACUAN['RINGGIT'] = rateUSD_IDR / rateUSD_MYR;
                if(rateUSD_THB) KURS_ACUAN['BAHT'] = rateUSD_IDR / rateUSD_THB;
                
                updateTampilanSaldo();
            }
        }
    } catch (err) {
        console.warn("Gagal fetch kurs real-time, menggunakan kurs acuan sistem:", err);
    }
}

// ================= INISIALISASI UI TAMBAHAN =================
function inisialisasiFiturTambahanUI() {
    const listHistoryEl = document.getElementById('list-history-global');
    if (listHistoryEl && !document.getElementById('wrapper-fitur-history')) {
        const toolbarHTML = `
            <div id="wrapper-fitur-history" class="space-y-3 mb-3">
                <!-- Bar Analitik Arus Kas & Budget Guard -->
                <div class="bg-slate-950/80 border border-slate-800 p-3 rounded-2xl space-y-2">
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-emerald-400">Masuk: <span id="stat-persen-masuk">0%</span></span>
                        <span id="badge-budget-status" class="text-cyan-400 uppercase tracking-wider">Budget Aman</span>
                        <span class="text-rose-400">Keluar: <span id="stat-persen-keluar">0%</span></span>
                    </div>
                    <div class="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                        <div id="bar-rasio-masuk" class="bg-emerald-500 h-full transition-all duration-500" style="width: 50%"></div>
                        <div id="bar-rasio-keluar" class="bg-rose-500 h-full transition-all duration-500" style="width: 50%"></div>
                    </div>
                    <div class="flex justify-between items-center pt-1 text-[10px] text-slate-400">
                        <span>Limit: <strong id="teks-limit-budget" class="text-white">Rp 3.000.000</strong></span>
                        <button onclick="aturLimitBudget()" class="text-cyan-400 hover:underline font-bold">⚙️ Atur Limit</button>
                    </div>
                </div>

                <!-- Search, Filter Bulan & Export CSV -->
                <div class="space-y-2">
                    <div class="flex gap-2">
                        <input type="text" id="input-cari-history" oninput="muatHistoryGlobal()" placeholder="🔍 Cari transaksi..." class="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500">
                        <button type="button" onclick="exportHistoryKeCSV()" class="px-3 py-2 bg-cyan-950 hover:bg-cyan-900 text-cyan-400 border border-cyan-800/60 rounded-xl text-[11px] font-extrabold whitespace-nowrap transition" title="Unduh CSV">
                            📥 CSV
                        </button>
                    </div>
                    <div class="flex gap-2">
                        <select id="filter-bulan-history" onchange="muatHistoryGlobal()" class="w-full px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 focus:outline-none">
                            <option value="SEMUA">📅 Semua Bulan</option>
                            <option value="01">Januari</option><option value="02">Februari</option><option value="03">Maret</option>
                            <option value="04">April</option><option value="05">Mei</option><option value="06">Juni</option>
                            <option value="07">Juli</option><option value="08">Agustus</option><option value="09">September</option>
                            <option value="10">Oktober</option><option value="11">November</option><option value="12">Desember</option>
                        </select>
                        <select id="filter-tahun-history" onchange="muatHistoryGlobal()" class="w-28 px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 focus:outline-none">
                            <option value="SEMUA">Tahun</option>
                            <option value="2026">2026</option>
                            <option value="2025">2025</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
        listHistoryEl.insertAdjacentHTML('beforebegin', toolbarHTML);

        const selectSaldo = document.getElementById('filter-mata-uang-saldo');
        if(selectSaldo && !selectSaldo.querySelector('option[value="ALL_IDR"]')) {
            selectSaldo.insertAdjacentHTML('beforeend', '<option value="ALL_IDR" class="bg-slate-900 text-cyan-400 font-bold">🌍 SEMUA (Konversi ke IDR)</option>');
        }
    }
}

// ================= CYBER-BANNER ALERT & BADGE COUNTER =================
function renderCyberBannerDanBadge() {
    const todayStr = new Date().toISOString().split('T')[0];
    let jumlahTagihanLewat = 0;
    let jumlahHutangLewat = 0;

    if (globalDataArr.tagihan) {
        globalDataArr.tagihan.forEach(tg => {
            const tgl = formatTanggalPendek(getVal(tg, 'tanggal', 'Tanggal'));
            if (tgl && tgl <= todayStr) jumlahTagihanLewat++;
        });
    }

    if (globalDataArr.hutang) {
        globalDataArr.hutang.forEach(h => {
            const tgl = formatTanggalPendek(getVal(h, 'tanggal', 'Tanggal'));
            if (tgl && tgl <= todayStr) jumlahHutangLewat++;
        });
    }

    const totalAlert = jumlahTagihanLewat + jumlahHutangLewat;

    updateBadgeNavigasi('tagihan', jumlahTagihanLewat);
    updateBadgeNavigasi('hutangpiutang', jumlahHutangLewat);

    const containerUtama = document.getElementById('app-content');
    if (!containerUtama) return;

    let bannerEl = document.getElementById('cyber-alert-banner');
    
    if (totalAlert > 0) {
        const pesanAlert = `⚠️ : Ada ${jumlahTagihanLewat} Tagihan & ${jumlahHutangLewat} Hutang jatuh tempo yang perlu di bayar😒`;
        
        if (!bannerEl) {
            const bannerHTML = `
                <div id="cyber-alert-banner" class="mb-4 bg-rose-950/80 border border-rose-500/60 p-3 rounded-2xl flex items-center justify-between gap-3 shadow-[0_0_15px_rgba(244,63,94,0.3)] animate-pulse">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">🚨</span>
                        <p id="cyber-alert-text" class="text-[11px] font-extrabold text-rose-300 tracking-wide">${pesanAlert}</p>
                    </div>
                    <button onclick="gantiTab('tagihan')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-extrabold whitespace-nowrap transition shadow">
                        Cek Sekarang
                    </button>
                </div>
            `;
            containerUtama.insertAdjacentHTML('afterbegin', bannerHTML);
        } else {
            document.getElementById('cyber-alert-text').innerText = pesanAlert;
            bannerEl.classList.remove('hidden');
        }
    } else {
        if (bannerEl) bannerEl.classList.add('hidden');
    }
}

function updateBadgeNavigasi(tabName, count) {
    const navBtn = document.getElementById(`nav-${tabName}`);
    if (!navBtn) return;

    let badge = navBtn.querySelector('.cyber-badge');
    if (badge) badge.remove();

    if (count > 0) {
        const badgeHTML = `<span class="cyber-badge absolute -top-1 -right-2 bg-rose-500 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-bounce">${count}</span>`;
        navBtn.classList.add('relative');
        navBtn.insertAdjacentHTML('beforeend', badgeHTML);
    }
}

function aturLimitBudget() {
    const limitLama = localStorage.getItem("danaku_budget_limit") || "3000000";
    const inputBaru = prompt("Masukkan batas maksimal pengeluaran bulanan (dalam IDR):", limitLama);
    if(inputBaru === null) return;
    const bersih = bersihkanRibuan(inputBaru);
    if(bersih > 0) {
        localStorage.setItem("danaku_budget_limit", bersih);
        updateTampilanSaldo();
        alert("Limit anggaran bulanan berhasil diperbarui!");
    }
}

function exportHistoryKeCSV() {
    const data = kumpulkanDataHistory();
    if (data.length === 0) {
        alert("Tidak ada data transaksi untuk di-export.");
        return;
    }

    let csvContent = "Tanggal,Kategori,Tipe,Mata Uang,Keterangan,Jumlah,Link Bukti\n";
    data.forEach(item => {
        const ketBersih = `"${(item.keterangan || "").toString().replace(/"/g, '""')}"`;
        csvContent += `${item.tanggal},${item.kategoriMenu.toUpperCase()},${item.tipe.toUpperCase()},${item.mataUang},${ketBersih},${item.jumlah},${item.bukti || "-"}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const tglFile = new Date().toISOString().split('T')[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_DanakuPro_${currentUser}_${tglFile}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ================= HELPER PEMISAH RIBUAN =================
function formatInputRibuan(el) {
    let angkaMurni = el.value.replace(/\D/g, "");
    if (!angkaMurni) {
        el.value = "";
        return;
    }
    el.value = parseInt(angkaMurni, 10).toLocaleString("id-ID");
}

function bersihkanRibuan(nilaiStr) {
    if (!nilaiStr) return 0;
    return parseFloat(nilaiStr.toString().replace(/\./g, "").replace(/,/g, "")) || 0;
}

function formatAngkaRibuanStr(angka) {
    const num = parseFloat(angka) || 0;
    return num > 0 ? num.toLocaleString("id-ID") : "0";
}

// ================= AUTHENTICATION =================
function gantiModeAuth(mode) {
    document.getElementById('form-login').classList.add('hidden');
    document.getElementById('form-register').classList.add('hidden');
    document.getElementById('form-forgot').classList.add('hidden');

    const title = document.getElementById('auth-title');
    const sub = document.getElementById('auth-subtitle');

    if (mode === 'login') {
        document.getElementById('form-login').classList.remove('hidden');
        title.innerText = "CELENGAN";
        sub.innerText = "Silahkan Log in";
    } else if (mode === 'register') {
        document.getElementById('form-register').classList.remove('hidden');
        title.innerText = "DAFTAR AKUN";
        sub.innerText = "Verifikasi email via OTP Gmail";
        regStep = "send_otp";
        document.getElementById('reg-otp-box').classList.add('hidden');
        document.getElementById('btn-reg-submit').querySelector('.btn-text').innerText = "Kirim Kode OTP";
    } else if (mode === 'forgot') {
        document.getElementById('form-forgot').classList.remove('hidden');
        title.innerText = "PULIHKAN SANDI";
        sub.innerText = "Reset kata sandi dengan OTP Email";
        forgotStep = "send_otp";
        document.getElementById('forgot-reset-box').classList.add('hidden');
        document.getElementById('btn-forgot-submit').querySelector('.btn-text').innerText = "Kirim OTP Pemulihan";
    }
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    setLoadingBtn(submitBtn, true, "Memproses...");

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ action: "login", username: user, password: pass })
        });
        const result = await response.json();
        
        if(result.status === "success") {
            currentUser = user;
            currentRole = result.role || "USER";
            localStorage.setItem("danaku_user", currentUser);
            localStorage.setItem("danaku_role", currentRole);
            bukaAplikasiUtama();
        } else {
            alert(result.message || "Login gagal!");
            setLoadingBtn(submitBtn, false, "Masuk");
        }
    } catch(err) {
        alert("Gagal terhubung ke server.");
        setLoadingBtn(submitBtn, false, "Masuk");
    }
});

document.getElementById('form-register').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-reg-submit');
    const payload = {
        action: "register",
        step: regStep,
        username: document.getElementById('reg-user').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-pass').value,
        otp: document.getElementById('reg-otp').value.trim()
    };

    setLoadingBtn(submitBtn, true, regStep === "send_otp" ? "Mengirim OTP..." : "Memverifikasi...");

    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
        const result = await res.json();

        if (result.status === "otp_sent") {
            regStep = "verify_and_save";
            document.getElementById('reg-otp-box').classList.remove('hidden');
            setLoadingBtn(submitBtn, false, "Verifikasi & Daftar");
            alert("Kode OTP telah dikirim ke email Anda!");
        } else if (result.status === "success") {
            setLoadingBtn(submitBtn, false, "Kirim Kode OTP");
            alert("Pendaftaran berhasil! Silakan login.");
            this.reset();
            gantiModeAuth('login');
        } else {
            setLoadingBtn(submitBtn, false, regStep === "send_otp" ? "Kirim Kode OTP" : "Verifikasi & Daftar");
            alert(result.message || "Gagal mendaftar.");
        }
    } catch (err) {
        setLoadingBtn(submitBtn, false, regStep === "send_otp" ? "Kirim Kode OTP" : "Verifikasi & Daftar");
        alert("Terjadi kesalahan jaringan.");
    }
});

document.getElementById('form-forgot').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-forgot-submit');
    const payload = {
        action: "forgot",
        step: forgotStep,
        email: document.getElementById('forgot-email').value.trim(),
        otp: document.getElementById('forgot-otp').value.trim(),
        newPassword: document.getElementById('forgot-newpass').value
    };

    setLoadingBtn(submitBtn, true, forgotStep === "send_otp" ? "Mengirim OTP..." : "Menyimpan Sandi...");

    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
        const result = await res.json();

        if (result.status === "otp_sent") {
            forgotStep = "reset_pass";
            document.getElementById('forgot-reset-box').classList.remove('hidden');
            setLoadingBtn(submitBtn, false, "Simpan Password Baru");
            alert("Kode OTP pemulihan terkirim ke email Anda!");
        } else if (result.status === "success") {
            setLoadingBtn(submitBtn, false, "Kirim OTP Pemulihan");
            alert("Kata sandi berhasil diubah! Silakan login.");
            this.reset();
            gantiModeAuth('login');
        } else {
            setLoadingBtn(submitBtn, false, forgotStep === "send_otp" ? "Kirim OTP Pemulihan" : "Simpan Password Baru");
            alert(result.message || "Gagal memulihkan sandi.");
        }
    } catch (err) {
        setLoadingBtn(submitBtn, false, forgotStep === "send_otp" ? "Kirim OTP Pemulihan" : "Simpan Password Baru");
        alert("Terjadi kesalahan jaringan.");
    }
});

// ================= NAVIGASI TAB & RELOG =================
function gantiTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('div.fixed.bottom-0 button').forEach(n => {
        n.classList.remove('text-cyan-400', 'text-indigo-600', 'font-extrabold');
        n.classList.add('text-slate-400');
    });

    document.getElementById(`content-${tabName}`).classList.add('active');
    const navActive = document.getElementById(`nav-${tabName}`);
    navActive.classList.remove('text-slate-400');
    navActive.classList.add('text-cyan-400', 'font-extrabold');

    if(tabName === 'history') muatHistoryGlobal();
    if(tabName === 'hutangpiutang') renderHutangPiutangAktif();
    if(tabName === 'target') renderTargetAktif();
    if(tabName === 'tagihan') renderTagihanAktif();
}

async function relogData() {
    const btnRelog = document.getElementById('btn-relog');
    const relogIcon = btnRelog.querySelector('.relog-icon');
    const relogText = btnRelog.querySelector('.relog-text');

    relogIcon.classList.add('animate-spin-custom');
    relogText.innerText = "Loading...";
    btnRelog.disabled = true;

    await ambilKursRealTime();
    await muatDataDariServer();

    setTimeout(() => {
        relogIcon.classList.remove('animate-spin-custom');
        relogText.innerText = "Relog";
        btnRelog.disabled = false;
    }, 400);
}

function bukaAplikasiUtama() {
    document.getElementById('section-auth').classList.add('hidden');
    document.getElementById('app-content').classList.remove('hidden');
    document.getElementById('teks-user-aktif').innerText = currentUser;
    document.getElementById('badge-role').innerText = currentRole;
    
    const today = new Date().toISOString().split('T')[0];
    if(document.getElementById('tr-tanggal')) document.getElementById('tr-tanggal').value = today;
    if(document.getElementById('hp-tanggal')) document.getElementById('hp-tanggal').value = today;
    if(document.getElementById('tg-tanggal')) document.getElementById('tg-tanggal').value = today;

    muatDataDariServer();
}

function logout() {
    localStorage.removeItem("danaku_user");
    localStorage.removeItem("danaku_role");
    currentUser = null;
    window.location.reload();
}

function setLoadingBtn(btnEl, isLoading, textLabel) {
    const btnText = btnEl.querySelector('.btn-text');
    const spinner = btnEl.querySelector('.loading-spinner');
    if(isLoading) {
        btnText.innerText = textLabel;
        spinner.classList.remove('hidden');
        btnEl.disabled = true;
    } else {
        btnText.innerText = textLabel;
        spinner.classList.add('hidden');
        btnEl.disabled = false;
    }
}

async function uploadKeImgBB(fileInputId) {
    const fileInput = document.getElementById(fileInputId);
    if(!fileInput || fileInput.files.length === 0) return "";
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });
        const result = await response.json();
        if(result.success) return result.data.url;
    } catch(err) {
        console.error("Gagal upload gambar:", err);
    }
    return "";
}

function bukaModalBukti(url) {
    if(!url || url.trim() === "") {
        alert("Tidak ada bukti foto yang di-upload untuk data ini.");
        return;
    }
    document.getElementById('img-bukti-preview').src = url;
    document.getElementById('modal-bukti').classList.remove('hidden');
}

function tutupModalBukti() {
    document.getElementById('modal-bukti').classList.add('hidden');
    document.getElementById('img-bukti-preview').src = "";
}

// ================= MODAL EDIT UNIVERSAL =================
function bukaModalEdit(sheetName, rowIndex) {
    const mapKey = sheetName.toLowerCase();
    const listData = globalDataArr[mapKey] || [];
    const item = listData.find(x => Number(x.rowIndex) === Number(rowIndex));
    if (!item) return alert("Data tidak ditemukan.");

    document.getElementById('edit-sheet').value = sheetName;
    document.getElementById('edit-rowIndex').value = rowIndex;
    document.getElementById('edit-username').value = getVal(item, 'username', 'Username') || currentUser;
    document.getElementById('edit-buktiUrl').value = getVal(item, 'buktiUrl', 'Bukti', 'bukti') || "";
    document.getElementById('edit-file').value = "";

    const groupTipe = document.getElementById('edit-group-tipe');
    const groupJmlTgl = document.getElementById('edit-group-jumlah-tgl');
    const groupWishlist = document.getElementById('edit-group-wishlist');
    const labelNama = document.getElementById('edit-label-nama');
    const modalTitle = document.getElementById('edit-modal-title');

    document.getElementById('edit-mata-uang').value = getVal(item, 'mataUang', 'Mata Uang', 'MataUang').toString().trim() || "IDR";

    if (sheetName === "TRANSAKSI") {
        modalTitle.innerText = "✏️ Edit Transaksi";
        groupTipe.classList.remove('hidden');
        groupJmlTgl.classList.remove('hidden');
        groupWishlist.classList.add('hidden');
        labelNama.innerText = "Keterangan";

        document.getElementById('edit-tipe').value = getVal(item, 'tipe', 'Tipe').toString().toLowerCase().trim() || "pemasukan";
        document.getElementById('edit-nama').value = getVal(item, 'keterangan', 'Keterangan');
        document.getElementById('edit-jumlah').value = formatAngkaRibuanStr(getVal(item, 'jumlah', 'Jumlah'));
        document.getElementById('edit-tanggal').value = formatTanggalPendek(getVal(item, 'tanggal', 'Tanggal'));
    } else if (sheetName === "Wishlist") {
        modalTitle.innerText = "✏️ Edit Target Tabungan";
        groupTipe.classList.add('hidden');
        groupJmlTgl.classList.add('hidden');
        groupWishlist.classList.remove('hidden');
        labelNama.innerText = "Nama Target";

        document.getElementById('edit-nama').value = getVal(item, 'nama', 'Nama');
        document.getElementById('edit-target').value = formatAngkaRibuanStr(getVal(item, 'target', 'Target'));
        document.getElementById('edit-terkumpul').value = formatAngkaRibuanStr(getVal(item, 'terkumpul', 'Terkumpul'));
    } else {
        modalTitle.innerText = `✏️ Edit Data ${sheetName}`;
        groupTipe.classList.add('hidden');
        groupJmlTgl.classList.remove('hidden');
        groupWishlist.classList.add('hidden');
        labelNama.innerText = sheetName === "Tagihan" ? "Nama Tagihan" : "Nama Pihak Terkait";

        document.getElementById('edit-nama').value = getVal(item, 'nama', 'Nama');
        document.getElementById('edit-jumlah').value = formatAngkaRibuanStr(getVal(item, 'jumlah', 'Jumlah'));
        document.getElementById('edit-tanggal').value = formatTanggalPendek(getVal(item, 'tanggal', 'Tanggal'));
    }

    document.getElementById('modal-edit').classList.remove('hidden');
}

function tutupModalEdit() {
    document.getElementById('modal-edit').classList.add('hidden');
}

document.getElementById('form-edit-universal').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-edit');
    setLoadingBtn(submitBtn, true, "Memperbarui...");

    const sheetName = document.getElementById('edit-sheet').value;
    const rowIndex = parseInt(document.getElementById('edit-rowIndex').value, 10);
    const usernameItem = document.getElementById('edit-username').value;
    let buktiUrl = document.getElementById('edit-buktiUrl').value;

    const buktiBaru = await uploadKeImgBB('edit-file');
    if (buktiBaru) buktiUrl = buktiBaru;

    let payload = {
        action: "updateData",
        sheet: sheetName,
        rowIndex: rowIndex,
        username: usernameItem,
        mataUang: document.getElementById('edit-mata-uang').value,
        buktiUrl: buktiUrl
    };

    if (sheetName === "TRANSAKSI") {
        payload.tipe = document.getElementById('edit-tipe').value;
        payload.keterangan = document.getElementById('edit-nama').value;
        payload.jumlah = bersihkanRibuan(document.getElementById('edit-jumlah').value);
        payload.tanggal = document.getElementById('edit-tanggal').value;
    } else if (sheetName === "Wishlist") {
        payload.nama = document.getElementById('edit-nama').value;
        payload.target = bersihkanRibuan(document.getElementById('edit-target').value);
        payload.terkumpul = bersihkanRibuan(document.getElementById('edit-terkumpul').value);
    } else {
        payload.nama = document.getElementById('edit-nama').value;
        payload.jumlah = bersihkanRibuan(document.getElementById('edit-jumlah').value);
        payload.tanggal = document.getElementById('edit-tanggal').value;
    }

    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
        const result = await res.json();
        setLoadingBtn(submitBtn, false, "Simpan Perubahan");

        if (result.status === "success") {
            tutupModalEdit();
            await muatDataDariServer();
        } else {
            alert("Gagal memperbarui data: " + (result.message || "Error tidak diketahui"));
        }
    } catch (err) {
        setLoadingBtn(submitBtn, false, "Simpan Perubahan");
        alert("Terjadi kesalahan jaringan saat update.");
    }
});

// ================= FORM SUBMIT HANDLERS (SAVE DATA) =================
document.getElementById('form-transaksi').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-transaksi');
    setLoadingBtn(submitBtn, true, "Menyimpan...");

    const buktiUrl = await uploadKeImgBB('tr-file');

    const payload = {
        action: "saveData",
        sheet: "TRANSAKSI",
        username: currentUser,
        tipe: document.getElementById('tr-tipe').value,
        mataUang: document.getElementById('tr-mata-uang').value,
        keterangan: document.getElementById('tr-keterangan').value,
        jumlah: bersihkanRibuan(document.getElementById('tr-jumlah').value),
        tanggal: document.getElementById('tr-tanggal').value,
        buktiUrl: buktiUrl
    };

    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
        const result = await res.json();
        setLoadingBtn(submitBtn, false, "Simpan Transaksi");

        if(result.status === "success") {
            this.reset();
            document.getElementById('tr-tanggal').value = new Date().toISOString().split('T')[0];
            muatDataDariServer();
        } else {
            alert("Gagal menyimpan: " + (result.message || "Error tidak diketahui"));
        }
    } catch(err) {
        setLoadingBtn(submitBtn, false, "Simpan Transaksi");
        alert("Terjadi kesalahan jaringan.");
    }
});

document.getElementById('form-hutangpiutang').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-hp');
    setLoadingBtn(submitBtn, true, "Menyimpan...");

    const jenis = document.getElementById('hp-jenis').value;
    const targetSheet = jenis === 'hutang' ? "Hutang" : "Piutang";
    const buktiUrl = await uploadKeImgBB('hp-file');

    const payload = {
        action: "saveData",
        sheet: targetSheet,
        username: currentUser,
        mataUang: document.getElementById('hp-mata-uang').value,
        nama: document.getElementById('hp-nama').value,
        jumlah: bersihkanRibuan(document.getElementById('hp-jumlah').value),
        tanggal: document.getElementById('hp-tanggal').value,
        buktiUrl: buktiUrl
    };

    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
        const result = await res.json();
        setLoadingBtn(submitBtn, false, "Simpan Catatan");

        if(result.status === "success") {
            this.reset();
            document.getElementById('hp-tanggal').value = new Date().toISOString().split('T')[0];
            await muatDataDariServer();
            renderHutangPiutangAktif();
        } else {
            alert("Gagal menyimpan: " + (result.message || "Error tidak diketahui"));
        }
    } catch(err) {
        setLoadingBtn(submitBtn, false, "Simpan Catatan");
        alert("Terjadi kesalahan jaringan.");
    }
});

document.getElementById('form-target').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-target');
    setLoadingBtn(submitBtn, true, "Menyimpan...");

    const buktiUrl = await uploadKeImgBB('wl-file');

    const payload = {
        action: "saveData",
        sheet: "Wishlist",
        username: currentUser,
        mataUang: document.getElementById('wl-mata-uang').value,
        nama: document.getElementById('wl-nama').value,
        target: bersihkanRibuan(document.getElementById('wl-target').value),
        terkumpul: bersihkanRibuan(document.getElementById('wl-terkumpul').value),
        buktiUrl: buktiUrl
    };

    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
        const result = await res.json();
        setLoadingBtn(submitBtn, false, "Simpan Target");

        if(result.status === "success") {
            this.reset();
            await muatDataDariServer();
            renderTargetAktif();
        } else {
            alert("Gagal menyimpan target: " + (result.message || "Error tidak diketahui"));
        }
    } catch(err) {
        setLoadingBtn(submitBtn, false, "Simpan Target");
        alert("Terjadi kesalahan jaringan.");
    }
});

document.getElementById('form-tagihan').addEventListener('submit', async function(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-tagihan');
    setLoadingBtn(submitBtn, true, "Menyimpan...");

    const buktiUrl = await uploadKeImgBB('tg-file');

    const payload = {
        action: "saveData",
        sheet: "Tagihan",
        username: currentUser,
        mataUang: document.getElementById('tg-mata-uang').value,
        nama: document.getElementById('tg-nama').value,
        jumlah: bersihkanRibuan(document.getElementById('tg-jumlah').value),
        tanggal: document.getElementById('tg-tanggal').value,
        buktiUrl: buktiUrl
    };

    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(payload) });
        const result = await res.json();
        setLoadingBtn(submitBtn, false, "Simpan Tagihan");

        if(result.status === "success") {
            this.reset();
            document.getElementById('tg-tanggal').value = new Date().toISOString().split('T')[0];
            await muatDataDariServer();
            renderTagihanAktif();
        } else {
            alert("Gagal menyimpan tagihan: " + (result.message || "Error tidak diketahui"));
        }
    } catch(err) {
        setLoadingBtn(submitBtn, false, "Simpan Tagihan");
        alert("Terjadi kesalahan jaringan.");
    }
});

// ================= DELETE & QUICK UPDATE TARGET =================
async function hapusBarisData(sheetName, rowIndex) {
    if (!confirm("Yakin ingin menghapus / menandai lunas data ini?")) return;
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "deleteData",
                sheet: sheetName,
                rowIndex: rowIndex
            })
        });
        const result = await res.json();
        if (result.status === "success") {
            await muatDataDariServer();
        } else {
            alert("Gagal menghapus: " + (result.message || ""));
        }
    } catch (err) {
        alert("Kesalahan jaringan saat menghapus.");
    }
}

async function tambahSaldoTarget(rowIndex, usernameItem, mataUang, nama, targetNominal, terkumpulLama, buktiUrl) {
    const tambahanStr = prompt(`Tambah tabungan untuk "${nama}" (${mataUang}):\n(Masukkan angka saja, misal: 500000)`);
    if (!tambahanStr) return;
    const tambahan = bersihkanRibuan(tambahanStr);
    if (tambahan <= 0) return;

    const terkumpulBaru = (parseFloat(terkumpulLama) || 0) + tambahan;

    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "updateData",
                sheet: "Wishlist",
                rowIndex: rowIndex,
                username: usernameItem || currentUser,
                mataUang: mataUang,
                nama: nama,
                target: targetNominal,
                terkumpul: terkumpulBaru,
                buktiUrl: buktiUrl || ""
            })
        });
        const result = await res.json();
        if (result.status === "success") {
            await muatDataDariServer();
        } else {
            alert("Gagal memperbarui target: " + (result.message || ""));
        }
    } catch (err) {
        alert("Kesalahan jaringan saat update target.");
    }
}

// ================= FETCH & RENDER DATA =================
async function muatDataDariServer() {
    try {
        const res = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                action: "getData",
                username: currentUser,
                role: currentRole
            })
        });
        const responseJson = await res.json();
        if(responseJson.status === "success" && responseJson.data) {
            globalDataArr = responseJson.data;
            updateTampilanSaldo();
            muatHistoryGlobal();
            renderHutangPiutangAktif();
            renderTargetAktif();
            renderTagihanAktif();
            
            // Panggil render Cyber-Banner & Badge Counter
            renderCyberBannerDanBadge();
        }
    } catch(err) {
        console.error("Gagal memuat data:", err);
    }
}

function getVal(obj, ...keys) {
    for (let k of keys) {
        if (obj[k] !== undefined) return obj[k];
        const foundKey = Object.keys(obj).find(ok => ok.toLowerCase() === k.toLowerCase());
        if (foundKey !== undefined) return obj[foundKey];
    }
    return "";
}

function formatTanggalPendek(tglRaw) {
    if (!tglRaw) return "-";
    const d = new Date(tglRaw);
    if (isNaN(d.getTime())) return tglRaw.toString();
    return d.toISOString().split('T')[0];
}

// Konversi Kurs Real-Time & Budget Guard
function updateTampilanSaldo() {
    const selectedCurr = document.getElementById('filter-mata-uang-saldo').value;
    let totalPemasukan = 0;
    let totalPengeluaran = 0;

    if(globalDataArr.transaksi) {
        globalDataArr.transaksi.forEach(t => {
            const mataUang = getVal(t, 'mataUang', 'Mata Uang', 'MataUang').toString().trim();
            const jml = parseFloat(getVal(t, 'jumlah', 'Jumlah')) || 0;
            const tipe = getVal(t, 'tipe', 'Tipe').toString().toLowerCase().trim();

            if(selectedCurr === 'ALL_IDR') {
                const kurs = KURS_ACUAN[mataUang] || 1;
                const jmlIDR = jml * kurs;
                if(tipe === 'pemasukan') totalPemasukan += jmlIDR;
                else totalPengeluaran += jmlIDR;
            } else if(mataUang === selectedCurr) {
                if(tipe === 'pemasukan') totalPemasukan += jml;
                else totalPengeluaran += jml;
            }
        });
    }

    const saldoBersih = totalPemasukan - totalPengeluaran;
    const labelTampil = selectedCurr === 'ALL_IDR' ? 'IDR' : selectedCurr;

    document.getElementById('total-saldo').innerText = formatUang(saldoBersih, labelTampil);
    document.getElementById('total-pemasukan').innerText = formatUang(totalPemasukan, labelTampil);
    document.getElementById('total-pengeluaran').innerText = formatUang(totalPengeluaran, labelTampil);

    const limitBulanan = parseFloat(localStorage.getItem("danaku_budget_limit")) || 3000000;
    if(document.getElementById('teks-limit-budget')) {
        document.getElementById('teks-limit-budget').innerText = formatUang(limitBulanan, 'IDR');
    }

    const totalSemua = totalPemasukan + totalPengeluaran;
    const pMasuk = totalSemua > 0 ? Math.round((totalPemasukan / totalSemua) * 100) : 50;
    const pKeluar = totalSemua > 0 ? 100 - pMasuk : 50;
    
    if (document.getElementById('stat-persen-masuk')) {
        document.getElementById('stat-persen-masuk').innerText = `${pMasuk}%`;
        document.getElementById('stat-persen-keluar').innerText = `${pKeluar}%`;
        document.getElementById('bar-rasio-masuk').style.width = `${pMasuk}%`;
        document.getElementById('bar-rasio-keluar').style.width = `${pKeluar}%`;

        const badgeBudget = document.getElementById('badge-budget-status');
        const pengeluaranIDR = selectedCurr === 'ALL_IDR' ? totalPengeluaran : totalPengeluaran * (KURS_ACUAN[selectedCurr] || 1);
        if(pengeluaranIDR > limitBulanan) {
            badgeBudget.innerText = "⚠️ BUDGET LEWAT LIMIT!";
            badgeBudget.className = "text-rose-400 font-extrabold uppercase tracking-wider animate-pulse";
        } else if(pengeluaranIDR >= limitBulanan * 0.8) {
            badgeBudget.innerText = "⚡ MENDEKATI LIMIT (80%)";
            badgeBudget.className = "text-amber-400 font-extrabold uppercase tracking-wider";
        } else {
            badgeBudget.innerText = "✅ BUDGET AMAN";
            badgeBudget.className = "text-cyan-400 font-extrabold uppercase tracking-wider";
        }
    }
}

function kumpulkanDataHistory() {
    let totalHistory = [];
    if(globalDataArr.transaksi) {
        globalDataArr.transaksi.forEach(t => {
            totalHistory.push({
                sheetName: 'TRANSAKSI',
                rowIndex: t.rowIndex,
                kategoriMenu: 'transaksi',
                tipe: getVal(t, 'tipe', 'Tipe').toString().toLowerCase().trim(),
                mataUang: getVal(t, 'mataUang', 'Mata Uang', 'MataUang').toString().trim(),
                keterangan: getVal(t, 'keterangan', 'Keterangan'),
                jumlah: getVal(t, 'jumlah', 'Jumlah'),
                tanggal: formatTanggalPendek(getVal(t, 'tanggal', 'Tanggal')),
                bukti: getVal(t, 'buktiUrl', 'Bukti', 'bukti')
            });
        });
    }
    if(globalDataArr.hutang) {
        globalDataArr.hutang.forEach(h => {
            totalHistory.push({
                sheetName: 'Hutang',
                rowIndex: h.rowIndex,
                kategoriMenu: 'hutang',
                tipe: 'pengeluaran',
                mataUang: getVal(h, 'mataUang', 'Mata Uang', 'MataUang').toString().trim(),
                keterangan: `Hutang: ${getVal(h, 'nama', 'Nama')}`,
                jumlah: getVal(h, 'jumlah', 'Jumlah'),
                tanggal: formatTanggalPendek(getVal(h, 'tanggal', 'Tanggal')),
                bukti: getVal(h, 'buktiUrl', 'Bukti', 'bukti')
            });
        });
    }
    if(globalDataArr.piutang) {
        globalDataArr.piutang.forEach(p => {
            totalHistory.push({
                sheetName: 'Piutang',
                rowIndex: p.rowIndex,
                kategoriMenu: 'piutang',
                tipe: 'pemasukan',
                mataUang: getVal(p, 'mataUang', 'Mata Uang', 'MataUang').toString().trim(),
                keterangan: `Piutang: ${getVal(p, 'nama', 'Nama')}`,
                jumlah: getVal(p, 'jumlah', 'Jumlah'),
                tanggal: formatTanggalPendek(getVal(p, 'tanggal', 'Tanggal')),
                bukti: getVal(p, 'buktiUrl', 'Bukti', 'bukti')
            });
        });
    }
    if(globalDataArr.tagihan) {
        globalDataArr.tagihan.forEach(tg => {
            totalHistory.push({
                sheetName: 'Tagihan',
                rowIndex: tg.rowIndex,
                kategoriMenu: 'tagihan',
                tipe: 'pengeluaran',
                mataUang: getVal(tg, 'mataUang', 'Mata Uang', 'MataUang').toString().trim(),
                keterangan: `Tagihan: ${getVal(tg, 'nama', 'Nama')}`,
                jumlah: getVal(tg, 'jumlah', 'Jumlah'),
                tanggal: formatTanggalPendek(getVal(tg, 'tanggal', 'Tanggal')),
                bukti: getVal(tg, 'buktiUrl', 'Bukti', 'bukti')
            });
        });
    }

    totalHistory.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
    return totalHistory;
}

function muatHistoryGlobal() {
    const listContainer = document.getElementById('list-history-global');
    if(!listContainer) return;
    const filterCurr = document.getElementById('filter-mata-uang-history').value;
    const keywordEl = document.getElementById('input-cari-history');
    const keyword = keywordEl ? keywordEl.value.toLowerCase().trim() : "";
    const filterBulan = document.getElementById('filter-bulan-history') ? document.getElementById('filter-bulan-history').value : 'SEMUA';
    const filterTahun = document.getElementById('filter-tahun-history') ? document.getElementById('filter-tahun-history').value : 'SEMUA';

    listContainer.innerHTML = "";
    let totalHistory = kumpulkanDataHistory();

    if(filterCurr !== 'SEMUA') {
        totalHistory = totalHistory.filter(item => item.mataUang === filterCurr);
    }

    if(keyword !== "") {
        totalHistory = totalHistory.filter(item => 
            (item.keterangan && item.keterangan.toLowerCase().includes(keyword)) ||
            (item.kategoriMenu && item.kategoriMenu.toLowerCase().includes(keyword)) ||
            (item.tanggal && item.tanggal.includes(keyword))
        );
    }

    if(filterBulan !== 'SEMUA' || filterTahun !== 'SEMUA') {
        totalHistory = totalHistory.filter(item => {
            if(!item.tanggal || item.tanggal === "-") return false;
            const parts = item.tanggal.split('-');
            const thn = parts[0];
            const bln = parts[1];
            const cocokBulan = (filterBulan === 'SEMUA' || bln === filterBulan);
            const cocokTahun = (filterTahun === 'SEMUA' || thn === filterTahun);
            return cocokBulan && cocokTahun;
        });
    }

    if(totalHistory.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-xs text-slate-500 py-4">Tidak ada history transaksi yang cocok.</p>';
        return;
    }

    totalHistory.forEach(item => {
        const colorTipe = item.tipe === 'pemasukan' ? 'text-emerald-400' : 'text-rose-400';
        const iconTipe = item.tipe === 'pemasukan' ? '➕' : '➖';
        const uangFormatted = formatUang(item.jumlah, item.mataUang);

        listContainer.innerHTML += `
            <div class="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition flex justify-between items-center gap-2">
                <div class="flex items-center gap-2.5">
                    <span class="text-base">${iconTipe}</span>
                    <div>
                        <p class="text-xs font-bold text-slate-100">${item.keterangan}</p>
                        <p class="text-[10px] text-slate-400">${item.tanggal} • <span class="uppercase font-bold text-cyan-400">${item.kategoriMenu}</span></p>
                    </div>
                </div>
                <div class="text-right space-y-1">
                    <p class="text-xs font-extrabold ${colorTipe}">${uangFormatted}</p>
                    <div class="flex items-center justify-end gap-2">
                        ${item.bukti ? `<button onclick="bukaModalBukti('${item.bukti}')" class="text-[10px] text-cyan-400 hover:underline font-semibold">📄 Bukti</button>` : ''}
                        <button onclick="bukaModalEdit('${item.sheetName}', ${item.rowIndex})" class="text-[10px] text-amber-400 font-bold hover:underline">✏️ Edit</button>
                        <button onclick="hapusBarisData('${item.sheetName}', ${item.rowIndex})" class="text-[10px] text-rose-400 hover:underline">Hapus</button>
                    </div>
                </div>
            </div>
        `;
    });
}

function renderHutangPiutangAktif() {
    const listContainer = document.getElementById('list-hutangpiutang-aktif');
    if(!listContainer) return;
    listContainer.innerHTML = "";

    let hpAktif = [];
    if(globalDataArr.hutang) {
        globalDataArr.hutang.forEach(h => hpAktif.push({
            sheetName: 'Hutang',
            rowIndex: h.rowIndex,
            jenis: 'hutang',
            nama: getVal(h, 'nama', 'Nama'),
            mataUang: getVal(h, 'mataUang', 'Mata Uang', 'MataUang').toString().trim(),
            jumlah: getVal(h, 'jumlah', 'Jumlah'),
            tanggal: formatTanggalPendek(getVal(h, 'tanggal', 'Tanggal')),
            bukti: getVal(h, 'buktiUrl', 'Bukti', 'bukti')
        }));
    }
    if(globalDataArr.piutang) {
        globalDataArr.piutang.forEach(p => hpAktif.push({
            sheetName: 'Piutang',
            rowIndex: p.rowIndex,
            jenis: 'piutang',
            nama: getVal(p, 'nama', 'Nama'),
            mataUang: getVal(p, 'mataUang', 'Mata Uang', 'MataUang').toString().trim(),
            jumlah: getVal(p, 'jumlah', 'Jumlah'),
            tanggal: formatTanggalPendek(getVal(p, 'tanggal', 'Tanggal')),
            bukti: getVal(p, 'buktiUrl', 'Bukti', 'bukti')
        }));
    }

    if(hpAktif.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-xs text-slate-500 py-4">Tidak ada catatan hutang/piutang aktif.</p>';
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    hpAktif.forEach(item => {
        const colorJenis = item.jenis === 'hutang' ? 'text-rose-400 bg-rose-950/60 border border-rose-900/50' : 'text-emerald-400 bg-emerald-950/60 border border-emerald-900/50';
        const teksJenis = item.jenis === 'hutang' ? 'Hutang' : 'Piutang';
        const uangFormatted = formatUang(item.jumlah, item.mataUang);

        let badgeTempo = `<p class="text-[10px] text-slate-400">Tempo: ${item.tanggal}</p>`;
        if(item.tanggal && item.tanggal <= todayStr) {
            badgeTempo = `<p class="text-[10px] text-rose-400 font-extrabold animate-pulse">⚠️ JATUH TEMPO / LEWAT</p>`;
        }

        listContainer.innerHTML += `
            <div class="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 hover:border-cyan-500/40 transition flex justify-between items-center gap-2">
                <div>
                    <span class="px-2 py-0.5 rounded-md text-[9px] font-bold ${colorJenis}">${teksJenis}</span>
                    <p class="text-xs font-bold text-slate-100 mt-1">${item.nama}</p>
                    ${badgeTempo}
                </div>
                <div class="text-right space-y-1">
                    <p class="text-xs font-extrabold ${item.jenis === 'hutang' ? 'text-rose-400' : 'text-emerald-400'}">${uangFormatted}</p>
                    <div class="flex items-center justify-end gap-2">
                        ${item.bukti ? `<button onclick="bukaModalBukti('${item.bukti}')" class="text-[10px] text-cyan-400 hover:underline font-semibold">📄 Bukti</button>` : ''}
                        <button onclick="bukaModalEdit('${item.sheetName}', ${item.rowIndex})" class="text-[10px] text-amber-400 font-bold hover:underline">✏️ Edit</button>
                        <button onclick="hapusBarisData('${item.sheetName}', ${item.rowIndex})" class="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800/50 rounded text-[10px] font-bold hover:bg-emerald-900">✓ Lunas</button>
                    </div>
                </div>
            </div>
        `;
    });
}

function renderTargetAktif() {
    const listContainer = document.getElementById('list-target-aktif');
    if(!listContainer) return;
    listContainer.innerHTML = "";

    const listWl = globalDataArr.wishlist || [];
    if(listWl.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-xs text-slate-500 py-4">Belum ada target tabungan.</p>';
        return;
    }

    listWl.forEach(wl => {
        const usernameItem = getVal(wl, 'username', 'Username');
        const nama = getVal(wl, 'nama', 'Nama');
        const mataUang = getVal(wl, 'mataUang', 'Mata Uang', 'MataUang').toString().trim();
        const target = parseFloat(getVal(wl, 'target', 'Target')) || 0;
        const terkumpul = parseFloat(getVal(wl, 'terkumpul', 'Terkumpul')) || 0;
        const bukti = getVal(wl, 'buktiUrl', 'Bukti', 'bukti');
        const persen = target > 0 ? Math.min(100, Math.round((terkumpul / target) * 100)) : 0;

        listContainer.innerHTML += `
            <div class="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 hover:border-amber-500/40 transition space-y-2">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-xs font-bold text-slate-100">${nama}</p>
                        <p class="text-[10px] text-slate-400 mt-0.5">Terkumpul: <span class="font-bold text-amber-400">${formatUang(terkumpul, mataUang)}</span> / ${formatUang(target, mataUang)}</p>
                    </div>
                    <span class="px-2 py-0.5 bg-amber-950/80 text-amber-400 border border-amber-800/50 rounded-md text-[10px] font-extrabold">${persen}%</span>
                </div>
                <div class="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div class="bg-gradient-to-r from-amber-500 to-cyan-400 h-2 rounded-full transition-all" style="width: ${persen}%"></div>
                </div>
                <div class="flex items-center justify-end gap-2 pt-1">
                    ${bukti ? `<button onclick="bukaModalBukti('${bukti}')" class="text-[10px] text-cyan-400 hover:underline font-semibold">🖼️ Foto</button>` : ''}
                    <button onclick="tambahSaldoTarget(${wl.rowIndex}, '${usernameItem}', '${mataUang}', '${nama.replace(/'/g, "\\'")}', ${target}, ${terkumpul}, '${bukti}')" class="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-bold">+ Tabung</button>
                    <button onclick="bukaModalEdit('Wishlist', ${wl.rowIndex})" class="text-[10px] text-amber-400 font-bold hover:underline">✏️ Edit</button>
                    <button onclick="hapusBarisData('Wishlist', ${wl.rowIndex})" class="text-[10px] text-rose-400 hover:underline">Hapus</button>
                </div>
            </div>
        `;
    });
}

function renderTagihanAktif() {
    const listContainer = document.getElementById('list-tagihan-aktif');
    if(!listContainer) return;
    listContainer.innerHTML = "";

    const listTg = globalDataArr.tagihan || [];
    if(listTg.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-xs text-slate-500 py-4">Belum ada tagihan aktif.</p>';
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];

    listTg.forEach(tg => {
        const nama = getVal(tg, 'nama', 'Nama');
        const mataUang = getVal(tg, 'mataUang', 'Mata Uang', 'MataUang').toString().trim();
        const jumlah = getVal(tg, 'jumlah', 'Jumlah');
        const tanggal = formatTanggalPendek(getVal(tg, 'tanggal', 'Tanggal'));
        const bukti = getVal(tg, 'buktiUrl', 'Bukti', 'bukti');

        let badgeTempo = `<p class="text-[10px] text-slate-400">Jatuh Tempo: ${tanggal}</p>`;
        if(tanggal && tanggal <= todayStr) {
            badgeTempo = `<p class="text-[10px] text-rose-400 font-extrabold animate-pulse">⚠️ TAGIHAN LEWAT TEMPO!</p>`;
        }

        listContainer.innerHTML += `
            <div class="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 hover:border-rose-500/40 transition flex justify-between items-center gap-2">
                <div>
                    <span class="px-2 py-0.5 rounded-md text-[9px] font-bold bg-rose-950/60 text-rose-400 border border-rose-900/50">Tagihan</span>
                    <p class="text-xs font-bold text-slate-100 mt-1">${nama}</p>
                    ${badgeTempo}
                </div>
                <div class="text-right space-y-1">
                    <p class="text-xs font-extrabold text-rose-400">${formatUang(jumlah, mataUang)}</p>
                    <div class="flex items-center justify-end gap-2">
                        ${bukti ? `<button onclick="bukaModalBukti('${bukti}')" class="text-[10px] text-cyan-400 hover:underline font-semibold">📄 Bukti</button>` : ''}
                        <button onclick="bukaModalEdit('Tagihan', ${tg.rowIndex})" class="text-[10px] text-amber-400 font-bold hover:underline">✏️ Edit</button>
                        <button onclick="hapusBarisData('Tagihan', ${tg.rowIndex})" class="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800/50 rounded text-[10px] font-bold hover:bg-emerald-900">✓ Bayar</button>
                    </div>
                </div>
            </div>
        `;
    });
}

function formatUang(nominal, mataUang) {
    if(isAntiIntipActive) return "••••••••";
    const num = parseFloat(nominal) || 0;
    switch(mataUang) {
        case 'IDR': return 'Rp ' + num.toLocaleString('id-ID');
        case 'USD': return '$ ' + num.toLocaleString('en-US');
        case 'RINGGIT': return 'RM ' + num.toLocaleString('ms-MY');
        case 'KHMR': return '៛ ' + num.toLocaleString('km-KH');
        case 'BAHT': return '฿ ' + num.toLocaleString('th-TH');
        case 'AMD': return '֏ ' + num.toLocaleString('hy-AM');
        default: return num.toLocaleString('id-ID');
    }
}

function toggleAntiIntip() {
    isAntiIntipActive = !isAntiIntipActive;
    updateTampilanSaldo();
    muatHistoryGlobal();
    renderHutangPiutangAktif();
    renderTargetAktif();
    renderTagihanAktif();
}