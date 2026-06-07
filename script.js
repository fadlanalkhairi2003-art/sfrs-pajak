/* =========================================================
   SFRS — Smart Fiscal Reconciliation System
   JavaScript — Transaksi, Rekonsiliasi, PPh Otomatis, & PPT Fullscreen
   ========================================================= */

// App state
let transaksi    = [];
let profil       = {};
let tarifPPh     = 22;
let chartBeban, chartKoreksi, chartTren;
let isDark       = true;

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    document.getElementById('loadingScreen').classList.add('hidden');
    const session = localStorage.getItem('sfrs_session');
    if (session) showApp(); else showLogin();
  }, 1800);

  loadState();
  applyTheme(localStorage.getItem('sfrs_theme') || 'dark');

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault(); navigateTo(el.dataset.page);
    });
  });

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  document.getElementById('togglePw').addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    const icon = document.getElementById('togglePw');
    if (inp.type === 'password') {
      inp.type = 'text'; icon.className = 'bi bi-eye toggle-pw';
    } else {
      inp.type = 'password'; icon.className = 'bi bi-eye-slash toggle-pw';
    }
  });

  document.getElementById('loginPassword').addEventListener('keypress', e => {
    if (e.key === 'Enter') doLogin();
  });

  // AUTO-UBAH DROPDOWN SAAT KETIK MANUAL
  const inputNamaAkun = document.getElementById('trxNama');
  if (inputNamaAkun) {
    inputNamaAkun.addEventListener('input', function(e) {
      document.getElementById('trxFiskal').value = autoTentukanFiskal(e.target.value);
    });
  }
});

/* --- LOAD & SAVE --- */
function loadState() {
  const savedTrx = localStorage.getItem('sfrs_transaksi');
  transaksi = savedTrx ? JSON.parse(savedTrx) : [];
  const savedProfil = localStorage.getItem('sfrs_profil');
  profil = savedProfil ? JSON.parse(savedProfil) : {};
  tarifPPh = parseFloat(localStorage.getItem('sfrs_tarif') || '22');
}
function saveTrxState()    { localStorage.setItem('sfrs_transaksi', JSON.stringify(transaksi)); }
function saveProfilState() { localStorage.setItem('sfrs_profil',    JSON.stringify(profil)); }
function saveTarifState()  { localStorage.setItem('sfrs_tarif',     tarifPPh); }

/* --- THEME --- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('sfrs_theme', theme);
  isDark = (theme === 'dark');
  const icon = document.querySelector('#themeToggle i');
  if (icon) icon.className = isDark ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill';
  if (chartBeban) refreshCharts();
}

/* --- AUTH --- */
function doLogin() {
  const user = document.getElementById('loginUsername').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const alert = document.getElementById('loginAlert');
  
  if (user === 'FMN' && pass === 'FMN26') {
    alert.classList.add('d-none');
    localStorage.setItem('sfrs_session', user);
    showApp();
  } else {
    alert.classList.remove('d-none');
    const card = document.querySelector('.login-card');
    card.style.animation = 'none';
    setTimeout(() => { card.style.animation = 'shake 0.4s ease-out'; }, 10);
  }
}
function doLogout() {
  if (!confirm('Yakin ingin keluar?')) return;
  localStorage.removeItem('sfrs_session');
  document.getElementById('mainApp').classList.add('d-none');
  document.getElementById('loginPage').classList.remove('d-none');
}
function showLogin() {
  document.getElementById('loginPage').classList.remove('d-none');
  document.getElementById('mainApp').classList.add('d-none');
}
function showApp() {
  document.getElementById('loginPage').classList.add('d-none');
  document.getElementById('mainApp').classList.remove('d-none');
  document.getElementById('topbarUser').textContent = localStorage.getItem('sfrs_session') || 'Pengguna';
  renderTrxTable();
  updateDashboard();
  loadProfilForm();
  document.getElementById('settingTarif').value = tarifPPh;
  navigateTo('dashboard');
}

