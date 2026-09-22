/* ============================================================
 * Buku Kas — Pembukuan
 * Aplikasi pencatatan kas berbasis Supabase.
 *
 * Struktur kode:
 *   1. Konfigurasi
 *   2. State
 *   3. Ikon SVG
 *   4. Utilitas
 *   5. Helper filter periode
 *   6. Lapisan data Supabase
 *   7. Aksi CRUD & muat data
 *   8. Grafik tren
 *   9. Ekspor PDF
 *  10. Render: komponen kecil
 *  11. Render: tampilan pengguna (Buku Saya)
 *  12. Render: tampilan admin
 *  13. Render: modal
 *  14. Render: auth & config
 *  15. Event handling & binding form
 *  16. Init
 * ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // 1. KONFIGURASI — ganti dua nilai di bawah dengan milik kamu
  //    (Supabase dashboard -> Project Settings -> API)
  // ============================================================
  const SUPABASE_URL = 'https://akwldhlvhuqjvrfpbwky.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrd2xkaGx2aHVxanZyZnBid2t5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDA0MDQsImV4cCI6MjEwMjM3NjQwNH0.DwhzR1xPswhlGxO2kNZxGPgxClrXAvcbMgxynaW_vxM';
  const CONFIG_OK = !SUPABASE_URL.includes('GANTI_') && !SUPABASE_ANON_KEY.includes('GANTI_');

  const PEMASUKAN = 'pemasukan';
  const PENGELUARAN = 'pengeluaran';

  // ============================================================
  // 2. STATE — satu-satunya sumber kebenaran antarmuka
  // ============================================================
  const state = {
    // sesi & profil
    session: null,
    dataReady: false,
    txReady: false,
    isAdmin: false,

    // pembukuan & transaksi
    books: [],
    activeBookId: null,
    transactions: [],
    activeTab: PEMASUKAN,
    search: '',

    // master data global (kategori & metode pembayaran dari admin)
    categories: [],
    paymentMethods: [],

    // modal aktif
    modal: null,
    exportMenu: false,

    // layar auth
    authView: 'signin',
    authError: '',
    authNotice: '',
    authBusy: false,

    // area admin
    view: 'buku',          // 'buku' | 'admin' | 'master'
    adminDataReady: false,
    adminUsers: [],
    adminBooks: [],
    adminTransactions: [],
    adminDrillUserId: null,
    adminUserSearch: '',
    adminTxSearch: '',
    masterTab: 'kategori', // 'kategori' | 'metode'

    // filter periode
    filter: { type: 'all', value: '' },
    adminFilter: { type: 'all', value: '' },

    // lampiran nota: cache signed URL (path -> { url, exp }) & status unggah
    notaUrls: {},
    notaBusy: false,
    notaViewer: null,   // penampil lampiran (lapisan di atas modal yang sedang terbuka)
    infoBox: null,      // kotak pemberitahuan (mis. format gambar tidak tersedia)

    // instance grafik Chart.js
    chart: null
  };

  const appEl = document.getElementById('app');
  let sb = null;

  // ============================================================
  // 3. IKON SVG
  // ============================================================
  const ICONS = {
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    starFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    paperclip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
  };

  // ============================================================
  // 4. UTILITAS
  // ============================================================
  const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function formatRupiah(n) {
    const num = Number(n) || 0;
    // Konvensi konsisten dengan input jumlah: pemisah ribuan memakai koma (1,000,000)
    return 'Rp' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function compactRupiah(n) {
    const num = Number(n) || 0;
    if (num >= 1000000000) return (num / 1000000000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' M';
    if (num >= 1000000) return (num / 1000000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' jt';
    if (num >= 1000) return (num / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' rb';
    return String(num);
  }

  // ---------- Helper angka untuk input jumlah ----------
  // Saat user mengetik, angka diberi pemisah ribuan (koma) secara langsung
  // agar langsung terlihat apakah ratusan / ribuan / jutaan.
  function amountDigits(str) {
    return String(str).replace(/[^\d]/g, '');
  }

  function formatAmountInput(str) {
    const d = amountDigits(str).replace(/^0+(?=\d)/, '');
    return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
  }

  // Ubah teks terformat (1,000,000) kembali menjadi angka integer murni.
  function parseAmountInput(str) {
    const d = amountDigits(str);
    if (!d) return null;
    const n = parseInt(d, 10);
    return isNaN(n) ? null : n;
  }

  // Format langsung di dalam input sambil menjaga posisi kursor (tanpa re-render).
  function formatAmountField(el) {
    const raw = el.value;
    const digits = amountDigits(raw);
    if (!digits) { if (el.value !== '') el.value = ''; return; }
    const caret = (el.selectionStart != null) ? el.selectionStart : raw.length;
    const prefix = raw.slice(0, caret);
    const prefixDigits = amountDigits(prefix);
    const formatted = formatAmountInput(digits);
    if (el.value === formatted) return;
    el.value = formatted;
    const newCaret = formatAmountInput(prefixDigits).length;
    el.setSelectionRange(newCaret, newCaret);
  }

  // ---------- Pemulihan kondisi layar antar sesi ----------
  // Menyimpan posisi user (buku aktif, tab, filter, dst.) agar bila browser
  // benar-benar me-refresh halaman, tampilan kembali seperti semula.
  function uiStateKey() {
    return state.session ? 'bukukas-ui-' + state.session.user.id : null;
  }

  function saveUiState() {
    const key = uiStateKey();
    if (!key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify({
        activeBookId: state.activeBookId,
        activeTab: state.activeTab,
        search: state.search,
        filter: { type: state.filter.type, value: state.filter.value },
        adminFilter: { type: state.adminFilter.type, value: state.adminFilter.value },
        view: state.view
      }));
    } catch (e) { /* abaikan bila penyimpanan penuh / tidak tersedia */ }
  }

  function restoreSavedUiState() {
    const key = uiStateKey();
    if (!key) return;
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(key)); } catch (e) { return; }
    if (!saved) return;
    if (saved.activeTab === PEMASUKAN || saved.activeTab === PENGELUARAN) state.activeTab = saved.activeTab;
    if (typeof saved.search === 'string') state.search = saved.search;
    if (saved.filter && typeof saved.filter.type === 'string') state.filter = { type: saved.filter.type, value: saved.filter.value || '' };
    if (saved.adminFilter && typeof saved.adminFilter.type === 'string') state.adminFilter = { type: saved.adminFilter.type, value: saved.adminFilter.value || '' };
    if (saved.activeBookId) state.activeBookId = saved.activeBookId;
    if (saved.view === 'admin' || saved.view === 'master') state.view = saved.view;
  }

  function clearSavedUiState() {
    const key = uiStateKey();
    if (key) sessionStorage.removeItem(key);
  }

  function parseDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDateShort(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return { d: '--', m: '--' };
    return { d: String(d.getDate()).padStart(2, '0'), m: BULAN_PENDEK[d.getMonth()] };
  }

  function formatDateLong(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return String(dateStr);
    return d.getDate() + ' ' + BULAN_PANJANG[d.getMonth()] + ' ' + d.getFullYear();
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function slugify(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'pembukuan';
  }

  function activeBook() {
    return state.books.find(b => b.id === state.activeBookId) || null;
  }

  function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // Pemetaan record database -> objek state
  function mapBook(b) {
    return { id: b.id, nama: b.nama, saldoAwal: Number(b.saldo_awal), isDefault: !!b.is_default, createdAt: b.created_at };
  }

  function mapTransaction(r) {
    return {
      id: r.id,
      type: r.type,
      date: r.date,
      keterangan: r.keterangan,
      jumlah: Number(r.jumlah),
      categoryId: r.category_id,
      paymentMethodId: r.payment_method_id,
      notaPath: r.nota_path || null,
      notaMime: r.nota_mime || null,
      notaName: r.nota_name || '',
      notaSize: Number(r.nota_size || 0)
    };
  }

  function mapCategory(c) {
    return { id: c.id, nama: c.nama, type: c.type, isActive: c.is_active };
  }

  function mapPayment(p) {
    return { id: p.id, nama: p.nama, isActive: p.is_active };
  }

  function categoryName(id) {
    const c = state.categories.find(x => x.id === id);
    return c ? c.nama : '';
  }

  function paymentName(id) {
    const p = state.paymentMethods.find(x => x.id === id);
    return p ? p.nama : '';
  }

  function labelType(t) {
    return { pemasukan: 'Pemasukan', pengeluaran: 'Pengeluaran', semua: 'Semua' }[t] || String(t || '');
  }

  // ============================================================
  // 4B. LAMPIRAN NOTA (gambar / PDF)
  // File disimpan di bucket Storage privat "nota" dengan pola path
  // {user_id}/{book_id}/{uuid}.{ext}; yang masuk tabel transaksi hanya
  // path-nya, lalu ditampilkan lewat signed URL berbatas waktu.
  // ============================================================
  const MAX_NOTA_BYTES = 5 * 1024 * 1024;       // batas unggah (sama dengan bucket)
  const MAX_NOTA_IMAGE_RAW = 20 * 1024 * 1024;  // foto kamera boleh lebih besar (dikompres)
  const NOTA_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const NOTA_PDF_TYPE = 'application/pdf';
  const NOTA_URL_TTL = 3600;                    // masa berlaku signed URL (detik)

  function formatBytes(n) {
    const num = Number(n) || 0;
    if (num < 1024) return num + ' B';
    if (num < 1024 * 1024) return Math.round(num / 1024) + ' KB';
    return (num / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // 'pdf' | 'image' | 'other' | null (null = tidak ada lampiran)
  function notaKind(item) {
    if (!item || !item.notaMime) return null;
    const mime = String(item.notaMime);
    if (mime === NOTA_PDF_TYPE) return 'pdf';
    if (mime.indexOf('image/') === 0) return 'image';
    return 'other';
  }

  function notaCachedUrl(path) {
    const hit = path ? state.notaUrls[path] : null;
    return (hit && hit.exp > Date.now()) ? hit.url : '';
  }

  // Ambil signed URL (dari cache bila masih berlaku)
  function notaUrlFor(path) {
    if (!path) return Promise.resolve('');
    const cached = notaCachedUrl(path);
    if (cached) return Promise.resolve(cached);
    return api.getNotaUrl(path, NOTA_URL_TTL).then(res => {
      if (res.error) throw res.error;
      const url = (res.data && (res.data.signedUrl || res.data.signedURL)) || '';
      if (url) state.notaUrls[path] = { url: url, exp: Date.now() + (NOTA_URL_TTL - 300) * 1000 };
      return url;
    });
  }

  // Siapkan tautan untuk banyak lampiran sekaligus (hemat permintaan).
  // Permintaan dipecah per batch agar buku dengan ratusan lampiran tidak
  // mengirim satu permintaan raksasa yang rawan timeout.
  const NOTA_URL_BATCH = 100;

  function preloadNotaUrls(paths) {
    const list = (paths || []).filter(p => p && !notaCachedUrl(p));
    if (!list.length) return;
    for (let i = 0; i < list.length; i += NOTA_URL_BATCH) {
      const batch = list.slice(i, i + NOTA_URL_BATCH);
      api.getNotaUrls(batch, NOTA_URL_TTL).then(res => {
        if (res.error || !res.data) return;
        res.data.forEach(item => {
          if (!item || item.error || !item.signedUrl || !item.path) return;
          state.notaUrls[item.path] = { url: item.signedUrl, exp: Date.now() + (NOTA_URL_TTL - 300) * 1000 };
        });
      }).catch(() => { /* tautan gagal disiapkan bukan masalah fatal */ });
    }
  }

  function releaseNotaPreview(nota) {
    if (nota && nota.previewUrl) {
      try { URL.revokeObjectURL(nota.previewUrl); } catch (e) { /* abaikan */ }
    }
  }

  // Hapus file di Storage (best-effort) + bersihkan cache tautannya
  function forgetNota(path) {
    if (!path) return;
    delete state.notaUrls[path];
    api.deleteNota(path).catch(err => console.error('Gagal menghapus lampiran:', err));
  }

  // Bersihkan seluruh lampiran milik satu pembukuan (dipakai saat buku dihapus)
  function purgeBookNota(bookId) {
    const uid = (state.session && state.session.user) ? state.session.user.id : '';
    if (!uid || !bookId) return;
    const prefix = uid + '/' + bookId;
    api.listNota(prefix).then(res => {
      if (res.error || !res.data || !res.data.length) return;
      const paths = res.data.map(o => prefix + '/' + o.name);
      paths.forEach(p => { delete state.notaUrls[p]; });
      return api.deleteNota(paths);
    }).catch(err => console.error('Gagal membersihkan lampiran pembukuan:', err));
  }

  function notaPathFor(ext) {
    const uid = (state.session && state.session.user) ? state.session.user.id : 'anon';
    const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
    return uid + '/' + state.activeBookId + '/' + rand + '.' + ext;
  }

  // Gambar dikecilkan ke maksimal 1280 px & dikonversi ke JPEG agar hasil
  // unggahan jauh di bawah batas 5 MB (foto kamera HP bisa 8-15 MB).
  function compressNotaImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const MAX_DIM = 1280;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          const ratio = Math.min(1, MAX_DIM / Math.max(w, h));
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas tidak tersedia di perangkat ini');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          canvas.toBlob(blob => {
            if (blob) resolve({ blob: blob, mime: 'image/jpeg', ext: 'jpg' });
            else reject(new Error('Gagal mengompres gambar'));
          }, 'image/jpeg', 0.75);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Format foto tidak didukung. Pilih JPG/PNG/WebP, atau lampirkan PDF.'));
      };
      img.src = url;
    });
  }

  function triggerNotaInput(inputId) {
    const el = document.getElementById(inputId);
    if (el) el.click();
  }

  // ---- Aksi lampiran pada form catat transaksi ----
  function handleNotaPick(file) {
    const m = state.modal;
    if (!m || !m.draft || !file) return;
    const draft = m.draft;
    const name = file.name || '';
    const isPdf = file.type === NOTA_PDF_TYPE || /\.pdf$/i.test(name);
    const isImage = NOTA_IMAGE_TYPES.indexOf(file.type) > -1;

    if (!isPdf && !isImage) {
      draft.notaError = 'Format tidak didukung. Pilih gambar (JPG/PNG/WebP) atau PDF.';
      render();
      return;
    }
    if (isPdf && file.size > MAX_NOTA_BYTES) {
      draft.notaError = 'Ukuran PDF maksimal 5 MB (file ini ' + formatBytes(file.size) + ').';
      render();
      return;
    }
    if (isImage && file.size > MAX_NOTA_IMAGE_RAW) {
      draft.notaError = 'Foto terlalu besar (maksimal 20 MB sebelum dikompres).';
      render();
      return;
    }

    const keepOldPath = draft.notaOriginalPath || null;
    draft.notaError = '';
    state.notaBusy = true;
    render();

    const finish = (blob, mime, ext) => {
      if (blob.size > MAX_NOTA_BYTES) {
        state.notaBusy = false;
        draft.notaError = 'Ukuran file maksimal 5 MB (hasil ' + formatBytes(blob.size) + ').';
        render();
        return;
      }
      releaseNotaPreview(draft.nota);
      draft.nota = {
        path: notaPathFor(ext),
        oldPath: keepOldPath,
        mime: mime,
        name: name || ('nota.' + ext),
        size: blob.size,
        kind: mime === NOTA_PDF_TYPE ? 'pdf' : 'image',
        blob: blob,
        previewUrl: URL.createObjectURL(blob),
        isNew: true,
        removeOld: false
      };
      state.notaBusy = false;
      render();
    };

    if (isPdf) {
      finish(file, NOTA_PDF_TYPE, 'pdf');
      return;
    }
    compressNotaImage(file).then(out => finish(out.blob, out.mime, out.ext)).catch(e => {
      state.notaBusy = false;
      draft.notaError = (e && e.message) ? e.message : 'Gagal memproses gambar.';
      render();
    });
  }

  function clearDraftNota() {
    const m = state.modal;
    if (!m || !m.draft || !m.draft.nota) return;
    const old = m.draft.nota;
    releaseNotaPreview(old);
    m.draft.notaError = '';
    m.draft.nota = {
      path: null,
      oldPath: old.oldPath || (old.isNew ? null : old.path) || null,
      mime: null,
      name: '',
      size: 0,
      kind: null,
      blob: null,
      previewUrl: null,
      isNew: false,
      removeOld: true
    };
    render();
  }

  // ---- Penampil & unduh lampiran ----
  function openNotaViewer(el) {
    const directUrl = el.getAttribute('data-url') || '';
    const path = el.getAttribute('data-path') || '';
    const kind = el.getAttribute('data-kind') === 'pdf' ? 'pdf' : 'image';
    const name = el.getAttribute('data-name') || (kind === 'pdf' ? 'Nota.pdf' : 'Lampiran');
    const show = url => {
      state.notaViewer = { url: url, path: path, kind: kind, name: name };
      render();
    };
    if (directUrl) { show(directUrl); return; }
    if (!path) { showToast('Lampiran tidak ditemukan'); return; }
    notaUrlFor(path).then(url => {
      if (!url) { showToast('Gagal membuka lampiran'); return; }
      show(url);
    }).catch(e => showToast('Gagal membuka lampiran: ' + (e.message || 'terjadi kesalahan')));
  }

  function downloadNotaFile(el) {
    const path = el.getAttribute('data-path') || '';
    const name = el.getAttribute('data-name') || 'nota';
    if (!path) { showToast('Lampiran belum tersimpan'); return; }
    showToast('Menyiapkan unduhan…');
    api.downloadNota(path).then(res => {
      if (res.error) throw res.error;
      downloadBlob(res.data, name || 'nota');
    }).catch(e => {
      showToast('Gagal mengunduh lampiran: ' + (e.message || 'terjadi kesalahan'));
    });
  }

  // Patch objek transaksi di state setelah operasi update, dibangun dari payload
  // yang sama dengan yang dikirim ke database → tidak ada kolom baru yang terlupa.
  function txPatchFromPayload(payload) {
    const patch = {
      type: payload.type,
      date: payload.date,
      keterangan: payload.keterangan,
      jumlah: payload.jumlah,
      categoryId: payload.category_id,
      paymentMethodId: payload.payment_method_id
    };
    if (Object.prototype.hasOwnProperty.call(payload, 'nota_path')) {
      patch.notaPath = payload.nota_path;
      patch.notaMime = payload.nota_mime;
      patch.notaName = payload.nota_name || '';
      patch.notaSize = Number(payload.nota_size || 0);
    }
    return patch;
  }

  // Susunan field lampiran pada form catat/ubah transaksi
  function renderNotaField(m) {
    const draft = m.draft;
    const nota = draft.nota;
    const errHtml = '<div class="field-error' + (draft.notaError ? ' show' : '') + '" data-err="nota">'
      + escapeHtml(draft.notaError || '') + '</div>';
    let body;

    if (state.notaBusy) {
      body = '<div class="nota-drop busy">' + ICONS.image + '<span>Memproses lampiran…</span></div>';
    } else if (nota && nota.path) {
      const isPdf = nota.kind === 'pdf';
      const thumbUrl = isPdf ? '' : (nota.previewUrl || notaCachedUrl(nota.path));
      const media = thumbUrl
        ? '<img class="nota-preview-img" src="' + escapeHtml(thumbUrl) + '" alt="Lampiran nota">'
        : '<div class="nota-file-icon">' + (isPdf ? ICONS.file : ICONS.image) + '<span>' + (isPdf ? 'PDF' : 'Gambar') + '</span></div>';
      const viewBtn = (nota.previewUrl || nota.path)
        ? '<button type="button" class="btn-mini" data-action="nota-view" data-url="' + escapeHtml(nota.previewUrl || '')
          + '" data-path="' + (nota.isNew ? '' : escapeHtml(nota.path)) + '" data-kind="' + (isPdf ? 'pdf' : 'image')
          + '" data-name="' + escapeHtml(nota.name || '') + '">Lihat</button>'
        : '';
      body = '<div class="nota-preview">' + media
        + '<div class="nota-preview-info"><b>' + escapeHtml(nota.name || (isPdf ? 'Nota.pdf' : 'Lampiran')) + '</b>'
        + '<span>' + formatBytes(nota.size) + (nota.isNew ? ' · belum disimpan' : '') + '</span></div>'
        + '<div class="nota-preview-actions">' + viewBtn
        + '<button type="button" class="btn-mini" data-action="nota-pick-file">Ganti</button>'
        + '<button type="button" class="btn-mini danger" data-action="nota-remove">Hapus</button>'
        + '</div></div>';
    } else {
      // Tanpa atribut capture pada input berkas: di HP Android/iOS pemilih bawaan
      // tetap menawarkan kamera maupun berkas; tombol kamera memakai input terpisah.
      body = '<div class="nota-pick-row">'
        + '<button type="button" class="nota-drop" data-action="nota-pick-image">' + ICONS.camera + '<span>Ambil Foto</span></button>'
        + '<button type="button" class="nota-drop" data-action="nota-pick-file">' + ICONS.file + '<span>Pilih PDF / Gambar</span></button>'
        + '</div>';
    }

    return '<div class="field"><label>Lampiran Nota (opsional)</label>'
      + body
      + '<input type="file" id="nota-camera" class="nota-input" accept="image/*" capture="environment" hidden>'
      + '<input type="file" id="nota-file" class="nota-input" accept="image/*,application/pdf" hidden>'
      + '<p class="nota-hint">Gambar otomatis dikompres &middot; PDF maksimal 5 MB</p>'
      + errHtml
      + '</div>';
  }

  // ============================================================
  // 5. HELPER FILTER PERIODE
  // ============================================================
  function pad2(n) { return String(n).padStart(2, '0'); }

  function dateToStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isoWeekRange(weekValue) {
    // Format input week: "YYYY-Www"
    const parts = String(weekValue).split('-W');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    if (!year || !week) return null;
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const monday = new Date(simple);
    if (dow <= 4) monday.setDate(simple.getDate() - dow + 1);
    else monday.setDate(simple.getDate() + 8 - dow);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: dateToStr(monday), end: dateToStr(sunday) };
  }

  function isoWeekOfDate(d) {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7; // Senin=0 .. Minggu=6
    target.setDate(target.getDate() - dayNr + 3); // geser ke Kamis minggu ini
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const dayDiff = (target - firstThursday) / 86400000;
    const week = 1 + Math.round(dayDiff / 7);
    return target.getFullYear() + '-W' + pad2(week);
  }


  function defaultFilterValue(type) {
    const d = new Date();
    if (type === 'day') return todayStr();
    if (type === 'week') return isoWeekOfDate(d);
    if (type === 'month') return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    if (type === 'year') return String(d.getFullYear());
    return '';
  }

  function periodRange(type, value) {
    if (!value || type === 'all') return null;
    if (type === 'day') return { start: value, end: value };
    if (type === 'week') return isoWeekRange(value);
    if (type === 'month') {
      const parts = String(value).split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      if (!year || !month) return null;
      const lastDay = new Date(year, month, 0).getDate();
      return { start: year + '-' + pad2(month) + '-01', end: year + '-' + pad2(month) + '-' + pad2(lastDay) };
    }
    if (type === 'year') return { start: value + '-01-01', end: value + '-12-31' };
    return null;
  }

  function periodLabel(type, value) {
    if (type === 'all' || !value) return 'Semua Waktu';
    if (type === 'day') return formatDateLong(value);
    if (type === 'week') {
      const r = isoWeekRange(value);
      return r ? (formatDateLong(r.start) + ' – ' + formatDateLong(r.end)) : String(value);
    }
    if (type === 'month') {
      const parts = String(value).split('-');
      return BULAN_PANJANG[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
    }
    if (type === 'year') return 'Tahun ' + value;
    return '';
  }

  function filterByPeriod(list, filterState) {
    const range = periodRange(filterState.type, filterState.value);
    if (!range) return list;
    return list.filter(t => t.date >= range.start && t.date <= range.end);
  }

  // ============================================================
  // 6. LAPISAN DATA SUPABASE
  // ============================================================

  // ---------- Paginasi ----------
  // Data API Supabase memotong respons pada setelan "Max Rows" project
  // (default 1000). Semua pembacaan daftar yang panjang (transaksi &
  // pembukuan) disusuri per halaman supaya saldo, grafik, laporan, dan
  // agregat admin tidak pernah dihitung dari data yang terpotong diam-diam.
  // Urutan wajib deterministik (dipakai tie-breaker created_at / id), sebab
  // baris dengan nilai urutan yang sama bisa terduplikasi atau terlewat
  // saat berpindah halaman.
  const PAGE_SIZE = 1000;

  function fetchAllRows(buildQuery) {
    const rows = [];
    const next = from => buildQuery()
      .range(from, from + PAGE_SIZE - 1)
      .then(res => {
        if (res.error) throw res.error;
        const page = res.data || [];
        for (let i = 0; i < page.length; i += 1) rows.push(page[i]);
        if (page.length < PAGE_SIZE) return rows;
        return next(from + PAGE_SIZE);
      });
    return next(0);
  }

  const api = {
    // Semua pembukuan milik pengguna (menyusuri seluruh halaman)
    getAllBooks() {
      return fetchAllRows(() => sb.from('books').select('*')
        .eq('user_id', state.session.user.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }));
    },

    getProfile() {
      return sb.from('profiles').select('role').eq('id', state.session.user.id).maybeSingle();
    },

    getCategories() {
      return sb.from('categories').select('*').order('type', { ascending: true }).order('nama', { ascending: true });
    },

    getPaymentMethods() {
      return sb.from('payment_methods').select('*').order('nama', { ascending: true });
    },

    // Semua transaksi satu pembukuan (menyusuri seluruh halaman)
    getAllTransactions(bookId) {
      return fetchAllRows(() => sb.from('transactions').select('*')
        .eq('book_id', bookId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }));
    },

    createBook(nama, saldoAwal) {
      return sb.from('books')
        .insert([{ user_id: state.session.user.id, nama: nama, saldo_awal: saldoAwal }])
        .select().single();
    },

    updateBook(id, nama, saldoAwal) {
      // updated_at diisi trigger di server (books_touch_updated_at),
      // bukan dari jam perangkat pengguna
      return sb.from('books')
        .update({ nama: nama, saldo_awal: saldoAwal })
        .eq('id', id);
    },

    deleteBook(id) {
      return sb.from('books').delete().eq('id', id);
    },

    // Id seluruh pembukuan dalam satu pohon (buku ini + sub-pembukuannya).
    // Dipakai sebelum menghapus buku supaya lampiran sub-pembukuan ikut
    // dibersihkan walau barisnya nanti ter-hapus lewat cascade.
    bookSubtreeIds(id) {
      return sb.rpc('book_subtree_ids', { p_book_id: id });
    },

    setDefaultBook(id) {
      return sb.rpc('set_default_book', { p_book_id: id });
    },

    createTransaction(payload) {
      return sb.from('transactions')
        .insert([Object.assign({ user_id: state.session.user.id, book_id: state.activeBookId }, payload)])
        .select().single();
    },

    updateTransaction(id, payload) {
      return sb.from('transactions').update(payload).eq('id', id);
    },

    deleteTransaction(id) {
      return sb.from('transactions').delete().eq('id', id);
    },

    // ---------- Lampiran nota (Supabase Storage, bucket privat "nota") ----------
    // File disimpan dengan path {user_id}/{book_id}/{uuid}.{ext}; yang disimpan
    // di tabel transaksi hanya path-nya, tautan akses dibuat ulang sebagai signed URL.
  uploadNota(path, blob, mime) {
    return sb.storage.from('nota').upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: mime || 'application/octet-stream'
    });
  },

  getNotaUrl(path, expiresIn) {
    return sb.storage.from('nota').createSignedUrl(path, expiresIn || 3600);
  },

  getNotaUrls(paths, expiresIn) {
    return sb.storage.from('nota').createSignedUrls(paths, expiresIn || 3600);
  },

  downloadNota(path) {
    return sb.storage.from('nota').download(path);
  },

  deleteNota(paths) {
    return sb.storage.from('nota').remove([].concat(paths || []).filter(Boolean));
  },

  listNota(prefix) {
    return sb.storage.from('nota').list(prefix, { limit: 1000 });
  },

  createCategory(nama, type, isActive) {
      return sb.from('categories').insert([{ nama: nama, type: type, is_active: isActive }]).select().single();
    },

    updateCategory(id, { nama, type, isActive }) {
      return sb.from('categories').update({ nama: nama, type: type, is_active: isActive }).eq('id', id);
    },

    deleteCategory(id) {
      return sb.from('categories').delete().eq('id', id);
    },

    createPaymentMethod(nama, isActive) {
      return sb.from('payment_methods').insert([{ nama: nama, is_active: isActive }]).select().single();
    },

    updatePaymentMethod(id, { nama, isActive }) {
      return sb.from('payment_methods').update({ nama: nama, is_active: isActive }).eq('id', id);
    },

    deletePaymentMethod(id) {
      return sb.from('payment_methods').delete().eq('id', id);
    },

    // ---------- Data agregat admin (seluruh pengguna) ----------
    getAdminProfiles() {
      return fetchAllRows(() => sb.from('profiles').select('id, email, role, created_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }));
    },

    getAdminBooks() {
      return fetchAllRows(() => sb.from('books').select('id, user_id, nama, saldo_awal, created_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }));
    },

    getAdminTransactions() {
      return fetchAllRows(() => sb.from('transactions')
        .select('id, user_id, book_id, type, date, jumlah, keterangan, category_id, payment_method_id, nota_path, nota_mime, nota_name, nota_size')
        .order('date', { ascending: true })
        .order('id', { ascending: true }));
    }
  };


  // ============================================================
  // 7. AKSI CRUD & MUAT DATA
  // ============================================================

  function loadUserData() {
    state.dataReady = false;
    render();
    Promise.all([
      api.getAllBooks(),
      api.getProfile(),
      api.getCategories(),
      api.getPaymentMethods()
    ]).then(([books, profileRes, catRes, payRes]) => {
      if (catRes.error) throw catRes.error;
      if (payRes.error) throw payRes.error;

      state.books = (books || []).map(mapBook);
      state.categories = (catRes.data || []).map(mapCategory);
      state.paymentMethods = (payRes.data || []).map(mapPayment);
      state.isAdmin = !!(profileRes && !profileRes.error && profileRes.data && profileRes.data.role === 'admin');

      // Pulihkan posisi terakhir user (buku/tab/filter) bila ada sesi tersimpan
      restoreSavedUiState();
      if (!state.isAdmin && (state.view === 'admin' || state.view === 'master')) state.view = 'buku';

      if (state.books.length) {
        if (!state.books.some(b => b.id === state.activeBookId)) {
          // Buka buku default; bila belum ada penanda default, pakai buku pertama
          const def = state.books.find(b => b.isDefault) || state.books[0];
          state.activeBookId = def.id;
        }
      } else {
        state.activeBookId = null;
      }
    }).catch(e => {
      console.error(e);
      showToast('Gagal memuat data: ' + (e.message || 'terjadi kesalahan'));
    }).finally(() => {
      state.dataReady = true;
      // Jika user admin dan terakhir berada di dashboard admin / master data,
      // tampilkan area itu kembali (data agregat admin dimuat ulang bila perlu).
      if (state.isAdmin && state.view === 'admin') {
        loadAdminData();
        return;
      }
      if (state.isAdmin && state.view === 'master') {
        render();
        return;
      }
      if (state.activeBookId) {
        loadBookTransactions(state.activeBookId);
      } else {
        state.transactions = [];
        state.txReady = true;
        render();
      }
    });
  }

  function loadBookTransactions(bookId) {
    state.txReady = false;
    state.transactions = [];
    render();
    api.getAllTransactions(bookId).then(rows => {
      if (state.activeBookId !== bookId) return; // pengguna pindah buku sebelum selesai
      state.transactions = (rows || []).map(mapTransaction);
      // Siapkan tautan lampiran sekali jalan agar thumbnail di daftar/detail
      // tidak memicu satu permintaan per transaksi.
      preloadNotaUrls(state.transactions.map(t => t.notaPath));
    }).catch(e => {
      console.error(e);
      showToast('Gagal memuat transaksi: ' + (e.message || 'terjadi kesalahan'));
    }).finally(() => {
      if (state.activeBookId === bookId) {
        state.txReady = true;
        render();
      }
    });
  }

  function switchActiveBook(bookId) {
    if (state.activeBookId === bookId) return;
    state.activeBookId = bookId;
    state.activeTab = PEMASUKAN;
    state.search = '';
    state.filter = { type: 'all', value: '' };
    loadBookTransactions(bookId);
  }

  function switchTab(tab) {
    state.activeTab = tab;
    // Kata kunci tidak dibawa antar tab: pencarian di Pemasukan bisa membuat
    // daftar Pengeluaran tampak kosong tanpa alasan yang jelas bagi pengguna.
    state.search = '';
    render();
  }

  // ---------- Pembukuan (books) ----------
  function openBookPicker() { state.modal = { mode: 'book-picker' }; render(); }

  function openBookForm(editId) {
    const book = editId ? state.books.find(b => b.id === editId) : null;
    state.modal = {
      mode: 'book-form',
      editId: editId || null,
      draft: book ? { nama: book.nama, saldoAwal: book.saldoAwal } : { nama: '', saldoAwal: '' }
    };
    render();
  }

  function submitBookForm(nama, saldoAwal, editId) {
    const errors = {};
    if (!nama || !nama.trim()) errors.nama = 'Nama pembukuan wajib diisi';
    const num = parseAmountInput(saldoAwal);
    if (num === null || num < 0) errors.saldoAwal = 'Masukkan angka yang valid';
    if (Object.keys(errors).length) return Promise.resolve(errors);

    if (editId) {
      return api.updateBook(editId, nama.trim(), num).then(res => {
        if (res.error) throw res.error;
        const idx = state.books.findIndex(b => b.id === editId);
        if (idx > -1) state.books[idx] = Object.assign({}, state.books[idx], { nama: nama.trim(), saldoAwal: num });
        state.modal = null;
        render();
        showToast('Pembukuan diperbarui');
        return null;
      }).catch(e => {
        showToast('Gagal menyimpan: ' + (e.message || 'terjadi kesalahan'));
        return {};
      });
    }

    return api.createBook(nama.trim(), num).then(res => {
      if (res.error) throw res.error;
      const b = mapBook(res.data);
      state.books.push(b);
      state.modal = null;
      switchActiveBook(b.id);
      // Pembukuan pertama otomatis menjadi buku default
      if (state.books.length === 1) {
        b.isDefault = true;
        api.setDefaultBook(b.id).catch(err => console.error('Gagal set default buku:', err));
      }
      showToast('Pembukuan dibuat');
      return null;
    }).catch(e => {
      showToast('Gagal membuat pembukuan: ' + (e.message || 'terjadi kesalahan'));
      return {};
    });
  }

  // Daftar id pembukuan dalam satu pohon (buku ini + seluruh sub-pembukuannya).
  // Bila pembacaan gagal, cukup pakai id buku itu sendiri supaya penghapusan
  // tetap bisa dilanjutkan.
  function bookSubtreeIdsOrSelf(id) {
    return api.bookSubtreeIds(id).then(res => {
      if (res.error) throw res.error;
      const ids = res.data || [];
      return ids.indexOf(id) > -1 ? ids : [id].concat(ids);
    }).catch(err => {
      console.error('Gagal membaca pohon pembukuan:', err);
      return [id];
    });
  }

  function deleteBook(id) {
    const deleted = state.books.find(b => b.id === id);
    // Pohon dibaca SEBELUM baris induk dihapus: setelah itu sub-pembukuan ikut
    // ter-hapus lewat cascade sehingga id-nya tak bisa ditemukan lagi.
    bookSubtreeIdsOrSelf(id).then(bookIds => api.deleteBook(id).then(res => {
      if (res.error) throw res.error;
      // Lampiran nota milik buku ini & sub-pembukuannya ikut dibersihkan
      // (best-effort, tidak menahan UI)
      bookIds.forEach(purgeBookNota);
      state.books = state.books.filter(b => b.id !== id);
      // Kalau buku default dihapus, pindahkan status default ke buku tersisa pertama
      if (deleted && deleted.isDefault && state.books.length) {
        state.books[0].isDefault = true;
        api.setDefaultBook(state.books[0].id).catch(err => console.error('Gagal pindahkan default:', err));
      }
      if (state.activeBookId === id) {
        if (state.books.length) {
          state.activeBookId = state.books[0].id;
          loadBookTransactions(state.activeBookId);
        } else {
          state.activeBookId = null;
          state.transactions = [];
          state.txReady = true;
          render();
        }
      } else {
        render();
      }
      showToast('Pembukuan dihapus');
    })).catch(e => {
      showToast('Gagal menghapus: ' + (e.message || 'terjadi kesalahan'));
    });
  }

  function setBookDefault(id) {
    if (!state.books.some(b => b.id === id)) return;
    api.setDefaultBook(id).then(res => {
      if (res.error) throw res.error;
      state.books.forEach(b => { b.isDefault = (b.id === id); });
      render();
      showToast('Pembukuan default diubah');
    }).catch(e => {
      showToast('Gagal mengubah default: ' + (e.message || 'terjadi kesalahan'));
    });
  }


  // ---------- Transaksi ----------
  function openEntryModal(type, editId) {
    const edit = editId ? state.transactions.find(t => t.id === editId) : null;
    const draft = edit
      ? Object.assign({}, edit)
      : { date: todayStr(), keterangan: '', jumlah: '', categoryId: '', paymentMethodId: '' };
    draft.notaError = '';
    draft.notaOriginalPath = edit ? (edit.notaPath || null) : null;
    draft.nota = (edit && edit.notaPath)
      ? {
          path: edit.notaPath,
          oldPath: edit.notaPath,
          mime: edit.notaMime || '',
          name: edit.notaName || '',
          size: Number(edit.notaSize || 0),
          kind: notaKind(edit),
          blob: null,
          previewUrl: null,
          isNew: false,
          removeOld: false
        }
      : null;
    state.modal = { mode: 'entry', type: type, editId: editId || null, draft: draft };
    render();
    // Siapkan thumbnail lampiran lama bila tautannya belum ada di cache
    if (draft.nota && draft.nota.kind === 'image' && !notaCachedUrl(draft.nota.path)) {
      notaUrlFor(draft.nota.path).then(url => {
        const m = state.modal;
        if (url && m && m.mode === 'entry' && m.editId === (editId || null)) render();
      }).catch(() => { /* tetap tampil sebagai kartu tanpa pratinjau */ });
    }
  }

  function closeModal() {
    if (state.modal && state.modal.draft) releaseNotaPreview(state.modal.draft.nota);
    state.notaViewer = null;
    state.modal = null;
    render();
  }

  // Unggah lampiran baru (bila ada) sebelum transaksi disimpan
  function uploadNotaIfNeeded(nota) {
    if (!nota || !nota.blob) return Promise.resolve(null);
    return api.uploadNota(nota.path, nota.blob, nota.mime).then(res => {
      if (res.error) throw res.error;
      return { path: nota.path, mime: nota.mime, name: nota.name || 'nota', size: Number(nota.size || 0) };
    });
  }

  function submitEntry({ type, date, keterangan, jumlah, categoryId, paymentMethodId, editId }) {
    const errors = {};
    if (!date) errors.date = 'Tanggal wajib diisi';
    if (!keterangan || !keterangan.trim()) errors.keterangan = 'Keterangan wajib diisi';
    const num = parseAmountInput(jumlah);
    if (num === null || num <= 0) errors.jumlah = 'Jumlah harus lebih dari 0';

    const draft = (state.modal && state.modal.draft) || {};
    const nota = draft.nota || null;
    const hasNewNota = !!(nota && nota.blob);
    if (draft.notaError) errors.nota = draft.notaError;
    else if (hasNewNota && nota.size > MAX_NOTA_BYTES) errors.nota = 'Ukuran file maksimal 5 MB';
    if (Object.keys(errors).length) return Promise.resolve(errors);

    const payload = {
      type: type,
      date: date,
      keterangan: keterangan.trim(),
      jumlah: num,
      category_id: categoryId || null,
      payment_method_id: paymentMethodId || null
    };

    state.notaBusy = hasNewNota;
    if (hasNewNota) render();

    let uploaded = null;
    return uploadNotaIfNeeded(nota).then(up => {
      uploaded = up;
      if (uploaded) {
        payload.nota_path = uploaded.path;
        payload.nota_mime = uploaded.mime;
        payload.nota_name = uploaded.name;
        payload.nota_size = uploaded.size;
      } else if (editId && draft.notaOriginalPath && (!nota || nota.removeOld)) {
        // Lampiran lama ditandai terhapus (tanpa pengganti)
        payload.nota_path = null;
        payload.nota_mime = null;
        payload.nota_name = null;
        payload.nota_size = null;
      }

      const op = editId
        ? api.updateTransaction(editId, payload)
        : api.createTransaction(payload);

      let saved = false;
      return op.then(res => {
        if (res.error) throw res.error;
        saved = true;

        if (editId) {
          const idx = state.transactions.findIndex(t => t.id === editId);
          if (idx > -1) {
            state.transactions[idx] = Object.assign({}, state.transactions[idx], txPatchFromPayload(payload));
          }
        } else {
          state.transactions.push(mapTransaction(res.data));
        }

        // File lama dibuang bila diganti atau dihapus dari form
        const oldPath = draft.notaOriginalPath;
        if (oldPath && oldPath !== payload.nota_path) forgetNota(oldPath);

        if (uploaded && uploaded.path) {
          // Siapkan tautan agar detail catatan langsung menampilkan lampiran
          notaUrlFor(uploaded.path).catch(() => { /* diambil lagi saat dibuka */ });
        }

        releaseNotaPreview(nota);
        state.notaBusy = false;
        state.modal = null;
        render();
        showToast(editId ? 'Perubahan disimpan' : (type === PEMASUKAN ? 'Pemasukan dicatat' : 'Pengeluaran dicatat'));
        return null;
      }).catch(e => {
        // Simpan gagal → file yang terlanjur diunggah dihapus agar tidak menumpuk
        if (!saved && uploaded && uploaded.path) forgetNota(uploaded.path);
        state.notaBusy = false;
        if (state.modal) render();
        showToast('Gagal menyimpan: ' + (e.message || 'terjadi kesalahan'));
        return {};
      });
    }).catch(e => {
      state.notaBusy = false;
      if (state.modal && state.modal.draft) {
        state.modal.draft.notaError = 'Gagal mengunggah lampiran: ' + (e.message || 'terjadi kesalahan');
      }
      render();
      showToast('Gagal mengunggah lampiran: ' + (e.message || 'terjadi kesalahan'));
      return {};
    });
  }

  function deleteEntry(id) {
    const tx = state.transactions.find(t => t.id === id);
    api.deleteTransaction(id).then(res => {
      if (res.error) throw res.error;
      state.transactions = state.transactions.filter(t => t.id !== id);
      state.modal = null;
      render();
      showToast('Data dihapus');
      // Lampiran ikut dibersihkan dari Storage (best-effort, tidak menahan UI)
      if (tx && tx.notaPath) forgetNota(tx.notaPath);
    }).catch(e => {
      showToast('Gagal menghapus: ' + (e.message || 'terjadi kesalahan'));
    });
  }

  // ---------- Detail transaksi (klik baris untuk melihat lengkap) ----------
  function openTxDetail(id) {
    if (!state.transactions.some(t => t.id === id)) return;
    state.modal = { mode: 'entry-detail', id: id };
    render();
    // Siapkan tautan lampiran agar thumbnail langsung tampil
    const tx = state.transactions.find(t => t.id === id);
    if (tx && tx.notaPath && !notaCachedUrl(tx.notaPath)) {
      notaUrlFor(tx.notaPath).then(url => {
        const m = state.modal;
        if (url && m && m.mode === 'entry-detail' && m.id === id) render();
      }).catch(() => { /* tombol Lihat akan memicu ulang */ });
    }
  }

  // Baris "Lampiran" pada modal detail: pratinjau/gambar + tombol Lihat & Unduh
  function renderTxNota(tx) {
    const kind = notaKind(tx);
    if (!kind || !tx.notaPath) return '—';
    const isPdf = kind === 'pdf';
    const name = tx.notaName || (isPdf ? 'Nota.pdf' : 'Lampiran');
    const url = isPdf ? '' : notaCachedUrl(tx.notaPath);
    const label = isPdf ? 'PDF' : (kind === 'image' ? 'Gambar' : 'Berkas');
    const media = (isPdf || !url)
      ? '<span class="nota-badge' + (isPdf ? ' pdf' : '') + '">' + label + '</span>'
      : '<img class="nota-thumb" src="' + escapeHtml(url) + '" alt="Lampiran nota">';
    return '<div class="nota-detail">' + media
      + '<div class="nota-detail-meta"><b>' + escapeHtml(name) + '</b>'
      + '<span>' + (tx.notaSize ? formatBytes(tx.notaSize) : '') + '</span></div>'
      + '<div class="nota-detail-actions">'
      + '<button type="button" class="btn-mini" data-action="nota-view" data-path="' + escapeHtml(tx.notaPath)
        + '" data-kind="' + (isPdf ? 'pdf' : 'image') + '" data-name="' + escapeHtml(name) + '">Lihat</button>'
      + '<button type="button" class="btn-mini" data-action="nota-download" data-path="' + escapeHtml(tx.notaPath)
        + '" data-name="' + escapeHtml(name) + '">Unduh</button>'
      + '</div></div>';
  }

  function renderTxDetailModal() {
    const m = state.modal;
    const tx = state.transactions.find(t => t.id === m.id);
    if (!tx) return '';
    const isIn = tx.type === PEMASUKAN;
    const tipeLabel = isIn ? 'Pemasukan' : 'Pengeluaran';
    const rows = [
      ['Keterangan', escapeHtml(tx.keterangan)],
      ['Kategori', escapeHtml(categoryName(tx.categoryId) || '—')],
      ['Metode Pembayaran', escapeHtml(paymentName(tx.paymentMethodId) || '—')],
      ['Lampiran', renderTxNota(tx)]
    ].map(r => '<div class="dg-row"><div class="dg-label">' + r[0] + '</div><div class="dg-value">' + r[1] + '</div></div>').join('');

    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop role="dialog" aria-modal="true" aria-label="Detail Catatan">'
      + '<div class="modal-head"><h2>Detail Catatan</h2><button class="modal-close" data-action="close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<div class="detail-hero ' + (isIn ? 'masuk' : 'keluar') + '">'
      + '<span class="detail-tipe ' + (isIn ? 'masuk' : 'keluar') + '">' + tipeLabel + '</span>'
      + '<div class="detail-amount ' + (isIn ? 'masuk' : 'keluar') + '">' + (isIn ? '+' : '-') + formatRupiah(tx.jumlah) + '</div>'
      + '<div class="detail-date">' + formatDateLong(tx.date) + '</div>'
      + '</div>'
      + '<div class="detail-grid">' + rows + '</div>'
      + '<div class="modal-actions">'
      + '<button type="button" class="btn-secondary" data-action="close">Tutup</button>'
      + '<button type="button" class="btn-primary" data-action="edit" data-type="' + tx.type + '" data-id="' + tx.id + '">' + ICONS.edit + ' Ubah</button>'
      + '<button type="button" class="btn-primary danger" data-action="delete" data-id="' + tx.id + '">' + ICONS.trash + ' Hapus</button>'
      + '</div>'
      + '</div></div>';
  }

  // ---------- Master data: kategori ----------
  function openCategoryForm(editId) {
    const cat = editId ? state.categories.find(c => c.id === editId) : null;
    state.modal = {
      mode: 'category-form',
      editId: editId || null,
      draft: cat ? { nama: cat.nama, type: cat.type, isActive: cat.isActive } : { nama: '', type: PEMASUKAN, isActive: true }
    };
    render();
  }

  function submitCategoryForm({ nama, type, isActive, editId }) {
    const errors = {};
    if (!nama || !nama.trim()) errors.nama = 'Nama kategori wajib diisi';
    if (!type) errors.type = 'Pilih tipe kategori';
    if (Object.keys(errors).length) return Promise.resolve(errors);

    const op = editId
      ? api.updateCategory(editId, { nama: nama.trim(), type: type, isActive: isActive })
      : api.createCategory(nama.trim(), type, isActive);

    return op.then(res => {
      if (res.error) throw res.error;
      if (editId) {
        const idx = state.categories.findIndex(c => c.id === editId);
        if (idx > -1) state.categories[idx] = { id: editId, nama: nama.trim(), type: type, isActive: isActive };
      } else {
        state.categories.push({ id: res.data.id, nama: nama.trim(), type: type, isActive: isActive });
      }
      state.modal = null;
      render();
      showToast(editId ? 'Kategori diperbarui' : 'Kategori ditambahkan');
      return null;
    }).catch(e => {
      showToast('Gagal menyimpan kategori: ' + (e.message || 'terjadi kesalahan'));
      return {};
    });
  }

  function deleteCategory(id) {
    api.deleteCategory(id).then(res => {
      if (res.error) throw res.error;
      state.categories = state.categories.filter(c => c.id !== id);
      render();
      showToast('Kategori dihapus');
    }).catch(e => {
      showToast('Gagal menghapus kategori: ' + (e.message || 'terjadi kesalahan'));
    });
  }

  // ---------- Master data: metode pembayaran ----------
  function openPaymentForm(editId) {
    const pay = editId ? state.paymentMethods.find(p => p.id === editId) : null;
    state.modal = {
      mode: 'payment-form',
      editId: editId || null,
      draft: pay ? { nama: pay.nama, isActive: pay.isActive } : { nama: '', isActive: true }
    };
    render();
  }

  function submitPaymentForm({ nama, isActive, editId }) {
    const errors = {};
    if (!nama || !nama.trim()) errors.nama = 'Nama metode wajib diisi';
    if (Object.keys(errors).length) return Promise.resolve(errors);

    const op = editId
      ? api.updatePaymentMethod(editId, { nama: nama.trim(), isActive: isActive })
      : api.createPaymentMethod(nama.trim(), isActive);

    return op.then(res => {
      if (res.error) throw res.error;
      if (editId) {
        const idx = state.paymentMethods.findIndex(p => p.id === editId);
        if (idx > -1) state.paymentMethods[idx] = { id: editId, nama: nama.trim(), isActive: isActive };
      } else {
        state.paymentMethods.push({ id: res.data.id, nama: nama.trim(), isActive: isActive });
      }
      state.modal = null;
      render();
      showToast(editId ? 'Metode diperbarui' : 'Metode ditambahkan');
      return null;
    }).catch(e => {
      showToast('Gagal menyimpan metode: ' + (e.message || 'terjadi kesalahan'));
      return {};
    });
  }

  function deletePaymentMethod(id) {
    api.deletePaymentMethod(id).then(res => {
      if (res.error) throw res.error;
      state.paymentMethods = state.paymentMethods.filter(p => p.id !== id);
      render();
      showToast('Metode pembayaran dihapus');
    }).catch(e => {
      showToast('Gagal menghapus metode: ' + (e.message || 'terjadi kesalahan'));
    });
  }


  // ---------- Data agregat admin ----------
  function loadAdminData() {
    state.adminDataReady = false;
    render();
    Promise.all([
      api.getAdminProfiles(),
      api.getAdminBooks(),
      api.getAdminTransactions()
    ]).then(([profiles, books, transactions]) => {
      state.adminTransactions = (transactions || []).map(r => ({
        id: r.id, user_id: r.user_id, book_id: r.book_id,
        type: r.type, date: r.date, keterangan: r.keterangan,
        categoryId: r.category_id, paymentMethodId: r.payment_method_id,
        jumlah: Number(r.jumlah),
        notaPath: r.nota_path || null, notaMime: r.nota_mime || null,
        notaName: r.nota_name || '', notaSize: Number(r.nota_size || 0)
      }));

      const txByBook = {};
      state.adminTransactions.forEach(r => {
        if (!txByBook[r.book_id]) txByBook[r.book_id] = [];
        txByBook[r.book_id].push(r);
      });

      state.adminBooks = (books || []).map(b => {
        const rows = txByBook[b.id] || [];
        let pemasukan = 0, pengeluaran = 0, lastDate = null;
        rows.forEach(r => {
          if (r.type === PEMASUKAN) pemasukan += r.jumlah;
          else pengeluaran += r.jumlah;
          if (!lastDate || r.date > lastDate) lastDate = r.date;
        });
        return {
          id: b.id, userId: b.user_id, nama: b.nama,
          saldoAwal: Number(b.saldo_awal),
          pemasukan: pemasukan,
          pengeluaran: pengeluaran,
          saldoAkhir: Number(b.saldo_awal) + pemasukan - pengeluaran,
          jumlahTransaksi: rows.length,
          lastDate: lastDate,
          createdAt: b.created_at
        };
      });

      state.adminUsers = (profiles || []).map(p => {
        const userBooks = state.adminBooks.filter(b => b.userId === p.id);
        let totalPemasukan = 0, totalPengeluaran = 0, totalTx = 0, totalSaldoAkhir = 0, lastDate = null;
        userBooks.forEach(b => {
          totalPemasukan += b.pemasukan;
          totalPengeluaran += b.pengeluaran;
          totalTx += b.jumlahTransaksi;
          totalSaldoAkhir += b.saldoAkhir;
          if (b.lastDate && (!lastDate || b.lastDate > lastDate)) lastDate = b.lastDate;
        });
        return {
          id: p.id, email: p.email, role: p.role, joined: p.created_at,
          jumlahBuku: books.length, jumlahTransaksi: totalTx,
          pemasukan: totalPemasukan, pengeluaran: totalPengeluaran,
          saldoAkhir: totalSaldoAkhir, lastDate: lastDate
        };
      }).sort((a, b) => {
        if (a.lastDate && b.lastDate) return b.lastDate.localeCompare(a.lastDate);
        if (a.lastDate) return -1;
        if (b.lastDate) return 1;
        return 0;
      });
    }).catch(e => {
      console.error(e);
      showToast('Gagal memuat data pengguna: ' + (e.message || 'terjadi kesalahan'));
    }).finally(() => {
      state.adminDataReady = true;
      render();
    });
  }

  function switchView(view) {
    state.view = view;
    state.adminDrillUserId = null;
    state.adminUserSearch = '';
    state.adminTxSearch = '';
    if (view === 'admin' && !state.adminDataReady) {
      loadAdminData();
    } else {
      render();
    }
  }

  function openBookDetail(bookId) {
    const b = state.adminBooks.find(x => x.id === bookId);
    if (!b) return;
    const owner = state.adminUsers.find(u => u.id === b.userId);
    state.modal = { mode: 'book-detail', book: b, ownerEmail: owner ? owner.email : '', rows: [], loading: true };
    state.adminTxSearch = '';
    render();
    api.getAllTransactions(bookId).then(rows => {
      if (state.modal && state.modal.mode === 'book-detail' && state.modal.book.id === bookId) {
        state.modal.rows = (rows || []).map(mapTransaction);
        state.modal.loading = false;
        render();
      }
    }).catch(e => {
      showToast('Gagal memuat detail: ' + (e.message || 'terjadi kesalahan'));
      state.modal = null;
      render();
    });
  }


  // ============================================================
  // 8. GRAFIK TREN (Chart.js)
  // ============================================================
  function destroyChart() {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
  }

  function monthKey(dateStr) {
    return String(dateStr).slice(0, 7);
  }

  function buildMonthlySeries(rows) {
    const totals = {};
    rows.forEach(r => {
      const key = monthKey(r.date);
      if (!totals[key]) totals[key] = { pemasukan: 0, pengeluaran: 0 };
      if (r.type === PEMASUKAN) totals[key].pemasukan += Number(r.jumlah);
      else totals[key].pengeluaran += Number(r.jumlah);
    });
    const keys = Object.keys(totals).sort();
    return {
      labels: keys.map(k => {
        const parts = k.split('-');
        return BULAN_PENDEK[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
      }),
      pemasukan: keys.map(k => totals[k].pemasukan),
      pengeluaran: keys.map(k => totals[k].pengeluaran)
    };
  }

  function mountChart(canvasId, rows) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const empty = canvas.parentElement ? canvas.parentElement.querySelector('.chart-empty') : null;
    const series = buildMonthlySeries(rows);

    if (!series.labels.length) {
      destroyChart();
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (!window.Chart) {
      if (empty) { empty.style.display = 'flex'; empty.textContent = 'Pustaka grafik belum termuat (periksa internet).'; }
      return;
    }

    destroyChart();
    state.chart = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: series.labels,
        datasets: [
          { label: 'Pemasukan', data: series.pemasukan, backgroundColor: 'rgba(31, 111, 84, 0.8)', borderColor: '#1F6F54', borderWidth: 1, borderRadius: 4 },
          { label: 'Pengeluaran', data: series.pengeluaran, backgroundColor: 'rgba(175, 70, 43, 0.8)', borderColor: '#AF462B', borderWidth: 1, borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 } }
          },
          tooltip: {
            callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + formatRupiah(ctx.parsed.y) }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(32, 43, 36, 0.08)' },
            ticks: { callback: v => compactRupiah(v), font: { size: 10 } }
          }
        }
      }
    });
  }


  // ============================================================
  // 9. EKSPOR PDF
  // ============================================================
  const PDF_HEAD = ['Tanggal', 'Keterangan', 'Kategori', 'Metode', 'Jumlah'];

  // ---- Tata letak tabel PDF ----
  // Lebar kolom dibuat tetap agar kolom Jumlah berada di posisi yang sama pada
  // tabel Pemasukan maupun Pengeluaran; digit uang rata kanan sehingga sejajar.
  const PDF_LM = 10;        // margin kiri (mm)
  const PDF_RM = 10;        // margin kanan (mm)
  const PDF_RIGHT = 210 - PDF_RM; // tepi kanan kolom angka = 200
  const PDF_COLW_TANGGAL = 42;
  const PDF_COLW_KAT = 32;
  const PDF_COLW_MET = 32;
  const PDF_COLW_JUMLAH = 44;

  // ---- Batas ekspor gambar (PNG) ----
  // Satu PNG harus muat dalam satu canvas di semua perangkat. Tinggi baris tabel
  // laporan ±31 px + header/ringkasan ±420 px (lihat .report-sheet di styles.css),
  // sedangkan batas canvas paling ketat (WebKit/iOS) adalah 16.777.216 px dengan
  // sisi maksimum 8192 px. Dengan lebar 780 px dan skala HD minimum 2x:
  //   8192 / 2 = 4096 px tinggi CSS → (4096 - 420) / 31 ≈ 118 baris → dibulatkan 110.
  // Bila riwayat melebihi batas ini, opsi gambar tidak ditawarkan dan pengguna
  // diberi pemberitahuan untuk memakai PDF (lihat openPngBlockedInfo).
  const PNG_SAFE_MAX_ROWS = 110;
  const PNG_MAX_SIDE = 8192;
  const PNG_MAX_AREA = 16777216;
  const PNG_SHEET_WIDTH = 780;   // lebar .report-sheet dalam px CSS

  // Jumlah catatan pada laporan yang sedang tampil. Dihitung langsung dari state
  // (tanpa menyusun objek laporan) karena dipanggil pada setiap render.
  function pngRowCount() {
    if (state.modal && state.modal.mode === 'book-detail') {
      return filterByPeriod(state.modal.rows || [], state.adminFilter).length;
    }
    return filterByPeriod(state.transactions, state.filter).length;
  }

  function pngAllowed() {
    return pngRowCount() <= PNG_SAFE_MAX_ROWS;
  }

  // Skala BULAT terbesar yang masih aman (bilangan bulat = tanpa interpolasi,
  // jadi huruf tetap tajam; skala pecahan justru membuat teks terlihat buram).
  // Mengembalikan 0 bila tidak ada skala yang muat → pemanggil harus membatalkan
  // ekspor gambar (kasus ini sudah dicegah lebih awal oleh pngAllowed()).
  function pickExportScale(hostW, sheetH) {
    const scales = [3, 2, 1];
    for (let i = 0; i < scales.length; i += 1) {
      const s = scales[i];
      if (hostW * s > PNG_MAX_SIDE || sheetH * s > PNG_MAX_SIDE) continue;
      if (hostW * s * sheetH * s > PNG_MAX_AREA) continue;
      return s;
    }
    return 0;
  }

  // Pemberitahuan saat ekspor gambar tidak tersedia (riwayat terlalu panjang)
  function openPngBlockedInfo(mode) {
    const rows = pngRowCount();
    state.infoBox = {
      tone: 'warn',
      title: 'Format Gambar Tidak Tersedia',
      message: 'Laporan ini berisi ' + rows + ' catatan, melebihi batas ' + PNG_SAFE_MAX_ROWS
        + ' catatan untuk ekspor gambar (PNG). Batas ini menjaga hasil gambar tetap tajam dan tidak terpotong saat dibuka di perangkat lain. '
        + 'Gunakan PDF — teks PDF tetap tajam berapa pun jumlah catatannya. '
        + 'Tips: persempit filter periode (misalnya per bulan) sampai jumlah catatan ≤ ' + PNG_SAFE_MAX_ROWS
        + ', lalu format gambar akan tersedia kembali.',
      pdfAction: true,
      mode: mode || 'unduh'
    };
    render();
  }

  function pdfReady() {
    if (!window.jspdf) {
      showToast('Modul PDF belum siap, coba lagi sebentar');
      return false;
    }
    return true;
  }

  function pdfRows(list) {
    return list.map(x => [
      formatDateLong(x.date),
      x.keterangan,
      x.catName || categoryName(x.categoryId) || '-',
      x.payName || paymentName(x.paymentMethodId) || '-',
      formatRupiah(x.jumlah)
    ]);
  }

  // Baris ringkasan di dalam tabel (label kiri, nilai rata kanan di kolom Jumlah)
  function pdfFootRow(label, value, fillColor, textColor) {
    fillColor = fillColor || [244, 241, 230];
    textColor = textColor || [31, 43, 36];
    return [
      { content: label, colSpan: 4, styles: { halign: 'left', fontStyle: 'bold', fontSize: 10, fillColor: fillColor, textColor: textColor } },
      { content: value, styles: { halign: 'right', fontStyle: 'bold', fontSize: 10, fillColor: fillColor, textColor: textColor } }
    ];
  }

  function pdfSection(doc, title, rows, fillColor, startY, footRows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, PDF_LM, startY);
    const body = rows.length ? pdfRows(rows) : [['-', 'Tidak ada data', '-', '-', '-']];
    (footRows || []).forEach(r => body.push(r));
    doc.autoTable({
      startY: startY + 3,
      head: [[
        { content: 'Tanggal' },
        { content: 'Keterangan' },
        { content: 'Kategori' },
        { content: 'Metode' },
        { content: 'Jumlah', styles: { halign: 'right' } }
      ]],
      body: body,
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.5 },
      headStyles: { fillColor: fillColor, textColor: 255 },
      columnStyles: {
        0: { cellWidth: PDF_COLW_TANGGAL },
        1: { cellWidth: 'auto' },
        2: { cellWidth: PDF_COLW_KAT },
        3: { cellWidth: PDF_COLW_MET },
        4: { cellWidth: PDF_COLW_JUMLAH, halign: 'right' }
      },
      margin: { left: PDF_LM, right: PDF_RM }
    });
    return doc.lastAutoTable.finalY;
  }

  // ---- Data laporan bersama untuk PDF & gambar ----
  function buildReportContext() {
    if (state.modal && state.modal.mode === 'book-detail') {
      const b = state.modal.book;
      const sorted = filterByPeriod(state.modal.rows, state.adminFilter).slice().sort((a, c) => a.date.localeCompare(c.date));
      const masukList = sorted.filter(x => x.type === PEMASUKAN);
      const keluarList = sorted.filter(x => x.type === PENGELUARAN);
      return {
        scope: 'admin', nama: b.nama, owner: state.modal.ownerEmail || '',
        isFiltered: state.adminFilter.type !== 'all',
        periodeLabel: periodLabel(state.adminFilter.type, state.adminFilter.value),
        saldoAwal: Number(b.saldoAwal), saldoAkhir: Number(b.saldoAkhir),
        masukList: decorateReportRows(masukList), keluarList: decorateReportRows(keluarList),
        periodMasuk: masukList.reduce((s, x) => s + x.jumlah, 0),
        periodKeluar: keluarList.reduce((s, x) => s + x.jumlah, 0)
      };
    }
    const book = activeBook();
    if (!book) { showToast('Belum ada pembukuan untuk diekspor'); return null; }
    const t = totals();
    const periodTx = filterByPeriod(state.transactions, state.filter);
    const masukList = periodTx.filter(x => x.type === PEMASUKAN).sort((a, c) => a.date.localeCompare(c.date));
    const keluarList = periodTx.filter(x => x.type === PENGELUARAN).sort((a, c) => a.date.localeCompare(c.date));
    return {
      scope: 'user', nama: book.nama, owner: '',
      isFiltered: state.filter.type !== 'all',
      periodeLabel: periodLabel(state.filter.type, state.filter.value),
      saldoAwal: Number(t.saldoAwal), saldoAkhir: Number(t.saldoAkhir),
      masukList: decorateReportRows(masukList), keluarList: decorateReportRows(keluarList),
      periodMasuk: masukList.reduce((s, x) => s + x.jumlah, 0),
      periodKeluar: keluarList.reduce((s, x) => s + x.jumlah, 0)
    };
  }

  function decorateReportRows(list) {
    return list.map(x => ({
      id: x.id, type: x.type, date: x.date, keterangan: x.keterangan, jumlah: Number(x.jumlah),
      catName: categoryName(x.categoryId), payName: paymentName(x.paymentMethodId)
    }));
  }

  function reportBaseName(ctx) {
    const suffix = ctx.isFiltered ? '-' + slugify(ctx.periodeLabel) : '';
    const prefix = ctx.scope === 'admin' ? 'laporan-admin' : 'laporan';
    return prefix + '-' + slugify(ctx.nama) + suffix + '-' + todayStr();
  }
  function buildPdfDoc(ctx) {
    if (!pdfReady()) return null;
    const doc = new window.jspdf.jsPDF();
    const isFiltered = ctx.isFiltered;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(31, 43, 36);
    doc.text(ctx.scope === 'admin' ? 'Laporan Pembukuan (Admin)' : 'Laporan Pembukuan', PDF_LM, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60, 70, 64);
    doc.text(ctx.nama + (ctx.owner ? ' — ' + ctx.owner : ''), PDF_LM, 25);
    doc.setFontSize(9.5); doc.setTextColor(90, 100, 90);
    doc.text('Dicetak pada ' + new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), PDF_LM, 31);

    let y = 36;
    if (isFiltered) {
      doc.text('Periode: ' + ctx.periodeLabel, PDF_LM, y);
      y += 5;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(31, 43, 36);
    doc.text(isFiltered ? 'Saldo Awal (Keseluruhan)' : 'Saldo Awal', PDF_LM, y);
    doc.text(formatRupiah(ctx.saldoAwal), PDF_RIGHT, y, { align: 'right' });
    y += 9;

    const footIn = [pdfFootRow('Subtotal Pemasukan', formatRupiah(ctx.periodMasuk), [31, 111, 84], [255, 255, 255])];
    y = pdfSection(doc, 'Pemasukan', ctx.masukList, [31, 111, 84], y, footIn) + 8;
    const footOut = [pdfFootRow('Subtotal Pengeluaran', formatRupiah(ctx.periodKeluar), [175, 70, 43], [255, 255, 255])];
    y = pdfSection(doc, 'Pengeluaran', ctx.keluarList, [175, 70, 43], y, footOut) + 8;

    doc.setDrawColor(217, 211, 191); doc.setLineWidth(0.3);
    doc.line(PDF_LM, y, PDF_RIGHT, y);
    y += 8;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(31, 43, 36);
    if (isFiltered) {
      doc.text('Arus Kas Periode Ini', PDF_LM, y);
      doc.text(formatRupiah(ctx.periodMasuk - ctx.periodKeluar), PDF_RIGHT, y, { align: 'right' });
      y += 7;
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 100, 90);
      doc.text('Saldo Akhir (Keseluruhan)', PDF_LM, y);
      doc.text(formatRupiah(ctx.saldoAkhir), PDF_RIGHT, y, { align: 'right' });
    } else {
      doc.text('Saldo Akhir', PDF_LM, y);
      doc.text(formatRupiah(ctx.saldoAkhir), PDF_RIGHT, y, { align: 'right' });
    }
    return doc;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function shareFileBlob(blob, filename) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: filename })
        .then(() => showToast('Berhasil dibagikan'))
        .catch(err => {
          if (err && err.name !== 'AbortError') {
            downloadBlob(blob, filename);
            showToast('Bagikan gagal — file diunduh sebagai gantinya');
          }
        });
    } else {
      downloadBlob(blob, filename);
      showToast('Bagikan tidak didukung di browser ini — file diunduh');
    }
  }

  async function runReport(fmt, mode) {
    const ctx = buildReportContext();
    if (!ctx) return;
    const base = reportBaseName(ctx);
    if (fmt === 'pdf') {
      const doc = buildPdfDoc(ctx);
      if (!doc) return;
      if (mode === 'share') shareFileBlob(doc.output('blob'), base + '.pdf');
      else { doc.save(base + '.pdf'); showToast('PDF diunduh'); }
    } else {
      try {
        const blob = await captureReportImage(ctx);
        if (mode === 'share') shareFileBlob(blob, base + '.png');
        else { downloadBlob(blob, base + '.png'); showToast('Gambar diunduh'); }
      } catch (e) {
        console.error(e);
        showToast('Gagal membuat gambar: ' + ((e && e.message) ? e.message : 'terjadi kesalahan'));
      }
    }
  }


  // ---------- Laporan versi gambar (PNG) ----------
  // Merender "lembar laporan" dalam HTML tersembunyi lalu memotretnya jadi PNG.
  // Isi laporan sama persis dengan versi PDF (ringkasan + rincian transaksi).
  function renderReportSheet(ctx) {
    const printed = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    const metaParts = [];
    if (ctx.isFiltered) metaParts.push('Periode ' + ctx.periodeLabel);
    metaParts.push('Dicetak ' + printed);

    const card = (lbl, val, cls) => '<div class="rsc ' + cls + '"><span>' + lbl + '</span><b>' + val + '</b></div>';
    const summary = '<div class="rs-stats">'
      + card('Saldo Awal' + (ctx.isFiltered ? ' (semua)' : ''), formatRupiah(ctx.saldoAwal), 'awal')
      + card('Pemasukan', formatRupiah(ctx.periodMasuk), 'masuk')
      + card('Pengeluaran', formatRupiah(ctx.periodKeluar), 'keluar')
      + card('Saldo Akhir' + (ctx.isFiltered ? ' (semua)' : ''), formatRupiah(ctx.saldoAkhir), 'akhir')
      + '</div>';

    const section = (title, list, subtotal, cls) => {
      const rows = list.length
        ? list.map(x => '<tr><td>' + formatDateLong(x.date) + '</td><td class="ket">' + escapeHtml(x.keterangan) + '</td><td>' + escapeHtml(x.catName || '-') + '</td><td>' + escapeHtml(x.payName || '-') + '</td><td class="num">' + formatRupiah(x.jumlah) + '</td></tr>').join('')
        : '<tr class="empty"><td colspan="5">Tidak ada data</td></tr>';
      return '<h3 class="rs-sec ' + cls + '">' + title + '</h3>'
        + '<table class="rs-table">'
        + '<thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Metode</th><th class="num">Jumlah</th></tr></thead>'
        + '<tbody>' + rows
        + '<tr class="rs-sub"><td colspan="4">Subtotal ' + title + '</td><td class="num">' + formatRupiah(subtotal) + '</td></tr>'
        + '</tbody></table>';
    };

    const footer = ctx.isFiltered
      ? '<div class="rs-foot"><div class="rs-row"><span>Arus Kas Periode Ini</span><b>' + formatRupiah(ctx.periodMasuk - ctx.periodKeluar) + '</b></div><div class="rs-row dim"><span>Saldo Akhir (Keseluruhan)</span><b>' + formatRupiah(ctx.saldoAkhir) + '</b></div></div>'
      : '<div class="rs-foot"><div class="rs-row"><span>Saldo Akhir</span><b>' + formatRupiah(ctx.saldoAkhir) + '</b></div></div>';

    return '<div class="report-sheet">'
      + '<div class="rs-brand">BUKU KAS</div>'
      + '<div class="rs-title">Laporan Pembukuan' + (ctx.scope === 'admin' ? ' (Admin)' : '') + '</div>'
      + '<div class="rs-sub">' + escapeHtml(ctx.nama) + (ctx.owner ? ' — ' + escapeHtml(ctx.owner) : '') + '</div>'
      + '<div class="rs-meta">' + metaParts.join(' · ') + '</div>'
      + summary
      + section('Pemasukan', ctx.masukList, ctx.periodMasuk, 'in')
      + section('Pengeluaran', ctx.keluarList, ctx.periodKeluar, 'out')
      + footer
      + '</div>';
  }


  // Ambil PNG dari lembar laporan (render element tersembunyi lalu html2canvas)
  function captureReportImage(ctx) {
    return new Promise((resolve, reject) => {
      if (!window.html2canvas) {
        showToast('Modul pembuat gambar belum siap, periksa internet lalu coba lagi');
        reject(new Error('html2canvas tidak tersedia'));
        return;
      }
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-100000px;top:0;width:780px;z-index:-1;';
      host.setAttribute('aria-hidden', 'true');
      host.innerHTML = renderReportSheet(ctx);
      document.body.appendChild(host);
      const sheet = host.firstElementChild;
      const cleanup = () => { try { if (host.parentNode) host.parentNode.removeChild(host); } catch (e) {} };
      const capture = () => {
        // Skala dihitung dari tinggi asli lembar laporan agar satu PNG pasti muat
        // di canvas perangkat ini (dan tetap merupakan angka bulat/tajam).
        const sheetH = Math.max(1, Math.round(sheet.getBoundingClientRect().height));
        const scale = pickExportScale(PNG_SHEET_WIDTH, sheetH);
        if (!scale) {
          cleanup();
          reject(new Error('laporan terlalu panjang untuk satu gambar'));
          return;
        }
        window.html2canvas(sheet, {
          scale: scale,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: PNG_SHEET_WIDTH,
          windowHeight: Math.max(sheetH, window.innerHeight)
        }).then(canvas => {
          canvas.toBlob(blob => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error('gagal membuat PNG'));
          }, 'image/png');
        }).catch(err => { cleanup(); reject(err); });
      };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(capture, capture);
      } else {
        setTimeout(capture, 400);
      }
    });
  }

  // ============================================================
  // 10. RENDER: KOMPONEN KECIL
  // ============================================================
  function totals() {
    const book = activeBook();
    const saldoAwal = book ? Number(book.saldoAwal) : 0;
    let pemasukan = 0, pengeluaran = 0;
    state.transactions.forEach(t => {
      if (t.type === PEMASUKAN) pemasukan += Number(t.jumlah);
      else pengeluaran += Number(t.jumlah);
    });
    return {
      saldoAwal: saldoAwal,
      pemasukan: pemasukan,
      pengeluaran: pengeluaran,
      saldoAkhir: saldoAwal + pemasukan - pengeluaran
    };
  }

  function filterStateFor(scope) {
    return scope === 'admin' ? state.adminFilter : state.filter;
  }

  function renderFilterBar(scope, filterState) {
    const type = filterState.type;
    // Nilai filter juga bisa datang dari sessionStorage (restoreSavedUiState),
    // jadi tetap di-escape sebelum masuk ke atribut.
    const value = escapeHtml(filterState.value || '');
    let valueInput = '';
    if (type === 'day') {
      valueInput = '<input type="date" class="filter-value" data-action="filter-value" data-scope="' + scope + '" value="' + value + '" aria-label="Tanggal filter">';
    } else if (type === 'week') {
      valueInput = '<input type="week" class="filter-value" data-action="filter-value" data-scope="' + scope + '" value="' + value + '" aria-label="Minggu filter">';
    } else if (type === 'month') {
      valueInput = '<input type="month" class="filter-value" data-action="filter-value" data-scope="' + scope + '" value="' + value + '" aria-label="Bulan filter">';
    } else if (type === 'year') {
      const curYear = new Date().getFullYear();
      const opts = [];
      for (let y = curYear; y >= curYear - 6; y--) {
        opts.push('<option value="' + y + '"' + (String(y) === filterState.value ? ' selected' : '') + '>' + y + '</option>');
      }
      valueInput = '<select class="filter-value" data-action="filter-value" data-scope="' + scope + '" aria-label="Tahun filter">' + opts.join('') + '</select>';
    }
    const types = [
      ['all', 'Semua Waktu'],
      ['day', 'Harian'],
      ['week', 'Mingguan'],
      ['month', 'Bulanan'],
      ['year', 'Tahunan']
    ];
    return '<div class="filter-bar">'
      + '<select class="filter-type" data-action="filter-type" data-scope="' + scope + '">'
      + types.map(t => '<option value="' + t[0] + '"' + (type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('')
      + '</select>'
      + valueInput
      + '</div>';
  }

  function renderSearchBar(scope, value, placeholder) {
    return '<div class="search-bar">'
      + ICONS.search
      + '<input type="search" class="search-input" data-action="search-input" data-scope="' + scope + '" placeholder="' + placeholder + '" value="' + escapeHtml(value || '') + '">'
      + (value ? '<button class="search-clear" data-action="search-clear" data-scope="' + scope + '" title="Bersihkan pencarian" aria-label="Bersihkan pencarian">' + ICONS.close + '</button>' : '')
      + '</div>';
  }

  function renderChartCard(id, title) {
    return '<div class="chart-card">'
      + '<h3>' + title + '</h3>'
      + '<div class="chart-wrap">'
      + '<canvas id="' + id + '"></canvas>'
      + '<div class="chart-empty">Belum ada data transaksi untuk ditampilkan.</div>'
      + '</div>'
      + '</div>';
  }

  function matchesSearch(item, term) {
    if (!term) return true;
    const q = String(term).toLowerCase();
    const haystack = [
      item.keterangan,
      categoryName(item.categoryId),
      paymentName(item.paymentMethodId),
      String(item.jumlah),
      // Nominal juga dibandingkan dalam bentuk tampilannya (100,000 / Rp100,000)
      // supaya mengetik dengan pemisah ribuan tetap menemukan catatannya.
      formatAmountInput(item.jumlah),
      formatRupiah(item.jumlah),
      item.date,
      formatDateLong(item.date)
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  }

  function tagHtml(item) {
    const parts = [];
    const cat = categoryName(item.categoryId);
    const pay = paymentName(item.paymentMethodId);
    if (cat) parts.push('<span class="tag tag-cat">' + escapeHtml(cat) + '</span>');
    if (pay) parts.push('<span class="tag tag-pay">' + escapeHtml(pay) + '</span>');
    if (item.notaPath) parts.push('<span class="tag tag-nota" title="Ada lampiran nota">' + ICONS.paperclip + '</span>');
    return parts;
  }

  function renderTransactionRow(item, showActions, readOnlyNota) {
    const dt = formatDateShort(item.date);
    const tags = tagHtml(item);
    const sub = formatDateLong(item.date) + (tags.length ? ' <span style="color:var(--color-line);">·</span> ' + tags.join(' ') : '');
    const actions = showActions
      ? '<div class="row-actions">'
        + '<button class="icon-btn" data-action="edit" data-id="' + item.id + '" data-type="' + item.type + '" title="Ubah catatan" aria-label="Ubah catatan">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="delete" data-id="' + item.id + '" title="Hapus catatan" aria-label="Hapus catatan">' + ICONS.trash + '</button>'
        + '</div>'
      // Tampilan admin (readOnlyNota): hanya boleh MELIHAT lampiran milik
      // pengguna lain — tanpa tombol ubah/hapus.
      : (readOnlyNota && item.notaPath
        ? '<div class="row-actions">'
          + '<button class="icon-btn" data-action="nota-view" data-path="' + escapeHtml(item.notaPath)
          + '" data-kind="' + (notaKind(item) === 'pdf' ? 'pdf' : 'image')
          + '" data-name="' + escapeHtml(item.notaName || 'Lampiran')
          + '" title="Lihat lampiran" aria-label="Lihat lampiran">' + ICONS.paperclip + '</button>'
          + '</div>'
        : '');
    const clickable = showActions
      ? ' data-action="tx-detail" data-id="' + item.id + '"'
      : '';
    return '<div class="row' + (showActions ? ' row-clickable' : '') + '"' + clickable + '>'
      + '<div class="row-date"><span class="d">' + dt.d + '</span>' + dt.m + '</div>'
      + '<div class="row-main"><div class="row-desc">' + escapeHtml(item.keterangan) + '</div>'
      + '<div class="row-sub">' + sub + '</div></div>'
      + '<div class="row-amount ' + (item.type === PEMASUKAN ? 'masuk' : 'keluar') + '">'
      + (item.type === PEMASUKAN ? '+' : '-') + formatRupiah(item.jumlah) + '</div>'
      + actions
      + '</div>';
  }


  // ============================================================
  // 11. RENDER: TAMPILAN UTAMA
  // ============================================================

  // Identitas lapisan yang sedang terbuka (modal / penampil lampiran / kotak
  // info). Dipakai untuk tahu kapan fokus perlu dipindahkan ke dalam modal:
  // hanya saat lapisannya BARU dibuka atau berganti, bukan saat modal yang
  // sama dirender ulang (mis. setelah tautan lampiran selesai dimuat).
  let lastOverlayKey = '';

  function overlayKey() {
    const m = state.modal;
    const modalKey = m
      ? [m.mode, m.editId || m.id || (m.book ? m.book.id : '') || ''].join(':')
      : '';
    const viewerKey = state.notaViewer ? 'viewer:' + (state.notaViewer.path || state.notaViewer.url || '') : '';
    const infoKey = state.infoBox ? 'info:' + (state.infoBox.title || '') : '';
    return [modalKey, viewerKey, infoKey].join('|');
  }

  // Pindahkan fokus ke kontrol pertama di dalam modal yang baru terbuka agar
  // pengguna keyboard & pembaca layar langsung berada di tempat yang benar.
  function focusOverlay() {
    const box = appEl.querySelector('.modal-overlay.overlay-top .modal') || appEl.querySelector('.modal');
    if (!box) return;
    const target = box.querySelector('input:not([type=hidden]):not([disabled]), select, textarea') || box.querySelector('.modal-close');
    if (target) {
      try { target.focus({ preventScroll: true }); } catch (e) { /* abaikan */ }
    }
  }

  // Pasang HTML ke DOM, ikat form, lalu kelola fokus modal.
  function mount(html) {
    appEl.innerHTML = html;
    bindForms();
    const key = overlayKey();
    if (key !== lastOverlayKey) {
      lastOverlayKey = key;
      focusOverlay();
    }
  }

  function render() {
    destroyChart(); // bersihkan grafik lama sebelum DOM diganti
    if (!CONFIG_OK) { appEl.innerHTML = renderConfigScreen(); return; }
    if (!state.dataReady) { appEl.innerHTML = '<div class="loading-wrap">Memuat…</div>'; return; }
    if (!state.session) { mount(renderAuthScreen()); return; }

    let html = renderUserBar();

    if (state.isAdmin) html += renderViewToggle();

    if (state.isAdmin && state.view === 'admin') {
      html += renderAdminView();
      if (hasOverlay()) html += renderModal();
      mount(html);
      mountCharts();
      return;
    }

    if (state.isAdmin && state.view === 'master') {
      html += renderAdminMaster();
      if (hasOverlay()) html += renderModal();
      mount(html);
      return;
    }

    // Buku Saya
    if (state.books.length === 0) {
      html += renderNoBooksScreen();
      if (hasOverlay()) html += renderModal();
      mount(html);
      return;
    }

    html += renderBookView();
    if (hasOverlay()) html += renderModal();
    mount(html);
  }

  function renderUserBar() {
    return '<div class="user-bar">'
      + '<span class="user-chip">' + escapeHtml(state.session.user.email || '') + '</span>'
      + '<button class="btn-signout" data-action="signout">Keluar</button>'
      + '</div>';
  }

  function renderViewToggle() {
    const views = [
      { id: 'buku', label: 'Buku Saya' },
      { id: 'admin', label: 'Pantau Pengguna' },
      { id: 'master', label: 'Master Data' }
    ];
    return '<div class="view-toggle">'
      + views.map(v => '<button class="view-toggle-btn' + (state.view === v.id ? ' active' : '') + '" data-action="switch-view" data-view="' + v.id + '">' + v.label + '</button>').join('')
      + '</div>';
  }

  function renderNoBooksScreen() {
    return '<div class="empty-state" style="padding-top:60px;">' + ICONS.book
      + '<h2>Belum ada pembukuan</h2>'
      + '<p>Buat pembukuan pertama untuk mulai mencatat pemasukan &amp; pengeluaran.</p>'
      + '<button class="btn-pill" data-action="book-new">' + ICONS.plus + ' Tambah Pembukuan</button>'
      + '</div>';
  }


  function renderBookView() {
    const book = activeBook();
    const t = totals();
    const periodTx = filterByPeriod(state.transactions, state.filter);
    const filtered = periodTx
      .filter(x => x.type === state.activeTab && matchesSearch(x, state.search))
      .sort((a, b) => b.date.localeCompare(a.date));

    let html = '<div class="app-header">'
      + '<div class="app-title">'
      + '<button class="book-switcher" data-action="book-picker">'
      + '<span class="book-switcher-brand">BUKU KAS</span>'
      + '<span class="book-switcher-nama"><span class="txt">' + escapeHtml(book ? book.nama : '') + '</span>' + ICONS.chevronDown + '</span>'
      + '</button>'
      + '</div>'
      + renderExportMenu()
      + '</div>';

    if (!state.txReady) {
      return html + '<div class="loading-wrap" style="min-height:30vh;">Memuat transaksi…</div>';
    }

    html += '<div class="hero">'
      + '<div class="hero-seal">SALDO<br>TERCATAT</div>'
      + '<div class="hero-label">Saldo Akhir</div>'
      + '<div class="hero-amount mono">' + formatRupiah(t.saldoAkhir) + '</div>'
      + '<div class="hero-updated">Diperbarui ' + formatDateLong(todayStr()) + '</div>'
      + '</div>';

    html += '<div class="stats-row">'
      + '<div class="stat-chip saldo"><div class="lbl">Saldo Awal <button class="edit-saldo-btn" data-action="book-edit" data-id="' + (book ? book.id : '') + '" title="Ubah pembukuan" aria-label="Ubah pembukuan">' + ICONS.edit + '</button></div><div class="val">' + formatRupiah(t.saldoAwal) + '</div></div>'
      + '<div class="stat-chip masuk"><div class="lbl">Pemasukan</div><div class="val">' + formatRupiah(t.pemasukan) + '</div></div>'
      + '<div class="stat-chip keluar"><div class="lbl">Pengeluaran</div><div class="val">' + formatRupiah(t.pengeluaran) + '</div></div>'
      + '</div>';

    html += renderFilterBar('user', state.filter);
    html += renderSearchBar('user', state.search, 'Cari keterangan, kategori, metode, nominal…');

    if (state.filter.type !== 'all') {
      const periodPemasukan = periodTx.filter(x => x.type === PEMASUKAN).reduce((s, x) => s + x.jumlah, 0);
      const periodPengeluaran = periodTx.filter(x => x.type === PENGELUARAN).reduce((s, x) => s + x.jumlah, 0);
      html += '<div class="period-summary">'
        + '<span><b>' + periodLabel(state.filter.type, state.filter.value) + '</b> &middot; ' + periodTx.length + ' transaksi</span>'
        + '<span><span class="masuk">+' + formatRupiah(periodPemasukan) + '</span> &middot; <span class="keluar">-' + formatRupiah(periodPengeluaran) + '</span></span>'
        + '</div>';
    }

    html += '<div class="tabs">'
      + '<button class="tab-btn' + (state.activeTab === PEMASUKAN ? ' active' : '') + '" data-action="tab" data-tab="' + PEMASUKAN + '">Pemasukan <span class="count">' + periodTx.filter(x => x.type === PEMASUKAN).length + '</span></button>'
      + '<button class="tab-btn' + (state.activeTab === PENGELUARAN ? ' active' : '') + '" data-action="tab" data-tab="' + PENGELUARAN + '">Pengeluaran <span class="count">' + periodTx.filter(x => x.type === PENGELUARAN).length + '</span></button>'
      + '<div class="tab-spacer"></div>'
      + '</div>';

    if (filtered.length === 0) {
      html += '<div class="empty-state">' + ICONS.book
        + '<p>' + (state.search ? 'Tidak ada transaksi yang cocok dengan pencarian.' : 'Belum ada catatan ' + state.activeTab + '. Mulai catat transaksi pertamamu.') + '</p>'
        + '</div>';
    } else {
      html += '<div class="list">' + filtered.map(item => renderTransactionRow(item, true)).join('') + '</div>';
    }

    html += '<div class="fab-wrap"><button class="fab ' + state.activeTab + '" data-action="add" data-type="' + state.activeTab + '">'
      + ICONS.plus + ' Catat ' + (state.activeTab === PEMASUKAN ? 'Pemasukan' : 'Pengeluaran') + '</button></div>';

    return html;
  }


  // ============================================================
  // 12. RENDER: TAMPILAN ADMIN
  // ============================================================
  function renderAdminView() {
    if (!state.adminDataReady) {
      return '<div class="loading-wrap" style="min-height:40vh;">Memuat data pengguna…</div>';
    }
    if (state.adminDrillUserId) {
      return renderAdminUserBooks(state.adminDrillUserId);
    }

    const users = state.adminUsers;
    const totalUsers = users.length;
    const totalBooks = state.adminBooks.length;
    let totalSaldo = 0;
    users.forEach(u => { totalSaldo += u.saldoAkhir; });

    let html = '<div class="app-header">'
      + '<div class="app-title"><h1>Pantau Pengguna</h1><span>Dashboard Admin</span></div>'
      + '</div>';

    html += '<div class="stats-row">'
      + '<div class="stat-chip saldo"><div class="lbl">Pengguna</div><div class="val">' + totalUsers + '</div></div>'
      + '<div class="stat-chip masuk"><div class="lbl">Pembukuan</div><div class="val">' + totalBooks + '</div></div>'
      + '<div class="stat-chip saldo"><div class="lbl">Total Saldo User</div><div class="val">' + formatRupiah(totalSaldo) + '</div></div>'
      + '</div>';

    html += renderSearchBar('admin-user', state.adminUserSearch, 'Cari pengguna…');
    html += renderFilterBar('admin', state.adminFilter);

    const adminRange = periodRange(state.adminFilter.type, state.adminFilter.value);
    if (state.adminFilter.type !== 'all') {
      const periodAll = adminRange ? state.adminTransactions.filter(r => r.date >= adminRange.start && r.date <= adminRange.end) : state.adminTransactions;
      const pMasuk = periodAll.filter(r => r.type === PEMASUKAN).reduce((s, r) => s + r.jumlah, 0);
      const pKeluar = periodAll.filter(r => r.type === PENGELUARAN).reduce((s, r) => s + r.jumlah, 0);
      html += '<div class="period-summary">'
        + '<span><b>' + periodLabel(state.adminFilter.type, state.adminFilter.value) + '</b> &middot; ' + periodAll.length + ' transaksi</span>'
        + '<span><span class="masuk">+' + formatRupiah(pMasuk) + '</span> &middot; <span class="keluar">-' + formatRupiah(pKeluar) + '</span></span>'
        + '</div>';
    }

    // Grafik tren agregat semua pengguna
    html += renderChartCard('admin-chart', 'Grafik Tren Pemasukan & Pengeluaran (Semua Pengguna)');

    const q = state.adminUserSearch.toLowerCase();
    const filteredUsers = q ? users.filter(u => (u.email || '').toLowerCase().includes(q)) : users;

    if (filteredUsers.length === 0) {
      html += '<div class="empty-state">' + ICONS.book + '<p>' + (q ? 'Tidak ada pengguna yang cocok.' : 'Belum ada pengguna terdaftar.') + '</p></div>';
      return html;
    }

    html += '<div class="admin-list">' + filteredUsers.map(renderAdminUserRow).join('') + '</div>';
    return html;
  }

  function renderAdminUserRow(u) {
    const adminRange = periodRange(state.adminFilter.type, state.adminFilter.value);
    let subLabel, amountLabel, amountVal;
    if (state.adminFilter.type !== 'all') {
      let uTx = state.adminTransactions.filter(r => r.user_id === u.id);
      if (adminRange) uTx = uTx.filter(r => r.date >= adminRange.start && r.date <= adminRange.end);
      const uMasuk = uTx.filter(r => r.type === PEMASUKAN).reduce((s, r) => s + r.jumlah, 0);
      const uKeluar = uTx.filter(r => r.type === PENGELUARAN).reduce((s, r) => s + r.jumlah, 0);
      const uLast = uTx.reduce((l, r) => (!l || r.date > l) ? r.date : l, null);
      subLabel = u.jumlahBuku + ' pembukuan &middot; ' + uTx.length + ' transaksi periode ini' + (uLast ? ' &middot; Terakhir ' + formatDateLong(uLast) : '');
      amountLabel = 'Arus Periode Ini';
      amountVal = formatRupiah(uMasuk - uKeluar);
    } else {
      subLabel = u.jumlahBuku + ' pembukuan &middot; ' + u.jumlahTransaksi + ' transaksi &middot; ' + (u.lastDate ? 'Terakhir ' + formatDateLong(u.lastDate) : 'Belum ada aktivitas');
      amountLabel = 'Saldo Akhir';
      amountVal = formatRupiah(u.saldoAkhir);
    }
    return '<button class="admin-row" data-action="admin-drill-user" data-id="' + u.id + '">'
      + '<div class="admin-row-main">'
      + '<div class="admin-row-email">' + escapeHtml(u.email) + (u.role === 'admin' ? ' <span class="badge-admin">admin</span>' : '') + '</div>'
      + '<div class="admin-row-sub">' + subLabel + '</div>'
      + '</div>'
      + '<div class="admin-row-amount"><span class="mono">' + amountVal + '</span><span class="admin-row-label">' + amountLabel + '</span></div>'
      + '</button>';
  }


  function renderAdminUserBooks(userId) {
    const user = state.adminUsers.find(u => u.id === userId);
    let books = state.adminBooks.filter(b => b.userId === userId).sort((a, b) => {
      if (a.lastDate && b.lastDate) return b.lastDate.localeCompare(a.lastDate);
      if (a.lastDate) return -1;
      if (b.lastDate) return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    const q = state.adminUserSearch.toLowerCase();
    if (q) books = books.filter(b => (b.nama || '').toLowerCase().includes(q));

    let html = '<button class="btn-back" data-action="admin-back">' + ICONS.arrowLeft + ' Kembali ke daftar pengguna</button>';
    html += '<div class="admin-user-heading"><h2>' + escapeHtml(user ? user.email : '') + '</h2><p>' + books.length + ' pembukuan</p></div>';
    html += renderSearchBar('admin-user', state.adminUserSearch, 'Cari pembukuan…');
    html += renderFilterBar('admin', state.adminFilter);

    const ubRange = periodRange(state.adminFilter.type, state.adminFilter.value);

    if (books.length === 0) {
      html += '<div class="empty-state">' + ICONS.book + '<p>Pengguna ini belum membuat pembukuan.</p></div>';
      return html;
    }

    html += '<div class="admin-list">' + books.map(b => {
      let subLabel, amountLabel, amountVal;
      if (state.adminFilter.type !== 'all') {
        let bTx = state.adminTransactions.filter(r => r.book_id === b.id);
        if (ubRange) bTx = bTx.filter(r => r.date >= ubRange.start && r.date <= ubRange.end);
        const bMasuk = bTx.filter(r => r.type === PEMASUKAN).reduce((s, r) => s + r.jumlah, 0);
        const bKeluar = bTx.filter(r => r.type === PENGELUARAN).reduce((s, r) => s + r.jumlah, 0);
        const bLast = bTx.reduce((l, r) => (!l || r.date > l) ? r.date : l, null);
        subLabel = bTx.length + ' transaksi periode ini' + (bLast ? ' &middot; Terakhir ' + formatDateLong(bLast) : '');
        amountLabel = 'Arus Periode Ini';
        amountVal = formatRupiah(bMasuk - bKeluar);
      } else {
        subLabel = b.jumlahTransaksi + ' transaksi &middot; ' + (b.lastDate ? 'Terakhir ' + formatDateLong(b.lastDate) : 'Belum ada aktivitas');
        amountLabel = 'Saldo Akhir';
        amountVal = formatRupiah(b.saldoAkhir);
      }
      return '<button class="admin-row" data-action="book-detail" data-id="' + b.id + '">'
        + '<div class="admin-row-main">'
        + '<div class="admin-row-email">' + escapeHtml(b.nama) + '</div>'
        + '<div class="admin-row-sub">' + subLabel + '</div>'
        + '</div>'
        + '<div class="admin-row-amount"><span class="mono">' + amountVal + '</span><span class="admin-row-label">' + amountLabel + '</span></div>'
        + '</button>';
    }).join('') + '</div>';
    return html;
  }


  // ---------- Admin: Master Data (kategori & metode pembayaran) ----------
  function renderAdminMaster() {
    let html = '<div class="app-header">'
      + '<div class="app-title"><h1>Master Data</h1><span>Kelola Kategori & Metode Pembayaran</span></div>'
      + '</div>';
    html += '<div class="seg-tabs">'
      + '<button class="seg-tab' + (state.masterTab === 'kategori' ? ' active' : '') + '" data-action="master-tab" data-tab="kategori">Kategori Transaksi</button>'
      + '<button class="seg-tab' + (state.masterTab === 'metode' ? ' active' : '') + '" data-action="master-tab" data-tab="metode">Metode Pembayaran</button>'
      + '</div>';
    html += state.masterTab === 'kategori' ? renderMasterCategories() : renderMasterPayments();
    return html;
  }

  function compareCategories(a, b) {
    const order = { pemasukan: 0, pengeluaran: 1, semua: 2 };
    const oa = order[a.type] !== undefined ? order[a.type] : 3;
    const ob = order[b.type] !== undefined ? order[b.type] : 3;
    if (oa !== ob) return oa - ob;
    return a.nama.localeCompare(b.nama);
  }

  function renderMasterCategories() {
    const cats = state.categories.slice().sort(compareCategories);
    let html = '<div class="master-head">'
      + '<p>Kategori dipakai pengguna saat mencatat transaksi.</p>'
      + '<button class="btn-add-inline" data-action="category-new">' + ICONS.plus + ' Tambah Kategori</button>'
      + '</div>';
    if (!cats.length) {
      return html + '<div class="empty-state">' + ICONS.book + '<p>Belum ada kategori. Tambahkan kategori pertama.</p></div>';
    }
    html += '<div class="master-list">';
    cats.forEach(c => {
      html += '<div class="master-row">'
        + '<div class="master-row-main">'
        + '<div class="master-row-nama">' + escapeHtml(c.nama) + '</div>'
        + '<div class="master-row-sub">'
        + '<span class="badge-type badge-' + c.type + '">' + labelType(c.type) + '</span>'
        + (c.isActive ? '' : ' <span class="badge-inactive">nonaktif</span>')
        + '</div>'
        + '</div>'
        + '<div class="row-actions">'
        + '<button class="icon-btn" data-action="category-edit" data-id="' + c.id + '" title="Ubah kategori" aria-label="Ubah kategori">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="category-delete" data-id="' + c.id + '" title="Hapus kategori" aria-label="Hapus kategori">' + ICONS.trash + '</button>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
    return html;
  }


  function renderMasterPayments() {
    const pays = state.paymentMethods.slice().sort((a, b) => a.nama.localeCompare(b.nama));
    let html = '<div class="master-head">'
      + '<p>Metode pembayaran: Cash, Transfer, Online, QRIS, dll.</p>'
      + '<button class="btn-add-inline" data-action="payment-new">' + ICONS.plus + ' Tambah Metode</button>'
      + '</div>';
    if (!pays.length) {
      return html + '<div class="empty-state">' + ICONS.book + '<p>Belum ada metode pembayaran.</p></div>';
    }
    html += '<div class="master-list">';
    pays.forEach(p => {
      html += '<div class="master-row">'
        + '<div class="master-row-main">'
        + '<div class="master-row-nama">' + escapeHtml(p.nama) + '</div>'
        + '<div class="master-row-sub">'
        + (p.isActive ? '' : '<span class="badge-inactive">nonaktif</span>')
        + '</div>'
        + '</div>'
        + '<div class="row-actions">'
        + '<button class="icon-btn" data-action="payment-edit" data-id="' + p.id + '" title="Ubah metode" aria-label="Ubah metode">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="payment-delete" data-id="' + p.id + '" title="Hapus metode" aria-label="Hapus metode">' + ICONS.trash + '</button>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
    return html;
  }

  // ---------- Grafik setelah DOM dirender ----------
  function mountCharts() {
    // Dashboard admin (agregat semua pengguna)
    if (state.isAdmin && state.view === 'admin' && !state.adminDrillUserId) {
      const range = periodRange(state.adminFilter.type, state.adminFilter.value);
      const rows = range
        ? state.adminTransactions.filter(r => r.date >= range.start && r.date <= range.end)
        : state.adminTransactions;
      mountChart('admin-chart', rows);
    }
    // Detail pembukuan di modal
    if (state.modal && state.modal.mode === 'book-detail' && !state.modal.loading) {
      const rows = filterByPeriod(state.modal.rows, state.adminFilter);
      mountChart('detail-chart', rows);
    }
  }


  // ============================================================
  // 13. RENDER: MODAL
  // ============================================================
  // Ada lapisan yang harus digambar di atas tampilan (modal / penampil / pemberitahuan)?
  function hasOverlay() {
    return !!(state.modal || state.notaViewer || state.infoBox);
  }

  function renderModal() {
    const m = state.modal;
    // Penampil lampiran & kotak pemberitahuan digambar sebagai lapisan tambahan
    // sehingga modal yang sedang terbuka (mis. detail catatan) tidak ikut tertutup.
    const overlays = (state.notaViewer ? renderNotaViewerModal() : '') + (state.infoBox ? renderInfoBox() : '');
    if (!m) return overlays;
    if (m.mode === 'entry-detail') return renderTxDetailModal() + overlays;
    if (m.mode === 'book-detail') return renderBookDetailModal() + overlays;
    if (m.mode === 'book-picker') return renderBookPickerModal() + overlays;
    if (m.mode === 'book-form') return renderBookFormModal() + overlays;
    if (m.mode === 'category-form') return renderCategoryFormModal() + overlays;
    if (m.mode === 'payment-form') return renderPaymentFormModal() + overlays;
    return renderEntryModal() + overlays;
  }

  // Lapisan penampil lampiran (gambar memakai <img>, PDF memakai <iframe>)
  function renderNotaViewerModal() {
    const v = state.notaViewer;
    if (!v) return '';
    const isPdf = v.kind === 'pdf';
    const body = isPdf
      ? '<iframe class="nota-frame" src="' + escapeHtml(v.url) + '" title="Lampiran PDF"></iframe>'
      : '<img class="nota-viewer-img" src="' + escapeHtml(v.url) + '" alt="Lampiran nota">';
    return '<div class="modal-overlay open overlay-top" data-action="nota-viewer-overlay">'
      + '<div class="modal" data-stop role="dialog" aria-modal="true" aria-label="Lampiran">'
      + '<div class="modal-head"><h2>' + escapeHtml(v.name || 'Lampiran') + '</h2><button class="modal-close" data-action="nota-viewer-close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<div class="nota-viewer-body">' + body + '</div>'
      + '<div class="modal-actions">'
      + '<button type="button" class="btn-secondary" data-action="nota-viewer-close">Tutup</button>'
      + (isPdf ? '<a class="btn-secondary btn-link" href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener">' + ICONS.external + ' Tab Baru</a>' : '')
      + (v.path ? '<button type="button" class="btn-primary" data-action="nota-download" data-path="' + escapeHtml(v.path) + '" data-name="' + escapeHtml(v.name || 'nota') + '">' + ICONS.download + ' Unduh</button>' : '')
      + '</div></div></div>';
  }

  // Kotak pemberitahuan (mis. ekspor gambar tidak tersedia untuk riwayat panjang)
  function renderInfoBox() {
    const b = state.infoBox;
    if (!b) return '';
    return '<div class="modal-overlay open overlay-top" data-action="info-overlay">'
      + '<div class="modal" data-stop role="dialog" aria-modal="true" aria-label="Informasi">'
      + '<div class="modal-head"><h2>' + escapeHtml(b.title || 'Informasi') + '</h2><button class="modal-close" data-action="info-close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<div class="info-box' + (b.tone === 'warn' ? ' warn' : '') + '">'
      + (b.tone === 'warn' ? ICONS.alert : ICONS.file)
      + '<p>' + escapeHtml(b.message || '') + '</p>'
      + '</div>'
      + '<div class="modal-actions">'
      + '<button type="button" class="btn-secondary" data-action="info-close">Mengerti</button>'
      + (b.pdfAction
          ? '<button type="button" class="btn-primary" data-action="export-action" data-fmt="pdf" data-mode="' + escapeHtml(b.mode || 'unduh') + '">' + ICONS.file + ' Pakai PDF</button>'
          : '')
      + '</div></div></div>';
  }

  function renderEntryModal() {
    const m = state.modal;
    const isEdit = !!m.editId;
    const typeLabel = m.type === PEMASUKAN ? 'Pemasukan' : 'Pengeluaran';

    let cats = state.categories.filter(c => c.isActive && (c.type === 'semua' || c.type === m.type));
    // pastikan kategori yang sedang dipilih tetap tampil walau nonaktif/berbeda tipe
    if (m.draft.categoryId) {
      const sel = state.categories.find(c => c.id === m.draft.categoryId);
      if (sel && !cats.some(c => c.id === sel.id)) cats.push(sel);
    }
    let pays = state.paymentMethods.filter(p => p.isActive);
    if (m.draft.paymentMethodId) {
      const sel = state.paymentMethods.find(p => p.id === m.draft.paymentMethodId);
      if (sel && !pays.some(p => p.id === sel.id)) pays.push(sel);
    }

    const catOptions = cats.map(c =>
      '<option value="' + c.id + '"' + (c.id === m.draft.categoryId ? ' selected' : '') + '>' + escapeHtml(c.nama) + '</option>'
    ).join('');
    const payOptions = pays.map(p =>
      '<option value="' + p.id + '"' + (p.id === m.draft.paymentMethodId ? ' selected' : '') + '>' + escapeHtml(p.nama) + '</option>'
    ).join('');

    // Lampiran nota hanya untuk pengeluaran
    const notaField = m.type === PENGELUARAN ? renderNotaField(m) : '';

    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop role="dialog" aria-modal="true" aria-label="Catat transaksi">'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah ' : 'Catat ') + typeLabel + '</h2><button class="modal-close" data-action="close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<form id="entry-form">'
      + '<div class="field"><label>Tanggal</label><input type="date" name="date" value="' + escapeHtml(m.draft.date || '') + '"><div class="field-error" data-err="date"></div></div>'
      + '<div class="field"><label>Keterangan</label><input type="text" name="keterangan" placeholder="mis. Penjualan produk, Bayar listrik" value="' + escapeHtml(m.draft.keterangan || '') + '"><div class="field-error" data-err="keterangan"></div></div>'
      + '<div class="field"><label>Kategori</label><select name="category_id"><option value="">— Pilih kategori —</option>' + catOptions + '</select></div>'
      + '<div class="field"><label>Metode Pembayaran</label><select name="payment_method_id"><option value="">— Pilih metode —</option>' + payOptions + '</select></div>'
      + '<div class="field"><label>Jumlah</label><div class="prefix-wrap"><span>Rp</span><input type="text" inputmode="numeric" autocomplete="off" name="jumlah" class="amount-input" placeholder="0" value="' + formatAmountInput(m.draft.jumlah || '') + '"></div><div class="field-error" data-err="jumlah"></div></div>'
      + notaField
      + '<div class="modal-actions"><button type="button" class="btn-secondary" data-action="close">Batal</button><button type="submit" class="btn-primary' + (m.type === PENGELUARAN ? ' danger' : '') + '">Simpan</button></div>'
      + '</form></div></div>';
  }

  function renderBookPickerModal() {
    const sorted = state.books.slice().sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
    const rows = sorted.map(b => {
      const active = b.id === state.activeBookId;
      return '<div class="book-row' + (active ? ' active' : '') + '">'
        + '<button class="book-row-main" data-action="switch-book" data-id="' + b.id + '">'
        + '<span class="book-row-nama">' + escapeHtml(b.nama)
          + (b.isDefault ? ' <span class="badge-default">default</span>' : '')
          + (active ? ' <span class="badge-active">aktif</span>' : '') + '</span>'
        + '<span class="book-row-sub mono">' + formatRupiah(b.saldoAwal) + ' saldo awal</span>'
        + '</button>'
        + '<button class="icon-btn star' + (b.isDefault ? ' on' : '') + '" data-action="set-default-book" data-id="' + b.id + '" title="' + (b.isDefault ? 'Buku default' : 'Jadikan default') + '" aria-label="' + (b.isDefault ? 'Buku default' : 'Jadikan default') + '">' + (b.isDefault ? ICONS.starFilled : ICONS.star) + '</button>'
        + '<button class="icon-btn" data-action="book-edit" data-id="' + b.id + '" title="Ubah pembukuan" aria-label="Ubah pembukuan">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="book-delete" data-id="' + b.id + '" title="Hapus pembukuan" aria-label="Hapus pembukuan">' + ICONS.trash + '</button>'
        + '</div>';
    }).join('');
    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop role="dialog" aria-modal="true" aria-label="Pilih pembukuan">'
      + '<div class="modal-head"><h2>Pilih Pembukuan</h2><button class="modal-close" data-action="close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<div class="book-picker-list">' + (rows || '<p class="empty-hint">Belum ada pembukuan.</p>') + '</div>'
      + '<button class="btn-pill btn-pill-block" data-action="book-new">' + ICONS.plus + ' Tambah Pembukuan</button>'
      + '</div></div>';
  }


  function renderBookFormModal() {
    const m = state.modal;
    const isEdit = !!m.editId;
    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop role="dialog" aria-modal="true" aria-label="Formulir pembukuan">'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah Pembukuan' : 'Pembukuan Baru') + '</h2><button class="modal-close" data-action="close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<form id="entry-form">'
      + '<div class="field"><label>Nama Pembukuan</label><input type="text" name="nama" placeholder="mis. Toko Kelontong, Usaha Sampingan" value="' + escapeHtml(m.draft.nama) + '" autofocus><div class="field-error" data-err="nama"></div></div>'
      + '<div class="field"><label>Saldo Awal</label><div class="prefix-wrap"><span>Rp</span><input type="text" inputmode="numeric" autocomplete="off" name="saldoAwal" class="amount-input" placeholder="0" value="' + formatAmountInput(m.draft.saldoAwal) + '"></div><div class="field-error" data-err="saldoAwal"></div></div>'
      + '<div class="modal-actions"><button type="button" class="btn-secondary" data-action="close">Batal</button><button type="submit" class="btn-primary">Simpan</button></div>'
      + '</form></div></div>';
  }

  function renderBookDetailModal() {
    const m = state.modal;
    const b = m.book;
    const periodRows = m.loading ? [] : filterByPeriod(m.rows, state.adminFilter);
    const rows = periodRows.filter(x => matchesSearch(x, state.adminTxSearch));
    const isFiltered = state.adminFilter.type !== 'all';
    const periodMasuk = rows.filter(x => x.type === PEMASUKAN).reduce((s, x) => s + x.jumlah, 0);
    const periodKeluar = rows.filter(x => x.type === PENGELUARAN).reduce((s, x) => s + x.jumlah, 0);

    let listHtml;
    if (m.loading) {
      listHtml = '<div class="empty-state" style="padding:28px 10px;"><p>Memuat transaksi…</p></div>';
    } else if (rows.length === 0) {
      const msg = state.adminTxSearch
        ? 'Tidak ada transaksi yang cocok dengan pencarian.'
        : (isFiltered ? 'Tidak ada transaksi pada periode ini.' : 'Belum ada catatan transaksi di pembukuan ini.');
      listHtml = '<div class="empty-state" style="padding:28px 10px;"><p>' + msg + '</p></div>';
    } else {
      listHtml = '<div class="list">' + rows
        .sort((a, c) => c.date.localeCompare(a.date))
        .map(x => renderTransactionRow(x, false, true))
        .join('') + '</div>';
    }

    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop style="max-width:520px;" role="dialog" aria-modal="true" aria-label="Detail pembukuan">'
      + '<div class="modal-head"><h2>' + escapeHtml(b.nama) + '</h2><button class="modal-close" data-action="close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<p style="font-size:11.5px;color:var(--color-ink-soft);margin:-10px 0 14px;">' + escapeHtml(m.ownerEmail) + '</p>'
      + '<div class="stats-row" style="margin-bottom:14px;">'
      + '<div class="stat-chip masuk"><div class="lbl">' + (isFiltered ? 'Pemasukan Periode' : 'Pemasukan') + '</div><div class="val">' + formatRupiah(periodMasuk) + '</div></div>'
      + '<div class="stat-chip keluar"><div class="lbl">' + (isFiltered ? 'Pengeluaran Periode' : 'Pengeluaran') + '</div><div class="val">' + formatRupiah(periodKeluar) + '</div></div>'
      + '<div class="stat-chip saldo"><div class="lbl">Saldo Akhir</div><div class="val">' + formatRupiah(b.saldoAkhir) + '</div></div>'
      + '</div>'
      + renderFilterBar('admin', state.adminFilter)
      + renderSearchBar('admin-tx', state.adminTxSearch, 'Cari transaksi…')
      + renderChartCard('detail-chart', 'Grafik Tren Buku Ini')
      + listHtml
      + renderExportMenu('outline')
      + '</div></div>';
  }


  function renderCategoryFormModal() {
    const m = state.modal;
    const isEdit = !!m.editId;
    const typeOptions = [PEMASUKAN, PENGELUARAN, 'semua'].map(t =>
      '<option value="' + t + '"' + (m.draft.type === t ? ' selected' : '') + '>' + labelType(t) + '</option>'
    ).join('');
    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop role="dialog" aria-modal="true" aria-label="Formulir kategori">'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah Kategori' : 'Kategori Baru') + '</h2><button class="modal-close" data-action="close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<form id="entry-form">'
      + '<div class="field"><label>Nama Kategori</label><input type="text" name="nama" placeholder="mis. Penjualan, Belanja, Transportasi" value="' + escapeHtml(m.draft.nama) + '" autofocus><div class="field-error" data-err="nama"></div></div>'
      + '<div class="field"><label>Tipe</label><select name="type">' + typeOptions + '</select><div class="field-error" data-err="type"></div></div>'
      + '<div class="field"><label style="display:flex;align-items:center;gap:6px;text-transform:none;letter-spacing:0;font-size:14px;font-weight:500;"><input type="checkbox" name="is_active"' + (m.draft.isActive ? ' checked' : '') + ' style="width:auto;"> Aktif (terlihat oleh pengguna)</label></div>'
      + '<div class="modal-actions"><button type="button" class="btn-secondary" data-action="close">Batal</button><button type="submit" class="btn-primary">Simpan</button></div>'
      + '</form></div></div>';
  }

  function renderPaymentFormModal() {
    const m = state.modal;
    const isEdit = !!m.editId;
    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop role="dialog" aria-modal="true" aria-label="Formulir metode pembayaran">'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah Metode Pembayaran' : 'Metode Pembayaran Baru') + '</h2><button class="modal-close" data-action="close" aria-label="Tutup">' + ICONS.close + '</button></div>'
      + '<form id="entry-form">'
      + '<div class="field"><label>Nama Metode</label><input type="text" name="nama" placeholder="mis. Cash, Transfer, Online, QRIS" value="' + escapeHtml(m.draft.nama) + '" autofocus><div class="field-error" data-err="nama"></div></div>'
      + '<div class="field"><label style="display:flex;align-items:center;gap:6px;text-transform:none;letter-spacing:0;font-size:14px;font-weight:500;"><input type="checkbox" name="is_active"' + (m.draft.isActive ? ' checked' : '') + ' style="width:auto;"> Aktif (terlihat oleh pengguna)</label></div>'
      + '<div class="modal-actions"><button type="button" class="btn-secondary" data-action="close">Batal</button><button type="submit" class="btn-primary">Simpan</button></div>'
      + '</form></div></div>';
  }

  // ============================================================
  // 14. RENDER: AUTH & CONFIG
  // ============================================================
  function renderAuthScreen() {
    const isSignup = state.authView === 'signup';
    return '<div class="auth-wrap"><div class="auth-card">'
      + '<div class="auth-brand">BUKU KAS</div>'
      + '<h1>' + (isSignup ? 'Buat akun baru' : 'Masuk ke akun kamu') + '</h1>'
      + '<div class="auth-tabs">'
      + '<button type="button" class="auth-tab-btn' + (!isSignup ? ' active' : '') + '" data-action="authtab" data-view="signin">Masuk</button>'
      + '<button type="button" class="auth-tab-btn' + (isSignup ? ' active' : '') + '" data-action="authtab" data-view="signup">Daftar</button>'
      + '</div>'
      + (state.authError ? '<div class="auth-error">' + escapeHtml(state.authError) + '</div>' : '')
      + (state.authNotice ? '<div class="auth-notice">' + escapeHtml(state.authNotice) + '</div>' : '')
      + '<form id="auth-form">'
      + '<div class="field"><label>Email</label><input type="email" name="email" required autocomplete="email"></div>'
      + '<div class="field"><label>Kata Sandi</label><input type="password" name="password" required minlength="6" autocomplete="' + (isSignup ? 'new-password' : 'current-password') + '"></div>'
      + '<button type="submit" class="btn-primary" style="width:100%;" ' + (state.authBusy ? 'disabled' : '') + '>' + (state.authBusy ? 'Memproses…' : (isSignup ? 'Daftar' : 'Masuk')) + '</button>'
      + '</form>'
      + '</div></div>';
  }

  function renderConfigScreen() {
    return '<div class="config-wrap"><div class="config-card">'
      + '<h2>Konfigurasi Supabase diperlukan</h2>'
      + '<p>Aplikasi ini terhubung ke project Supabase kamu sendiri untuk fitur login &amp; database. Ikuti langkah berikut:</p>'
      + '<ol>'
      + '<li>Buat project gratis di <code>supabase.com</code>.</li>'
      + '<li>Buka <b>SQL Editor</b> di project kamu, jalankan isi file <code>schema.sql</code> yang disertakan untuk membuat tabel &amp; aturan keamanan data.</li>'
      + '<li>Buka <b>Project Settings → API</b>, salin <code>Project URL</code> dan <code>anon public key</code>.</li>'
      + '<li>Buka file <code>app.js</code>, cari <code>SUPABASE_URL</code> &amp; <code>SUPABASE_ANON_KEY</code> di bagian Konfigurasi, lalu tempel nilainya.</li>'
      + '<li>Simpan file dan muat ulang halaman ini.</li>'
      + '</ol>'
      + '<pre>const SUPABASE_URL = \'https://xxxxxxxx.supabase.co\';\nconst SUPABASE_ANON_KEY = \'eyJhbGciOi....\';</pre>'
      + '</div></div>';
  }


  // ============================================================
  // 15. EVENT HANDLING & BINDING FORM
  // ============================================================
  function doSignIn(email, password) {
    state.authBusy = true; state.authError = ''; state.authNotice = ''; render();
    return sb.auth.signInWithPassword({ email: email, password: password }).then(res => {
      state.authBusy = false;
      if (res.error) { state.authError = res.error.message; render(); }
    });
  }

  function doSignUp(email, password) {
    state.authBusy = true; state.authError = ''; state.authNotice = ''; render();
    return sb.auth.signUp({ email: email, password: password }).then(res => {
      state.authBusy = false;
      if (res.error) { state.authError = res.error.message; render(); return; }
      if (!(res.data && res.data.session)) {
        state.authNotice = 'Akun dibuat. Cek email kamu untuk verifikasi, lalu masuk.';
        state.authView = 'signin';
        render();
      }
    });
  }

  function doSignOut() {
    sb.auth.signOut();
  }

  function bindForms() {
    const entryForm = document.getElementById('entry-form');
    if (entryForm) {
      entryForm.addEventListener('submit', e => {
        e.preventDefault();
        // Modal bisa saja sudah tertutup (mis. tumpukan overlay berubah) saat
        // pengiriman diproses — jangan sampai menyentuh state.modal yang null.
        if (!state.modal) return;
        const fd = new FormData(entryForm);
        const btn = entryForm.querySelector('button[type=submit]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Menyimpan…';

        let task;
        if (state.modal.mode === 'book-form') {
          task = submitBookForm(fd.get('nama'), fd.get('saldoAwal'), state.modal.editId);
        } else if (state.modal.mode === 'category-form') {
          task = submitCategoryForm({
            nama: fd.get('nama'),
            type: fd.get('type'),
            isActive: fd.get('is_active') === 'on',
            editId: state.modal.editId
          });
        } else if (state.modal.mode === 'payment-form') {
          task = submitPaymentForm({
            nama: fd.get('nama'),
            isActive: fd.get('is_active') === 'on',
            editId: state.modal.editId
          });
        } else {
          task = submitEntry({
            type: state.modal.type,
            date: fd.get('date'),
            keterangan: fd.get('keterangan'),
            jumlah: fd.get('jumlah'),
            categoryId: fd.get('category_id'),
            paymentMethodId: fd.get('payment_method_id'),
            editId: state.modal.editId
          });
        }

        task.then(errors => {
          if (errors) {
            Object.keys(errors).forEach(key => {
              const el = entryForm.querySelector('[data-err="' + key + '"]');
              if (el) { el.textContent = errors[key]; el.classList.add('show'); }
            });
            btn.disabled = false;
            btn.textContent = originalText;
          }
        });
      });
    }

    const authForm = document.getElementById('auth-form');
    if (authForm) {
      authForm.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(authForm);
        const email = fd.get('email');
        const password = fd.get('password');
        if (state.authView === 'signup') doSignUp(email, password);
        else doSignIn(email, password);
      });
    }
  }

  // Pencarian: state diperbarui seketika (supaya nilai input tidak "kembali"),
  // sedangkan render ditunda sesaat agar mengetik di daftar panjang tidak
  // mengganti seluruh DOM pada setiap ketukan tombol.
  const SEARCH_DEBOUNCE_MS = 200;
  let searchTimer = null;
  let searchScopePending = null;

  function setSearch(scope, value) {
    if (scope === 'admin-user') state.adminUserSearch = value;
    else if (scope === 'admin-tx') state.adminTxSearch = value;
    else state.search = value;

    searchScopePending = scope;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = null;
      const targetScope = searchScopePending;
      searchScopePending = null;
      render();
      // kembalikan fokus & posisi kursor agar tetap bisa mengetik
      const input = document.querySelector('.search-input[data-scope="' + targetScope + '"]');
      if (input) {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    }, SEARCH_DEBOUNCE_MS);
  }


  // ---- Menu ekspor (ikon Unduh / Bagikan → pilih PDF/PNG) ----
  function renderExportMenu(variant) {
    const isOutline = variant === 'outline';
    const mode = state.exportMenu; // null | 'unduh' | 'bagikan'
    const actionWord = mode === 'bagikan' ? 'Bagikan' : 'Unduh';
    // Riwayat terlalu panjang → opsi gambar tidak ditawarkan sama sekali,
    // diganti keterangan yang bisa diketuk untuk melihat alasannya.
    const canPng = pngAllowed();
    const rowCount = pngRowCount();
    const pop = mode
      ? '<div class="export-menu" role="menu">'
        + '<button type="button" class="export-fmt" role="menuitem" data-action="export-action" data-fmt="pdf" title="' + actionWord + ' PDF" aria-label="' + actionWord + ' PDF">' + ICONS.file + '<span class="fmt-tag">PDF</span></button>'
        + (canPng
            ? '<button type="button" class="export-fmt" role="menuitem" data-action="export-action" data-fmt="png" title="' + actionWord + ' Gambar (PNG)" aria-label="' + actionWord + ' Gambar (PNG)">' + ICONS.image + '<span class="fmt-tag">PNG</span></button>'
            : '<button type="button" class="export-note" role="menuitem" data-action="export-png-blocked" data-mode="' + mode + '">'
              + ICONS.alert + '<span>Format gambar dinonaktifkan — riwayat terlalu panjang (' + rowCount + ' catatan)</span></button>')
        + '</div>'
      : '';
    const btnClass = isOutline ? 'btn-export-outline' : 'btn-export';
    return '<div class="export-wrap">'
      + '<button type="button" class="' + btnClass + (mode === 'unduh' ? ' on' : '') + '" data-action="export-toggle" data-mode="unduh" title="Unduh" aria-label="Unduh">' + ICONS.download + '</button>'
      + '<button type="button" class="' + btnClass + (mode === 'bagikan' ? ' on' : '') + '" data-action="export-toggle" data-mode="bagikan" title="Bagikan" aria-label="Bagikan">' + ICONS.share + '</button>'
      + pop
      + '</div>';
  }

  // ---- Delegasi event klik ----
  const ACTIONS = {
    'export-toggle': el => {
      const mode = el.getAttribute('data-mode');
      state.exportMenu = state.exportMenu === mode ? null : mode;
      // render ditunda sedikit agar event klik saat ini selesai dulu (klik di luar
      // area export-wrap baru menutup menu setelahnya)
      setTimeout(() => render(), 0);
    },
    'export-action': el => {
      const fmt = el.getAttribute('data-fmt');
      const explicitMode = el.getAttribute('data-mode');
      const mode = explicitMode
        ? (explicitMode === 'bagikan' ? 'share' : 'download')
        : (state.exportMenu === 'bagikan' ? 'share' : 'download');
      // Jaring pengaman: bila riwayat terlalu panjang, format gambar tidak boleh
      // diproses (hasilnya akan terpotong/kosong) → tampilkan pemberitahuan.
      if (fmt === 'png' && !pngAllowed()) {
        state.exportMenu = null;
        state.infoBox = null;
        render();
        openPngBlockedInfo(mode === 'share' ? 'bagikan' : 'unduh');
        return;
      }
      state.exportMenu = null;
      state.infoBox = null;
      render();
      runReport(fmt, mode);
    },
    tab: el => switchTab(el.getAttribute('data-tab')),
    add: el => openEntryModal(el.getAttribute('data-type'), null),
    edit: el => openEntryModal(el.getAttribute('data-type'), el.getAttribute('data-id')),
    delete: el => { if (confirm('Hapus catatan ini?')) deleteEntry(el.getAttribute('data-id')); },
    'tx-detail': el => openTxDetail(el.getAttribute('data-id')),
    close: closeModal,
    overlay: (el, e) => { if (e.target === el) closeModal(); },
    signout: doSignOut,
    authtab: el => { state.authView = el.getAttribute('data-view'); state.authError = ''; state.authNotice = ''; render(); },
    'switch-view': el => switchView(el.getAttribute('data-view')),
    'book-picker': openBookPicker,
    'book-new': () => openBookForm(null),
    'book-edit': el => openBookForm(el.getAttribute('data-id')),
    'switch-book': el => { state.modal = null; switchActiveBook(el.getAttribute('data-id')); },
    'book-delete': el => {
      if (confirm('Menghapus pembukuan ini akan menghapus seluruh transaksi di dalamnya. Lanjutkan?')) deleteBook(el.getAttribute('data-id'));
    },
    'set-default-book': el => setBookDefault(el.getAttribute('data-id')),
    'admin-drill-user': el => { state.adminDrillUserId = el.getAttribute('data-id'); render(); },
    'admin-back': () => { state.adminDrillUserId = null; render(); },
    'book-detail': el => openBookDetail(el.getAttribute('data-id')),
    'master-tab': el => { state.masterTab = el.getAttribute('data-tab'); render(); },
    'category-new': () => openCategoryForm(null),
    'category-edit': el => openCategoryForm(el.getAttribute('data-id')),
    'category-delete': el => {
      if (confirm('Hapus kategori ini? Transaksi terkait akan kehilangan kategorinya.')) deleteCategory(el.getAttribute('data-id'));
    },
    'payment-new': () => openPaymentForm(null),
    'payment-edit': el => openPaymentForm(el.getAttribute('data-id')),
    'payment-delete': el => {
      if (confirm('Hapus metode ini? Transaksi terkait akan kehilangan metodenya.')) deletePaymentMethod(el.getAttribute('data-id'));
    },
    'search-clear': el => setSearch(el.getAttribute('data-scope'), ''),
    'export-png-blocked': el => openPngBlockedInfo(el.getAttribute('data-mode')),
    'nota-pick-image': () => triggerNotaInput('nota-camera'),
    'nota-pick-file': () => triggerNotaInput('nota-file'),
    'nota-remove': clearDraftNota,
    'nota-view': el => openNotaViewer(el),
    'nota-download': el => downloadNotaFile(el),
    'nota-viewer-close': () => { state.notaViewer = null; render(); },
    'nota-viewer-overlay': (el, e) => { if (e.target === el) { state.notaViewer = null; render(); } },
    'info-close': () => { state.infoBox = null; render(); },
    'info-overlay': (el, e) => { if (e.target === el) { state.infoBox = null; render(); } }
  };

  appEl.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');
    // Aksi lain selain tombol ekspor otomatis menutup menu ekspor
    if (action !== 'export-toggle' && action !== 'export-action') {
      if (state.exportMenu) state.exportMenu = null;
    }
    const handler = ACTIONS[action];
    if (handler) handler(el, e);
  });

  // Klik di luar area menu ekspor menutup menu
  document.addEventListener('click', e => {
    if (!state.exportMenu) return;
    if (e.target && e.target.closest && e.target.closest('.export-wrap')) return;
    state.exportMenu = null;
    render();
  });

  // Esc menutup lapisan paling atas lebih dulu — penampil lampiran → kotak
  // pemberitahuan → menu ekspor → modal — seperti kebiasaan dialog pada umumnya.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (state.notaViewer) { state.notaViewer = null; render(); return; }
    if (state.infoBox) { state.infoBox = null; render(); return; }
    if (state.exportMenu) { state.exportMenu = null; render(); return; }
    if (state.modal) closeModal();
  });

  // ---- Delegasi event change (filter periode) ----
  appEl.addEventListener('change', e => {
    const el = e.target;
    // Input berkas lampiran: unggah file memicu "change", bukan "input"
    if (el.classList && el.classList.contains('nota-input')) {
      const file = el.files && el.files[0];
      el.value = ''; // agar memilih berkas yang sama lagi tetap memicu event
      if (file) handleNotaPick(file);
      return;
    }
    const action = el.getAttribute('data-action');
    if (!action) return;
    const scope = el.getAttribute('data-scope');
    if (action === 'filter-type') {
      const fs = filterStateFor(scope);
      fs.type = el.value;
      fs.value = el.value === 'all' ? '' : defaultFilterValue(el.value);
      render();
    } else if (action === 'filter-value') {
      filterStateFor(scope).value = el.value;
      render();
    }
  });

  // ---- Delegasi event input (pencarian & format jumlah) ----
  appEl.addEventListener('input', e => {
    const el = e.target;
    if (el.getAttribute('data-action') === 'search-input') {
      setSearch(el.getAttribute('data-scope'), el.value);
    } else if (el.classList && el.classList.contains('amount-input')) {
      formatAmountField(el);
    }
  });

  // ---- Saat fokus ke kolom uang, pilih seluruh isi agar mengetik menggantikannya ----
  appEl.addEventListener('focusin', e => {
    const el = e.target;
    if (el && el.classList && el.classList.contains('amount-input')) {
      try { el.select(); } catch (err) { /* abaikan */ }
    }
  });

  // ============================================================
  // 16. INIT
  // ============================================================
  function resetSessionState() {
    state.books = [];
    state.activeBookId = null;
    state.transactions = [];
    state.activeTab = PEMASUKAN;
    state.search = '';
    state.isAdmin = false;
    state.view = 'buku';
    state.masterTab = 'kategori';
    state.adminDataReady = false;
    state.adminUsers = [];
    state.adminBooks = [];
    state.adminTransactions = [];
    state.adminDrillUserId = null;
    state.adminUserSearch = '';
    state.adminTxSearch = '';
    state.categories = [];
    state.paymentMethods = [];
    state.filter = { type: 'all', value: '' };
    state.adminFilter = { type: 'all', value: '' };
    state.modal = null;
    state.exportMenu = false;
    state.notaUrls = {};
    state.notaBusy = false;
    state.notaViewer = null;
    state.infoBox = null;
  }

  function init() {
    if (!CONFIG_OK) { state.dataReady = true; render(); return; }
    if (typeof window.supabase === 'undefined') {
      appEl.innerHTML = '<div class="loading-wrap">Gagal memuat pustaka Supabase. Periksa koneksi internet lalu muat ulang halaman.</div>';
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Simpan posisi layar sebelum halaman ditutup / di-refresh agar bisa dipulihkan
    window.addEventListener('pagehide', saveUiState);

    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearSavedUiState();
        state.session = null;
        resetSessionState();
        state.txReady = true;
        state.dataReady = true;
        render();
        return;
      }
      // Event token diperbarui otomatis (mis. saat kembali dari aplikasi lain)
      // TIDAK perlu memuat ulang data → mencegah "auto refresh"/kedipan layar.
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN' && event !== 'USER_UPDATED') {
        if (session) state.session = session;
        return;
      }
      state.session = session;
      if (session) {
        loadUserData();
      } else {
        clearSavedUiState();
        resetSessionState();
        state.txReady = true;
        state.dataReady = true;
        render();
      }
    });
  }

  init();
})();