/* --- NAV --- */
function navigateTo(page) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
  
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navItem) navItem.classList.add('active');
  
  const titles = { dashboard: 'Dashboard', profil: 'Profil Perusahaan', transaksi: 'Input Transaksi', import: 'Import Excel', rekonsiliasi: 'Rekonsiliasi Fiskal', laporan: 'Laporan', settings: 'Settings' };
  document.getElementById('topbarTitle').textContent = titles[page] || page;
  document.getElementById('sidebar').classList.remove('open');
  
  if (page === 'dashboard') setTimeout(updateDashboard, 50);
  if (page === 'laporan') loadLaporan();
  if (page === 'rekonsiliasi') hitungRekonsiliasi();
}

/* --- DASHBOARD & PENGHITUNGAN PPH (OTOMATIS PASAL 31E) --- */
function updateDashboard() {
  const calc = computeFiskal();
  document.getElementById('kpiPendapatan').textContent   = formatRp(calc.totalPendapatan);
  document.getElementById('kpiBeban').textContent        = formatRp(calc.totalBeban);
  document.getElementById('kpiKorPos').textContent       = formatRp(calc.totalKorPos);
  document.getElementById('kpiKorNeg').textContent       = formatRp(calc.totalKorNeg);
  document.getElementById('kpiLabaFiskal').textContent   = formatRp(calc.labaFiskal);
  document.getElementById('kpiPPh').textContent          = formatRp(calc.estimasiPPh);
  renderCharts(calc);
}

function computeFiskal() {
  let totalPendapatan = 0, totalBeban = 0;
  let totalKorPos = 0, totalKorNeg = 0;

  transaksi.forEach(t => {
    const n = parseFloat(t.nominal) || 0;
    const kat = (t.kategori || '').toLowerCase();
    
    if (kat.includes('pendapatan')) totalPendapatan += n;
    else totalBeban += n;

    if (t.fiskal === 'Koreksi Positif') totalKorPos += n;
    if (t.fiskal === 'Koreksi Negatif') totalKorNeg += n;
  });

  const labaKomersial = totalPendapatan - totalBeban;
  const labaFiskal    = labaKomersial + totalKorPos - totalKorNeg;
  
  let estimasiPPh = 0;
  let tarifAktif = tarifPPh + "%";

  if (labaFiskal > 0) {
    if (totalPendapatan <= 4800000000) {
      estimasiPPh = labaFiskal * (tarifPPh / 100) * 0.5;
      tarifAktif = "11% (Omzet \u2264 4,8M)";
    } 
    else if (totalPendapatan > 4800000000 && totalPendapatan <= 50000000000) {
      const pkpDapatFasilitas = (4800000000 / totalPendapatan) * labaFiskal;
      const pkpTidakDapatFasilitas = labaFiskal - pkpDapatFasilitas;

      const pphFasilitas = pkpDapatFasilitas * (tarifPPh / 100) * 0.5;
      const pphNonFasilitas = pkpTidakDapatFasilitas * (tarifPPh / 100);

      estimasiPPh = pphFasilitas + pphNonFasilitas;
      tarifAktif = "Pasal 31E (Proporsional)";
    } 
    else {
      estimasiPPh = labaFiskal * (tarifPPh / 100);
      tarifAktif = tarifPPh + "% (Normal)";
    }
  } else {
    tarifAktif = "0% (Rugi Fiskal)";
  }

  return { totalPendapatan, totalBeban, totalKorPos, totalKorNeg, labaKomersial, labaFiskal, estimasiPPh, tarifAktif };
}

/* --- PROFIL --- */
function loadProfilForm() {
  if (!profil) return;
  document.getElementById('profilNama').value   = profil.nama   || '';
  document.getElementById('profilNPWP').value   = profil.npwp   || '';
  document.getElementById('profilAlamat').value = profil.alamat || '';
  document.getElementById('profilEmail').value  = profil.email  || '';
  document.getElementById('profilTelp').value   = profil.telp   || '';
  document.getElementById('profilTahun').value  = profil.tahun  || '';
  document.getElementById('profilJenis').value  = profil.jenis  || '';
}
function saveProfil() {
  profil = {
    nama:   document.getElementById('profilNama').value.trim(),
    npwp:   document.getElementById('profilNPWP').value.trim(),
    alamat: document.getElementById('profilAlamat').value.trim(),
    email:  document.getElementById('profilEmail').value.trim(),
    telp:   document.getElementById('profilTelp').value.trim(),
    tahun:  document.getElementById('profilTahun').value.trim(),
    jenis:  document.getElementById('profilJenis').value,
  };
  saveProfilState();
  showToast('Profil perusahaan disimpan!');
}

/* --- TRANSAKSI --- */
function saveTrx() {
  const tanggal  = document.getElementById('trxTanggal').value;
  const nama     = document.getElementById('trxNama').value.trim();
  const kategori = document.getElementById('trxKategori').value;
  const nominal  = parseFloat(document.getElementById('trxNominal').value) || 0;
  const fiskal   = document.getElementById('trxFiskal').value;
  const ket      = document.getElementById('trxKet').value.trim();

  if (!tanggal || !nama || !nominal) {
    showToast('Tanggal, nama akun, dan nominal wajib diisi!', true); return;
  }
  
  transaksi.push({ tanggal, nama, kategori, nominal, fiskal, ket });
  saveTrxState();
  renderTrxTable();
  resetTrx();
  showToast('Transaksi berhasil disimpan!');
}

function resetTrx() {
  document.getElementById('trxTanggal').value  = '';
  document.getElementById('trxNama').value     = '';
  document.getElementById('trxKategori').value = 'Pendapatan';
  document.getElementById('trxNominal').value  = '';
  document.getElementById('trxFiskal').value   = 'Sesuai';
  document.getElementById('trxKet').value      = '';
}

function renderTrxTable() {
  const body = document.getElementById('trxBody');
  if (!transaksi.length) {
    body.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Belum ada transaksi</td></tr>`;
    return;
  }
  body.innerHTML = transaksi.map((t, i) => {
    let badgeClass = t.fiskal === 'Koreksi Positif' ? 'badge-korpos' : (t.fiskal === 'Koreksi Negatif' ? 'badge-korneg' : 'badge-deductible');
    return `
      <tr>
        <td>${t.tanggal}</td>
        <td><strong>${t.nama}</strong></td>
        <td>${t.kategori}</td>
        <td class="fw-600">${formatRp(t.nominal)}</td>
        <td><span class="${badgeClass}">${t.fiskal}</span></td>
        <td>
          <button class="btn-action del" onclick="deleteTrx(${i})" title="Hapus"><i class="bi bi-trash3-fill"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}
function deleteTrx(index) {
  transaksi.splice(index, 1);
  saveTrxState(); renderTrxTable(); updateDashboard();
}
function clearTrx() {
  if (!confirm('Hapus semua transaksi?')) return;
  transaksi = [];
  saveTrxState(); renderTrxTable(); updateDashboard();
}

/* --- REKONSILIASI --- */
function hitungRekonsiliasi() {
  const akunMap = {};
  
  transaksi.forEach(t => {
    const key = t.nama + '|' + t.kategori;
    if (!akunMap[key]) {
      akunMap[key] = { nama: t.nama, kategori: t.kategori, komersial: 0, pos: 0, neg: 0, fiskal: 0 };
    }
    akunMap[key].komersial += parseFloat(t.nominal);
    
    if(t.fiskal === 'Koreksi Positif') akunMap[key].pos += parseFloat(t.nominal);
    if(t.fiskal === 'Koreksi Negatif') akunMap[key].neg += parseFloat(t.nominal);
  });

  const body = document.getElementById('rekonBody');
  const listPos = document.getElementById('listKoreksiPositif');
  const listNeg = document.getElementById('listKoreksiNegatif');
  
  body.innerHTML = '';
  listPos.innerHTML = '';
  listNeg.innerHTML = '';

  let totalKom = 0, totalPos = 0, totalNeg = 0;
  
  Object.values(akunMap).forEach(a => {
    let isPendapatan = a.kategori.toLowerCase().includes('pendapatan');
    
    if(isPendapatan) {
        a.fiskal = a.komersial + a.pos - a.neg;
        totalKom += a.komersial;
    } else {
        a.fiskal = a.komersial - a.pos + a.neg;
        totalKom -= a.komersial;
    }

    totalPos += a.pos;
    totalNeg += a.neg;

    body.innerHTML += `
      <tr>
        <td>
          <div class="fw-bold">${a.nama}</div>
          <div style="font-size:11px;color:var(--text-muted)">${a.kategori}</div>
        </td>
        <td>${formatRp(a.komersial)}</td>
        <td class="text-warning fw-bold">${a.pos > 0 ? formatRp(a.pos) : '—'}</td>
        <td class="text-info fw-bold">${a.neg > 0 ? formatRp(a.neg) : '—'}</td>
        <td class="fw-bold text-success">${formatRp(a.fiskal)}</td>
      </tr>
    `;

    if(a.pos > 0) {
        listPos.innerHTML += `<li class="list-group-item bg-transparent text-light d-flex justify-content-between align-items-center">
            ${a.nama} <span class="badge bg-warning text-dark rounded-pill">${formatRp(a.pos)}</span>
        </li>`;
    }
    if(a.neg > 0) {
        listNeg.innerHTML += `<li class="list-group-item bg-transparent text-light d-flex justify-content-between align-items-center">
            ${a.nama} <span class="badge bg-info text-dark rounded-pill">${formatRp(a.neg)}</span>
        </li>`;
    }
  });

  if (Object.keys(akunMap).length === 0) {
      body.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Belum ada transaksi</td></tr>`;
      listPos.innerHTML = `<li class="list-group-item bg-transparent text-muted">Tidak ada koreksi</li>`;
      listNeg.innerHTML = `<li class="list-group-item bg-transparent text-muted">Tidak ada koreksi</li>`;
  }

  const labaFiskal = totalKom + totalPos - totalNeg;
  
  document.getElementById('rekonFoot').innerHTML = `
    <tr>
      <td><strong>LABA (RUGI) TOTAL</strong></td>
      <td><strong>${formatRp(totalKom)}</strong></td>
      <td class="text-warning"><strong>${formatRp(totalPos)}</strong></td>
      <td class="text-info"><strong>${formatRp(totalNeg)}</strong></td>
      <td class="text-success"><strong>${formatRp(labaFiskal)}</strong></td>
    </tr>
  `;
}

/* --- LAPORAN --- */
function loadLaporan() {
  const calc = computeFiskal();
  document.getElementById('lapNama').textContent    = profil.nama   || '—';
  document.getElementById('lapNPWP').textContent    = profil.npwp   || '—';
  document.getElementById('lapTahun').textContent   = profil.tahun  || '—';
  
  document.getElementById('lapTarif').textContent   = calc.tarifAktif;
  document.getElementById('lapTarifPPh').textContent = calc.tarifAktif;
  
  document.getElementById('lapLabaKom').textContent    = formatRp(calc.labaKomersial);
  document.getElementById('lapKorPos').textContent     = formatRp(calc.totalKorPos);
  document.getElementById('lapKorNeg').textContent     = formatRp(calc.totalKorNeg);
  document.getElementById('lapLabaFiskal').textContent = formatRp(calc.labaFiskal);
  document.getElementById('lapPPh').textContent        = formatRp(calc.estimasiPPh);
}
function printReport() { loadLaporan(); window.print(); }

/* --- SETTINGS --- */
function saveTarif() {
  const val = parseFloat(document.getElementById('settingTarif').value);
  if (isNaN(val) || val < 0 || val > 100) return showToast('Tarif tidak valid!', true);
  tarifPPh = val; saveTarifState(); updateDashboard(); showToast('Tarif disimpan!');
}
function resetAllData() {
  if (!confirm('Yakin hapus SEMUA data?')) return;
  transaksi = []; saveTrxState(); renderTrxTable(); showToast('Data direset!');
}

/* --- AUTO-DETEKSI FISKAL (Berdasarkan UU PPh No. 36 Tahun 2008) --- */
function autoTentukanFiskal(namaAkun) {
  const nama = namaAkun.toLowerCase();
  
  // 1. KOREKSI POSITIF (Berdasarkan Pasal 9 ayat 1 UU PPh No. 36 Tahun 2008)
  if (
      nama.includes('sanksi') || 
      nama.includes('denda pajak') || 
      nama.includes('pajak penghasilan') || 
      nama.includes('pph') || 
      nama.includes('natura') || 
      nama.includes('kenikmatan') || 
      nama.includes('kepentingan pribadi') || 
      nama.includes('prive') || 
      nama.includes('pembagian laba') || 
      nama.includes('cadangan') || 
      (nama.includes('sumbangan') && !nama.includes('bencana') && !nama.includes('pendidikan') && !nama.includes('olahraga'))
  ) {
    return 'Koreksi Positif';
  }
  
  // 2. KOREKSI NEGATIF (Berdasarkan Pasal 4 ayat 2 dan Pasal 4 ayat 3 UU PPh No. 36 Tahun 2008)
  if (
      nama.includes('bunga deposito') || 
      nama.includes('tabungan') || 
      nama.includes('jasa giro') || 
      nama.includes('hadiah undian') || 
      nama.includes('sewa tanah') || 
      nama.includes('sewa bangunan') || 
      nama.includes('jasa konstruksi') || 
      nama.includes('dividen diterima') || 
      nama.includes('laba cv') || 
      nama.includes('laba firma')
  ) {
    return 'Koreksi Negatif';
  }

  // 3. SESUAI KOMERSIAL (Deductible Expense / Taxable Income)
  return 'Sesuai';
}

/* --- EXCEL IMPORT --- */
function downloadTemplate() {
  const ws_data = [
    ['Tanggal', 'Nama Akun', 'Kategori', 'Nominal', 'Keterangan'],
    ['2024-01-01', 'Pendapatan Usaha', 'Pendapatan', 500000000, 'Pendapatan bulan Januari'],
    ['2024-01-10', 'Beban Sanksi Pajak', 'Beban Lainnya', 5000000, 'Denda STP'],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws['!cols'] = [{wch:14},{wch:30},{wch:18},{wch:18},{wch:30}];
  XLSX.utils.book_append_sheet(wb, ws, 'Template Transaksi');
  XLSX.writeFile(wb, 'Template_Transaksi_SFRS.xlsx');
}

function importExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

      if (rows.length < 2) {
        showToast('File Excel kosong atau format salah!', true);
        document.getElementById('excelInput').value = '';
        return;
      }

      let importedCount = 0;
      let failedCount = 0;

      rows.slice(1).forEach(row => {
        if (!row[0] && !row[1] && !row[3]) return; 

        const tanggal  = String(row[0]).trim();
        const nama     = String(row[1]).trim();
        const kategori = String(row[2]).trim() || 'Pendapatan';
        
        let rawNominal = String(row[3] || '0').replace(/Rp/gi, '').replace(/\s/g, '');
        rawNominal = rawNominal.replace(/\./g, '');
        rawNominal = rawNominal.replace(/,/g, '.');
        
        const nominal  = parseFloat(rawNominal) || 0;
        
        // Memanggil fungsi auto-deteksi berdasarkan nama akun sesuai UU 36 Tahun 2008
        const fiskal   = autoTentukanFiskal(nama);
        
        const ket      = String(row[4] || '').trim();

        if (tanggal !== '' && nama !== '' && !isNaN(nominal)) {
          transaksi.push({ tanggal, nama, kategori, nominal, fiskal, ket });
          importedCount++;
        } else {
          failedCount++;
        }
      });

      if (importedCount > 0) {
        saveTrxState();
        renderTrxTable();
        updateDashboard();
        
        let msg = `${importedCount} transaksi berhasil diimport!`;
        if (failedCount > 0) {
            msg += ` (${failedCount} baris gagal karena data tidak lengkap)`;
        }
        showToast(msg);
        navigateTo('transaksi'); 
      } else {
        showToast('Tidak ada data valid yang diimport. Pastikan kolom Tanggal, Nama Akun, dan Nominal terisi.', true);
      }
    } catch (error) {
      showToast('Gagal membaca file Excel! Pastikan file tidak rusak.', true);
    }
    document.getElementById('excelInput').value = '';
  };
  reader.readAsArrayBuffer(file);
}

/* --- CHARTS --- */
function renderCharts(calc) {
  const textColor = isDark ? '#8b949e' : '#4a5568';
  Chart.defaults.color = textColor;
  
  const bebanMap = {};
  transaksi.forEach(t => {
    if (!t.kategori.toLowerCase().includes('pendapatan')) bebanMap[t.kategori] = (bebanMap[t.kategori] || 0) + parseFloat(t.nominal);
  });
  
  if (chartBeban) chartBeban.destroy();
  chartBeban = new Chart(document.getElementById('chartBeban'), {
    type: 'doughnut',
    data: { labels: Object.keys(bebanMap), datasets: [{ data: Object.values(bebanMap), backgroundColor: ['#1f6feb','#3fb950','#d29922','#f85149'] }] },
    options: { responsive: true, cutout: '65%', plugins: { legend: { position: 'bottom' } } }
  });

  if (chartKoreksi) chartKoreksi.destroy();
  chartKoreksi = new Chart(document.getElementById('chartKoreksi'), {
    type: 'bar',
    data: { labels: ['Laba Kom', 'Kor (+)', 'Kor (-)', 'Fiskal'], datasets: [{ data: [calc.labaKomersial, calc.totalKorPos, calc.totalKorNeg, calc.labaFiskal], backgroundColor: ['#1f6feb','#d29922','#58a6ff','#3fb950'] }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  if (chartTren) chartTren.destroy();
  chartTren = new Chart(document.getElementById('chartTren'), {
    type: 'line',
    data: { labels: ['Awal', 'Akhir'], datasets: [{ data: [0, calc.labaKomersial], borderColor: '#1f6feb', tension: 0.4 }] },
    options: { responsive: true }
  });
}
function refreshCharts() { updateDashboard(); }

/* --- FULLSCREEN PPT SLIDESHOW KELOMPOK --- */
let slideInterval;
const modalKelompokEl = document.getElementById('modalKelompok');

if (modalKelompokEl) {
  
  modalKelompokEl.addEventListener('show.bs.modal', () => {
    const audio = document.getElementById('anthemMU');
    if(audio) {
      audio.currentTime = 0;
      audio.volume = 0.8; 
      
      let playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.log('Browser membutuhkan interaksi klik sebelumnya untuk memutar audio.', error);
        });
      }
    }

    let currentSlide = 1;
    const totalSlides = 3;

    for(let i = 1; i <= totalSlides; i++) {
      let slide = document.getElementById(`slide-${i}`);
      if(slide) slide.classList.remove('slide-active');
    }

    let slide1 = document.getElementById(`slide-1`);
    if(slide1) slide1.classList.add('slide-active');

    slideInterval = setInterval(() => {
      let currentEl = document.getElementById(`slide-${currentSlide}`);
      if(currentEl) currentEl.classList.remove('slide-active');
      
      currentSlide++;
      if (currentSlide > totalSlides) currentSlide = 1;
      
      let nextEl = document.getElementById(`slide-${currentSlide}`);
      if(nextEl) nextEl.classList.add('slide-active');
    }, 4000);
  });

  modalKelompokEl.addEventListener('hidden.bs.modal', () => {
    const audio = document.getElementById('anthemMU');
    if(audio) audio.pause();

    clearInterval(slideInterval);

    for(let i = 1; i <= 3; i++) {
      let slide = document.getElementById(`slide-${i}`);
      if(slide) slide.classList.remove('slide-active');
    }
  });
}

/* --- HELPERS --- */
function formatRp(n) { return 'Rp ' + Math.abs(n || 0).toLocaleString('id-ID'); }
function showToast(msg, isError = false) {
  const t = document.getElementById('sfrsToast');
  document.getElementById('toastMsg').textContent = msg;
  if(isError) { t.classList.add('toast-error'); } else { t.classList.remove('toast-error'); }
  bootstrap.Toast.getOrCreateInstance(t).show();
}