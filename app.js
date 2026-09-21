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
    includeSubs: true,     // gabungkan sub-pembukuan ke tampilan buku aktif
    transactions: [],
    activeTab: PEMASUKAN,
    search: '',

    // master data global (kategori & metode pembayaran dari admin)
    categories: [],
    paymentMethods: [],

    // modal aktif
    modal: null,
    confirmBox: null,      // konfirmasi tindakan destruktif (mis. hapus pembukuan)
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
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    cornerDownRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>'
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
        includeSubs: state.includeSubs,
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
    if (typeof saved.includeSubs === 'boolean') state.includeSubs = saved.includeSubs;
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
    return {
      id: b.id, nama: b.nama, saldoAwal: Number(b.saldo_awal),
      isDefault: !!b.is_default,
      parentId: b.parent_id || null,
      isSub: !!b.parent_id,
      createdAt: b.created_at
    };
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
      bookId: r.book_id,
      bookNama: '',
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
  // 4C. SUB PEMBUKUAN (hierarki buku)
  // Sebuah pembukuan bisa punya sub-pembukuan (mis. "Toko Utama"
  // → "Cabang A", "Cabang B"), dan sub bisa punya sub lagi.
  // Buku tanpa induk = pembukuan induk/utama.
  // Semua perhitungan dibuat rekursif & tahan siklus.
  // ============================================================
  function bookById(id) {
    return state.books.find(b => b.id === id) || null;
  }

  function bookName(id) {
    const b = bookById(id);
    return b ? b.nama : '';
  }

  // Seluruh pembukuan induk (tanpa parent)
  function rootBooks() {
    return state.books.filter(b => !b.parentId);
  }

  // Anak langsung dari sebuah buku
  function childrenOf(bookId) {
    return state.books.filter(b => b.parentId === bookId);
  }

  // Id buku ini + seluruh turunannya (rekursif, tahan siklus)
  function bookWithDescendantIds(bookId) {
    const ids = [];
    const seen = {};
    const walk = id => {
      if (!id || seen[id]) return;
      seen[id] = true;
      ids.push(id);
      childrenOf(id).forEach(child => walk(child.id));
    };
    walk(bookId);
    return ids;
  }

  // Turunan saja, tanpa buku itu sendiri
  function descendantIds(bookId) {
    return bookWithDescendantIds(bookId).slice(1);
  }

  function isGroupBook(book) {
    return !!book && childrenOf(book.id).length > 0;
  }

  // Buku yang ikut ditampilkan/dihitung: buku aktif saja, atau buku aktif + seluruh sub
  function viewBookIds() {
    if (!state.activeBookId) return [];
    return state.includeSubs ? bookWithDescendantIds(state.activeBookId) : [state.activeBookId];
  }

  // Buku yang boleh dipilih sebagai induk (semua kecuali dirinya & turunannya)
  function parentCandidates(bookId) {
    const blocked = bookId ? bookWithDescendantIds(bookId) : [];
    return state.books.filter(b => blocked.indexOf(b.id) === -1);
  }

  // Kedalaman sebuah buku (induk = 0)
  function bookDepth(id) {
    let depth = 0;
    let cur = bookById(id);
    while (cur && cur.parentId && depth < 10) {
      depth += 1;
      cur = bookById(cur.parentId);
    }
    return depth;
  }

  // Nama lengkap berjenjang, mis. "Toko Utama › Cabang A"
  function bookLabel(id) {
    const parts = [];
    let cur = bookById(id);
    let guard = 0;
    while (cur && guard < 10) {
      parts.unshift(cur.nama);
      cur = cur.parentId ? bookById(cur.parentId) : null;
      guard += 1;
    }
    return parts.join(' \u203A ');
  }

  // Label ringkas untuk <option>: sub diberi indentasi & penanda
  function bookOptionLabel(book) {
    const depth = bookDepth(book.id);
    return (depth ? '\u00A0\u00A0'.repeat(depth) + '\u21B3 ' : '') + book.nama;
  }

  // Susun daftar buku apa pun (state.books / data admin) menjadi urutan pohon
  function treeOrder(list) {
    const rows = [];
    const seen = {};
    const walk = (parentId, depth) => {
      list.forEach(b => {
        if (seen[b.id] || (b.parentId || null) !== (parentId || null)) return;
        seen[b.id] = true;
        rows.push({ book: b, depth: depth });
        walk(b.id, depth + 1);
      });
    };
    walk(null, 0);
    // Bila induknya tidak ada di daftar (mis. terfilter), sisanya tampil di akar
    list.forEach(b => {
      if (seen[b.id]) return;
      seen[b.id] = true;
      rows.push({ book: b, depth: 0 });
    });
    return rows;
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

  // Siapkan tautan untuk banyak lampiran sekaligus (hemat permintaan)
  function preloadNotaUrls(paths) {
    const list = (paths || []).filter(p => p && !notaCachedUrl(p));
    if (!list.length) return;
    api.getNotaUrls(list, NOTA_URL_TTL).then(res => {
      if (res.error || !res.data) return;
      res.data.forEach(item => {
        if (!item || item.error || !item.signedUrl || !item.path) return;
        state.notaUrls[item.path] = { url: item.signedUrl, exp: Date.now() + (NOTA_URL_TTL - 300) * 1000 };
      });
    }).catch(() => { /* tautan gagal disiapkan bukan masalah fatal */ });
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
    if (Object.prototype.hasOwnProperty.call(payload, 'book_id')) patch.bookId = payload.book_id;
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
  const api = {
    getBooks() {
      return sb.from('books').select('*').eq('user_id', state.session.user.id).order('created_at', { ascending: true });
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

    getTransactions(bookIds) {
      const ids = [].concat(bookIds || []).filter(Boolean);
      if (!ids.length) return Promise.resolve({ data: [], error: null });
      return sb.from('transactions').select('*').in('book_id', ids).order('date', { ascending: false });
    },

    // Jumlah transaksi pada sekumpulan pembukuan (tanpa memuat datanya)
    // Dipakai untuk menampilkan angka akurat pada notifikasi hapus.
    countTransactions(bookIds) {
      const ids = [].concat(bookIds || []).filter(Boolean);
      if (!ids.length) return Promise.resolve({ count: 0, error: null });
      return sb.from('transactions').select('id', { count: 'exact', head: true }).in('book_id', ids);
    },

    createBook(nama, saldoAwal, parentId) {
      return sb.from('books')
        .insert([{ user_id: state.session.user.id, nama: nama, saldo_awal: saldoAwal, parent_id: parentId || null }])
        .select().single();
    },

    updateBook(id, nama, saldoAwal, parentId) {
      return sb.from('books')
        .update({ nama: nama, saldo_awal: saldoAwal, parent_id: parentId || null, updated_at: new Date().toISOString() })
        .eq('id', id);
    },

    deleteBook(id) {
      return sb.from('books').delete().eq('id', id);
    },

    setDefaultBook(id) {
      return sb.rpc('set_default_book', { p_book_id: id });
    },

    createTransaction(payload, bookId) {
      return sb.from('transactions')
        .insert([Object.assign({ user_id: state.session.user.id, book_id: bookId || state.activeBookId }, payload)])
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

    getAdminData() {
      return Promise.all([
        sb.from('profiles').select('id, email, role, created_at'),
        sb.from('books').select('id, user_id, nama, saldo_awal, parent_id, created_at'),
        sb.from('transactions').select('id, user_id, book_id, type, date, jumlah, keterangan, category_id, payment_method_id, nota_path, nota_mime, nota_name, nota_size')
      ]);
    }
  };


  // ============================================================
  // 7. AKSI CRUD & MUAT DATA
  // ============================================================

  function loadUserData() {
    state.dataReady = false;
    render();
    Promise.all([
      api.getBooks(),
      api.getProfile(),
      api.getCategories(),
      api.getPaymentMethods()
    ]).then(([booksRes, profileRes, catRes, payRes]) => {
      if (booksRes.error) throw booksRes.error;
      if (catRes.error) throw catRes.error;
      if (payRes.error) throw payRes.error;

      state.books = (booksRes.data || []).map(mapBook);
      state.categories = (catRes.data || []).map(mapCategory);
      state.paymentMethods = (payRes.data || []).map(mapPayment);
      state.isAdmin = !!(profileRes && !profileRes.error && profileRes.data && profileRes.data.role === 'admin');

      // Pulihkan posisi terakhir user (buku/tab/filter) bila ada sesi tersimpan
      restoreSavedUiState();
      if (!state.isAdmin && (state.view === 'admin' || state.view === 'master')) state.view = 'buku';

      if (state.books.length) {
        if (!state.books.some(b => b.id === state.activeBookId)) {
          // Buka buku default; bila belum ada penanda default, pakai buku induk pertama
          const def = state.books.find(b => b.isDefault && !b.parentId) || rootBooks()[0] || state.books[0];
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
    // Mode gabungan: memuat transaksi buku ini + seluruh sub-pembukuan di dalamnya
    const ids = (bookId === state.activeBookId && state.includeSubs)
      ? bookWithDescendantIds(bookId)
      : [bookId];
    state.txReady = false;
    state.transactions = [];
    render();
    api.getTransactions(ids).then(res => {
      if (res.error) throw res.error;
      if (state.activeBookId !== bookId) return; // pengguna pindah buku sebelum selesai
      state.transactions = (res.data || []).map(r => {
        const tx = mapTransaction(r);
        tx.bookNama = bookName(tx.bookId); // dipakai sebagai tag pada mode gabungan
        return tx;
      });
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
    // Buku yang punya sub ditampilkan gabungan secara default
    state.includeSubs = childrenOf(bookId).length > 0;
    loadBookTransactions(bookId);
  }

  // Saklar "gabungkan sub-pembukuan" pada tampilan buku
  function toggleSubs() {
    if (!state.activeBookId) return;
    state.includeSubs = !state.includeSubs;
    showToast(state.includeSubs
      ? 'Menampilkan gabungan sub-pembukuan'
      : 'Menampilkan hanya pembukuan ini');
    loadBookTransactions(state.activeBookId);
  }

  function switchTab(tab) {
    state.activeTab = tab;
    render();
  }

  // ---------- Pembukuan (books) ----------
  function openBookPicker() { state.modal = { mode: 'book-picker' }; render(); }

  function openBookForm(editId, parentId) {
    const book = editId ? bookById(editId) : null;
    state.modal = {
      mode: 'book-form',
      editId: editId || null,
      draft: book
        ? { nama: book.nama, saldoAwal: book.saldoAwal, parentId: book.parentId || '', saldoSumber: 'induk' }
        : { nama: '', saldoAwal: '', parentId: parentId || '', saldoSumber: 'induk' }
    };
    render();
  }

  // Bila database belum menjalankan pembaruan schema (kolom parent_id pada
  // tabel books belum ada / cache schema PostgREST belum menyegarkan),
  // penyimpanan pembukuan gagal dengan pesan "Could not find the
  // 'parent_id' column of 'books' in the schema cache". Tambahkan petunjuk
  // perbaikan agar pengguna tahu harus menjalankan migrasi.
  function schemaCacheHint(e) {
    const msg = String((e && e.message) || (typeof e === 'string' ? e : ''));
    const code = String((e && e.code) || '');
    if (code === 'PGRST204' || /schema cache/i.test(msg) || /could not find the/i.test(msg)) {
      return ' — kolom database belum ada. Jalankan migrasi_sub_pembukuan.sql (atau schema.sql) di Supabase SQL Editor, lalu muat ulang halaman.';
    }
    return '';
  }

  // Pelanggaran RLS (42501) saat menyimpan buku umumnya berarti kondisi
  // klien kedaluwarsa: induk sudah terhapus/pindah akun, atau policy di
  // database belum versi terbaru. Beri petunjuk langkah perbaikannya.
  function rlsHint(e) {
    const msg = String((e && e.message) || (typeof e === 'string' ? e : ''));
    const code = String((e && e.code) || '');
    if (code === '42501' || /row-level security/i.test(msg)) {
      return ' — muat ulang halaman lalu coba lagi. Pastikan induk pembukuan masih ada dan milik akun ini; bila tetap gagal, jalankan ulang migrasi_sub_pembukuan.sql di Supabase SQL Editor.';
    }
    return '';
  }

  // Catat transfer dana induk ↔ sub-pembukuan sebagai transaksi nyata di
  // pembukuan induk (pengeluaran saat dana keluar ke sub, pemasukan saat
  // kembali) supaya selalu ada jejaknya di daftar transaksi induk.
  function buatTransferInduk(parentId, jenis, jumlah, namaSub) {
    const p = bookById(parentId);
    if (!p || !(jumlah > 0)) return Promise.resolve({ error: null });
    const tipe = jenis === 'masuk' ? PEMASUKAN : PENGELUARAN;
    const kategori = state.categories.filter(c => c.isActive && (c.type === tipe || c.type === 'semua'))[0] || null;
    const metode = state.paymentMethods.filter(m => m.isActive)[0] || null;
    const payload = {
      type: tipe,
      date: todayStr(),
      keterangan: (jenis === 'masuk' ? 'Dana kembali dari ' : 'Dana ke ') + namaSub,
      jumlah: jumlah,
      category_id: kategori ? kategori.id : null,
      payment_method_id: metode ? metode.id : null
    };
    return api.createTransaction(payload, parentId).then(res => {
      if (res.error) return { error: res.error };
      if (state.activeBookId === parentId) loadBookTransactions(parentId);
      return { error: null };
    }).catch(e => ({ error: e }));
  }

  function submitBookForm(nama, saldoAwal, editId, parentId, saldoSumber) {
    const errors = {};
    if (!nama || !nama.trim()) errors.nama = 'Nama pembukuan wajib diisi';
    const num = parseAmountInput(saldoAwal);
    if (num === null || num < 0) errors.saldoAwal = 'Masukkan angka yang valid';

    const parent = parentId ? bookById(parentId) : null;
    if (parentId && !parent) errors.parentId = 'Pembukuan induk tidak ditemukan';
    // Sebuah buku tidak boleh dipindah ke dalam dirinya sendiri / sub-nya sendiri
    if (parent && editId && bookWithDescendantIds(editId).indexOf(parent.id) > -1) {
      errors.parentId = 'Pembukuan ini tidak bisa menjadi sub dari dirinya sendiri';
    }
    if (Object.keys(errors).length) return Promise.resolve(errors);

    // Sumber saldo awal sub-pembukuan:
    //   * 'induk' → dana dipindah dari induk; otomatis tercatat sebagai
    //     transaksi di induk (pengeluaran saat mengambil/menambah, pemasukan
    //     saat selisih dikembalikan). Total gabungan TIDAK berubah.
    //   * 'baru'  → dana tambahan baru; induk tidak disentuh dan total
    //     gabungan bertambah sebesar nilai ini.
    const ambilDariInduk = !!(parent && saldoSumber === 'induk');
    const oldBook = editId ? bookById(editId) : null;
    const oldSaldo = oldBook ? Number(oldBook.saldoAwal) || 0 : 0;
    const delta = ambilDariInduk ? num - oldSaldo : 0;
    const newParentId = parent ? parent.id : null;

    const catatTransfer = () => {
      if (!delta || !newParentId) return Promise.resolve({ error: null });
      return buatTransferInduk(newParentId, delta > 0 ? 'keluar' : 'masuk', Math.abs(delta), nama.trim());
    };
    const laporkanGagalTransfer = e => {
      showToast('Peringatan: transfer dana di induk gagal dicatat — '
        + (e && e.message ? e.message : 'terjadi kesalahan')
        + '. Muat ulang halaman agar saldo sinkron kembali.');
    };

    if (editId) {
      return api.updateBook(editId, nama.trim(), num, newParentId).then(res => {
        if (res.error) throw res.error;
        const idx = state.books.findIndex(b => b.id === editId);
        if (idx > -1) {
          state.books[idx] = Object.assign({}, state.books[idx], {
            nama: nama.trim(), saldoAwal: num,
            parentId: newParentId, isSub: !!newParentId
          });
        }
        return catatTransfer().then(r2 => {
          if (r2.error) laporkanGagalTransfer(r2.error);
          state.modal = null;
          render();
          showToast('Pembukuan diperbarui');
          return null;
        });
      }).catch(e => {
        showToast('Gagal menyimpan: ' + (e.message || 'terjadi kesalahan') + schemaCacheHint(e) + rlsHint(e));
        return {};
      });
    }

    return api.createBook(nama.trim(), num, newParentId).then(res => {
      if (res.error) throw res.error;
      const b = mapBook(res.data);
      state.books.push(b);
      switchActiveBook(b.id);
      // Pembukuan induk pertama otomatis menjadi buku default (sub tidak pernah)
      if (!newParentId && rootBooks().length === 1) {
        b.isDefault = true;
        api.setDefaultBook(b.id).catch(err => console.error('Gagal set default buku:', err));
      }
      return catatTransfer().then(r2 => {
        if (r2.error) laporkanGagalTransfer(r2.error);
        state.modal = null;
        render();
        showToast(newParentId ? 'Sub-pembukuan dibuat' : 'Pembukuan dibuat');
        return null;
      });
    }).catch(e => {
      showToast('Gagal membuat pembukuan: ' + (e.message || 'terjadi kesalahan') + schemaCacheHint(e) + rlsHint(e));
      return {};
    });
  }

  // Saldo berjalan gabungan sebuah buku + turunannya: saldo awal
  // masing-masing ditambah net transaksi pada baris yang diberikan.
  function saldoGabunganRows(book, subBooks, rows) {
    let saldo = (Number(book.saldoAwal) || 0)
      + (subBooks || []).reduce((s, b) => s + (Number(b.saldoAwal) || 0), 0);
    (rows || []).forEach(r => {
      saldo += (r.type === PEMASUKAN ? 1 : -1) * (Number(r.jumlah) || 0);
    });
    return saldo;
  }

  // Notifikasi konfirmasi hapus pembukuan.
  //   * Pembukuan induk → menegaskan bahwa SELURUH transaksi (termasuk
  //     sub-pembukuan di dalamnya) akan terhapus.
  //   * Sub-pembukuan   → "Anda yakin ingin menghapusnya?"
  // Jumlah transaksi diambil lebih dulu agar angka pada notifikasi akurat.
  function openDeleteBookConfirm(id) {
    const book = bookById(id);
    if (!book) return;
    const subBooks = descendantIds(id).map(x => bookById(x)).filter(Boolean);
    const allIds = bookWithDescendantIds(id);

    const build = (count, rows) => {
      const jml = (typeof count === 'number' && isFinite(count)) ? count : null;
      const isSub = !!book.parentId;
      let message;
      if (isSub) {
        const saldo = saldoGabunganRows(book, subBooks, rows);
        const txPart = jml === null
          ? 'Seluruh transaksi di dalamnya juga akan terhapus'
          : (jml > 0 ? 'Seluruh ' + jml + ' transaksi di dalamnya juga akan terhapus' : 'Tidak ada transaksi di dalamnya');
        message = 'Anda yakin ingin menghapus sub-pembukuan "' + book.nama + '"? '
          + txPart
          + (saldo > 0 ? ' Saldo ' + formatRupiah(saldo) + ' akan dikembalikan ke pembukuan induk "' + bookName(book.parentId) + '".' : '')
          + ' Tindakan ini tidak dapat dibatalkan.';
      } else if (subBooks.length) {
        message = 'Menghapus pembukuan induk "' + book.nama + '" akan menghapus SELURUH transaksi '
          + 'yang tercatat di dalamnya \u2014 termasuk ' + subBooks.length + ' sub-pembukuan ('
          + subBooks.map(s => s.nama).join(', ') + ') beserta seluruh transaksinya'
          + (jml === null ? '' : ' (total ' + jml + ' transaksi)')
          + '. Lampiran nota yang menempel pada transaksi juga ikut terhapus. Tindakan ini tidak dapat dibatalkan.';
      } else {
        message = 'Menghapus pembukuan "' + book.nama + '" akan menghapus seluruh transaksi di dalamnya'
          + (jml === null ? '' : ' (' + jml + ' transaksi)')
          + ' beserta lampiran notanya. Tindakan ini tidak dapat dibatalkan.';
      }
      state.confirmBox = {
        tone: 'warn',
        title: isSub ? 'Hapus Sub-Pembukuan?' : (subBooks.length ? 'Hapus Pembukuan Induk?' : 'Hapus Pembukuan?'),
        message: message,
        confirmLabel: isSub ? 'Ya, Hapus' : (subBooks.length ? 'Hapus Semua' : 'Hapus'),
        action: 'delete-book',
        id: id
      };
      render();
    };

    Promise.all([
      api.countTransactions(allIds),
      api.getTransactions(allIds)
    ]).then(([cnt, txRes]) => {
      build(
        cnt && !cnt.error ? cnt.count : null,
        txRes && !txRes.error ? (txRes.data || []) : null
      );
    }).catch(() => build(null, null));
  }

  function deleteBook(id) {
    const deleted = bookById(id);
    if (!deleted) return;
    // Seluruh sub-pembukuan di dalam buku ini ikut terhapus lewat cascade di database
    const allIds = bookWithDescendantIds(id);
    const fallbackDefault = rootBooks().filter(b => allIds.indexOf(b.id) === -1)[0] || null;

    // Menghapus sub-pembukuan (beserta seluruh sub turunannya) → saldonya
    // dikembalikan ke pembukuan induk sebagai transaksi pemasukan, sehingga
    // total gabungan kembali ke nilai sebelum transfer dan jejaknya tersisa.
    const kembalikanSaldoKeInduk = () => {
      if (!deleted.parentId) return Promise.resolve({ error: null });
      return api.getTransactions(allIds).then(res => {
        if (res.error) return { error: res.error };
        const subBooks = allIds.filter(x => x !== deleted.id).map(x => bookById(x)).filter(Boolean);
        const saldo = saldoGabunganRows(deleted, subBooks, res.data || []);
        if (saldo <= 0) return { error: null };
        return buatTransferInduk(deleted.parentId, 'masuk', saldo, deleted.nama);
      }).catch(e => ({ error: e }));
    };

    kembalikanSaldoKeInduk().then(r => {
      if (r.error) {
        showToast('Peringatan: pengembalian saldo ke induk gagal dicatat — '
          + (r.error.message || 'terjadi kesalahan') + '. Muat ulang halaman lalu periksa saldo induk.');
      }
      return api.deleteBook(id).then(res => {
        if (res.error) throw res.error;
        // Lampiran nota milik buku ini & seluruh sub-pembukuan ikut dibersihkan (best-effort)
        allIds.forEach(x => purgeBookNota(x));
        state.books = state.books.filter(b => allIds.indexOf(b.id) === -1);
        // Kalau buku default dihapus, pindahkan status default ke pembukuan induk tersisa
        if (deleted.isDefault && fallbackDefault) {
          fallbackDefault.isDefault = true;
          api.setDefaultBook(fallbackDefault.id).catch(err => console.error('Gagal pindahkan default:', err));
        }
        if (allIds.indexOf(state.activeBookId) > -1) {
          const next = fallbackDefault || state.books[0] || null;
          if (next) {
            state.activeBookId = next.id;
            state.includeSubs = childrenOf(next.id).length > 0;
            loadBookTransactions(next.id);
          } else {
            state.activeBookId = null;
            state.transactions = [];
            state.txReady = true;
            render();
          }
        } else {
          if (state.activeBookId) loadBookTransactions(state.activeBookId);
          else render();
        }
        showToast(deleted.parentId ? 'Sub-pembukuan dihapus' : 'Pembukuan & seluruh isinya dihapus');
      });
    }).catch(e => {
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
      : { date: todayStr(), keterangan: '', jumlah: '', categoryId: '', paymentMethodId: '', bookId: state.activeBookId };
    if (!draft.bookId) draft.bookId = state.activeBookId;
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

  function submitEntry({ type, date, keterangan, jumlah, categoryId, paymentMethodId, bookId, editId }) {
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
      payment_method_id: paymentMethodId || null,
      // Transaksi bisa disimpan ke pembukuan induk atau salah satu sub-pembukuan
      book_id: (bookId && bookById(bookId)) ? bookId : state.activeBookId
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
        : api.createTransaction(payload, payload.book_id);

      let saved = false;
      let reloadList = false;
      return op.then(res => {
        if (res.error) throw res.error;
        saved = true;

        if (editId) {
          const idx = state.transactions.findIndex(t => t.id === editId);
          const prevBookId = idx > -1 ? state.transactions[idx].bookId : null;
          if (idx > -1 && prevBookId === payload.book_id) {
            state.transactions[idx] = Object.assign({}, state.transactions[idx], txPatchFromPayload(payload), { bookNama: bookName(payload.book_id) });
          } else {
            // Transaksi pindah pembukuan (atau tidak ada di daftar) → muat ulang daftar
            reloadList = true;
          }
        } else {
          const tx = mapTransaction(res.data);
          tx.bookNama = bookName(tx.bookId);
          if (viewBookIds().indexOf(tx.bookId) > -1) state.transactions.push(tx);
          else reloadList = true;
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
        if (reloadList && state.activeBookId) loadBookTransactions(state.activeBookId);
        else render();
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
      ['Pembukuan', escapeHtml(bookLabel(tx.bookId) || '—')],
      ['Kategori', escapeHtml(categoryName(tx.categoryId) || '—')],
      ['Metode Pembayaran', escapeHtml(paymentName(tx.paymentMethodId) || '—')],
      ['Lampiran', renderTxNota(tx)]
    ].map(r => '<div class="dg-row"><div class="dg-label">' + r[0] + '</div><div class="dg-value">' + r[1] + '</div></div>').join('');

    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>Detail Catatan</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
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
    api.getAdminData().then(([profilesRes, booksRes, txRes]) => {
      if (profilesRes.error) throw profilesRes.error;
      if (booksRes.error) throw booksRes.error;
      if (txRes.error) throw txRes.error;

      state.adminTransactions = (txRes.data || []).map(r => ({
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

      state.adminBooks = (booksRes.data || []).map(b => {
        const rows = txByBook[b.id] || [];
        let pemasukan = 0, pengeluaran = 0, lastDate = null;
        rows.forEach(r => {
          if (r.type === PEMASUKAN) pemasukan += r.jumlah;
          else pengeluaran += r.jumlah;
          if (!lastDate || r.date > lastDate) lastDate = r.date;
        });
        return {
          id: b.id, userId: b.user_id, nama: b.nama,
          parentId: b.parent_id || null,
          isSub: !!b.parent_id,
          saldoAwal: Number(b.saldo_awal),
          pemasukan: pemasukan,
          pengeluaran: pengeluaran,
          saldoAkhir: Number(b.saldo_awal) + pemasukan - pengeluaran,
          jumlahTransaksi: rows.length,
          lastDate: lastDate,
          createdAt: b.created_at
        };
      });

      state.adminUsers = (profilesRes.data || []).map(p => {
        const books = state.adminBooks.filter(b => b.userId === p.id);
        let totalPemasukan = 0, totalPengeluaran = 0, totalTx = 0, totalSaldoAkhir = 0, lastDate = null;
        books.forEach(b => {
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
    api.getTransactions(bookId).then(res => {
      if (res.error) throw res.error;
      if (state.modal && state.modal.mode === 'book-detail' && state.modal.book.id === bookId) {
        state.modal.rows = (res.data || []).map(mapTransaction);
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

  // Baris transaksi untuk konteks ekspor tertentu:
  //   * tanpa bookId  → buku yang sedang tampil (atau detail buku di area admin)
  //   * dengan bookId → sub-pembukuan tertentu (dipakai tombol ekspor pada ringkasan sub)
  function reportRowsFor(bookId) {
    if (!bookId) {
      if (state.modal && state.modal.mode === 'book-detail') {
        return filterByPeriod(state.modal.rows || [], state.adminFilter);
      }
      return filterByPeriod(state.transactions, state.filter);
    }
    const ids = (bookId === state.activeBookId)
      ? viewBookIds()
      : bookWithDescendantIds(bookId);
    return filterByPeriod(state.transactions.filter(x => ids.indexOf(x.bookId) > -1), state.filter);
  }

  // Jumlah catatan pada laporan yang sedang tampil. Dihitung langsung dari state
  // (tanpa menyusun objek laporan) karena dipanggil pada setiap render.
  function pngRowCount(bookId) {
    return reportRowsFor(bookId).length;
  }

  function pngAllowed(bookId) {
    return pngRowCount(bookId) <= PNG_SAFE_MAX_ROWS;
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
  function openPngBlockedInfo(mode, bookId) {
    const rows = pngRowCount(bookId);
    state.infoBox = {
      tone: 'warn',
      title: 'Format Gambar Tidak Tersedia',
      message: 'Laporan ini berisi ' + rows + ' catatan, melebihi batas ' + PNG_SAFE_MAX_ROWS
        + ' catatan untuk ekspor gambar (PNG). Batas ini menjaga hasil gambar tetap tajam dan tidak terpotong saat dibuka di perangkat lain. '
        + 'Gunakan PDF — teks PDF tetap tajam berapa pun jumlah catatannya. '
        + 'Tips: persempit filter periode (misalnya per bulan) sampai jumlah catatan ≤ ' + PNG_SAFE_MAX_ROWS
        + ', lalu format gambar akan tersedia kembali.',
      pdfAction: true,
      mode: mode || 'unduh',
      bookId: bookId || ''
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

  // Tabel ringkasan per sub-pembukuan pada laporan gabungan (versi PDF)
  function pdfGroupSummary(doc, ctx, startY) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Ringkasan Sub-Pembukuan', PDF_LM, startY);
    const body = ctx.subTotals.map(s => [
      s.nama,
      { content: String(s.jumlah), styles: { halign: 'right' } },
      { content: formatRupiah(s.masuk), styles: { halign: 'right' } },
      { content: formatRupiah(s.keluar), styles: { halign: 'right' } },
      { content: formatRupiah(s.saldoAkhir), styles: { halign: 'right' } }
    ]);
    body.push([
      { content: 'Total (buku induk + sub)', styles: { fontStyle: 'bold' } },
      { content: String(ctx.masukList.length + ctx.keluarList.length), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatRupiah(ctx.periodMasuk), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatRupiah(ctx.periodKeluar), styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatRupiah(ctx.saldoAkhir), styles: { fontStyle: 'bold', halign: 'right' } }
    ]);
    doc.autoTable({
      startY: startY + 3,
      head: [[
        { content: 'Sub-Pembukuan' },
        { content: 'Catatan', styles: { halign: 'right' } },
        { content: 'Pemasukan', styles: { halign: 'right' } },
        { content: 'Pengeluaran', styles: { halign: 'right' } },
        { content: 'Saldo Akhir', styles: { halign: 'right' } }
      ]],
      body: body,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [69, 90, 78], textColor: 255 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      },
      margin: { left: PDF_LM, right: PDF_RM }
    });
    return doc.lastAutoTable.finalY;
  }

  function exportPDF() {
    runReport('pdf', 'download');
  }

  // ---- Data laporan bersama untuk PDF & gambar ----
  // bookId (opsional) dipakai tombol ekspor pada ringkasan sub-pembukuan,
  // sehingga laporan sebuah sub bisa dibuat tanpa harus berpindah buku dulu.
  // Tanpa bookId: laporan memakai buku yang sedang tampil (mode aktif).
  function buildReportContext(bookId) {
    if (!bookId && state.modal && state.modal.mode === 'book-detail') {
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

    const book = bookId ? bookById(bookId) : activeBook();
    if (!book) { showToast('Belum ada pembukuan untuk diekspor'); return null; }

    const subs = descendantIds(book.id).map(x => bookById(x)).filter(Boolean);
    const isGrouped = state.includeSubs && subs.length > 0;
    const periodTx = reportRowsFor(bookId || null);
    const masukList = periodTx.filter(x => x.type === PEMASUKAN).sort((a, c) => a.date.localeCompare(c.date));
    const keluarList = periodTx.filter(x => x.type === PENGELUARAN).sort((a, c) => a.date.localeCompare(c.date));
    const periodMasuk = masukList.reduce((s, x) => s + x.jumlah, 0);
    const periodKeluar = keluarList.reduce((s, x) => s + x.jumlah, 0);

    let saldoAwal = Number(book.saldoAwal);
    if (isGrouped) subs.forEach(s => { saldoAwal += Number(s.saldoAwal); });

    return {
      scope: 'user',
      isGrouped: isGrouped,
      nama: book.nama,
      owner: '',
      relation: book.parentId ? bookLabel(book.parentId) : '',
      subCount: isGrouped ? subs.length : 0,
      subTotals: isGrouped ? buildSubTotals(book, periodTx) : [],
      isFiltered: state.filter.type !== 'all',
      periodeLabel: periodLabel(state.filter.type, state.filter.value),
      saldoAwal: saldoAwal, saldoAkhir: saldoAwal + periodMasuk - periodKeluar,
      masukList: decorateReportRows(masukList), keluarList: decorateReportRows(keluarList),
      periodMasuk: periodMasuk,
      periodKeluar: periodKeluar
    };
  }

  // Rincian per sub-pembukuan untuk ringkasan laporan gabungan
  function buildSubTotals(book, periodTx) {
    return childrenOf(book.id).map(sub => {
      const ids = bookWithDescendantIds(sub.id);
      const rows = periodTx.filter(x => ids.indexOf(x.bookId) > -1);
      const masuk = rows.filter(x => x.type === PEMASUKAN).reduce((s, x) => s + x.jumlah, 0);
      const keluar = rows.filter(x => x.type === PENGELUARAN).reduce((s, x) => s + x.jumlah, 0);
      const saldoAwal = ids.reduce((s, id) => {
        const b = bookById(id);
        return s + (b ? Number(b.saldoAwal) : 0);
      }, 0);
      return {
        nama: sub.nama, jumlah: rows.length,
        masuk: masuk, keluar: keluar,
        saldoAwal: saldoAwal, saldoAkhir: saldoAwal + masuk - keluar
      };
    });
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
    const groupTag = ctx.isGrouped ? '-gabungan' : '';
    return prefix + '-' + slugify(ctx.nama) + (ctx.relation ? '-sub' : '') + groupTag + suffix + '-' + todayStr();
  }
  function buildPdfDoc(ctx) {
    if (!pdfReady()) return null;
    const doc = new window.jspdf.jsPDF();
    const isFiltered = ctx.isFiltered;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(31, 43, 36);
    doc.text(ctx.scope === 'admin' ? 'Laporan Pembukuan (Admin)' : 'Laporan Pembukuan', PDF_LM, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60, 70, 64);
    doc.text(ctx.nama + (ctx.owner ? ' — ' + ctx.owner : '') + (ctx.isGrouped ? ' (gabungan ' + ctx.subCount + ' sub-pembukuan)' : ''), PDF_LM, 25);
    doc.setFontSize(9.5); doc.setTextColor(90, 100, 90);
    doc.text('Dicetak pada ' + new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), PDF_LM, 31);
    if (ctx.relation) {
      doc.text('Sub-pembukuan dari ' + ctx.relation, PDF_LM, 36);
    }

    let y = ctx.relation ? 41 : 36;
    if (isFiltered) {
      doc.text('Periode: ' + ctx.periodeLabel, PDF_LM, y);
      y += 5;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(31, 43, 36);
    doc.text(isFiltered ? 'Saldo Awal (Keseluruhan)' : 'Saldo Awal', PDF_LM, y);
    doc.text(formatRupiah(ctx.saldoAwal), PDF_RIGHT, y, { align: 'right' });
    y += 9;

    if (ctx.isGrouped && ctx.subTotals && ctx.subTotals.length) {
      y = pdfGroupSummary(doc, ctx, y) + 8;
    }

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

  async function runReport(fmt, mode, bookId) {
    const ctx = buildReportContext(bookId || null);
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


  function exportAdminBookPDF() {
    runReport('pdf', 'download');
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

    // Ringkasan per sub-pembukuan (hanya pada laporan gabungan)
    let groupBlock = '';
    if (ctx.isGrouped && ctx.subTotals && ctx.subTotals.length) {
      groupBlock = '<h3 class="rs-sec group">Ringkasan Sub-Pembukuan</h3>'
        + '<table class="rs-table"><thead><tr><th>Sub-Pembukuan</th><th class="num">Catatan</th><th class="num">Pemasukan</th><th class="num">Pengeluaran</th><th class="num">Saldo Akhir</th></tr></thead><tbody>'
        + ctx.subTotals.map(s => '<tr><td>' + escapeHtml(s.nama) + '</td><td class="num">' + s.jumlah + '</td><td class="num">'
            + formatRupiah(s.masuk) + '</td><td class="num">' + formatRupiah(s.keluar) + '</td><td class="num">' + formatRupiah(s.saldoAkhir) + '</td></tr>').join('')
        + '<tr class="rs-sub"><td colspan="4">Total (buku induk + sub)</td><td class="num">' + formatRupiah(ctx.saldoAkhir) + '</td></tr>'
        + '</tbody></table>';
    }

    return '<div class="report-sheet">'
      + '<div class="rs-brand">BUKU KAS</div>'
      + '<div class="rs-title">Laporan Pembukuan' + (ctx.scope === 'admin' ? ' (Admin)' : '') + (ctx.isGrouped ? ' — Gabungan' : '') + '</div>'
      + '<div class="rs-sub">' + escapeHtml(ctx.nama) + (ctx.owner ? ' — ' + escapeHtml(ctx.owner) : '') + '</div>'
      + '<div class="rs-meta">' + metaParts.join(' · ') + '</div>'
      + summary
      + groupBlock
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
    let saldoAwal = book ? Number(book.saldoAwal) : 0;
    // Mode gabungan: saldo awal sub-pembukuan ikut dihitung
    if (book && state.includeSubs) {
      descendantIds(book.id).forEach(id => {
        const sub = bookById(id);
        if (sub) saldoAwal += Number(sub.saldoAwal);
      });
    }
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
    const value = filterState.value;
    let valueInput = '';
    if (type === 'day') {
      valueInput = '<input type="date" class="filter-value" data-action="filter-value" data-scope="' + scope + '" value="' + value + '">';
    } else if (type === 'week') {
      valueInput = '<input type="week" class="filter-value" data-action="filter-value" data-scope="' + scope + '" value="' + value + '">';
    } else if (type === 'month') {
      valueInput = '<input type="month" class="filter-value" data-action="filter-value" data-scope="' + scope + '" value="' + value + '">';
    } else if (type === 'year') {
      const curYear = new Date().getFullYear();
      const opts = [];
      for (let y = curYear; y >= curYear - 6; y--) {
        opts.push('<option value="' + y + '"' + (String(y) === value ? ' selected' : '') + '>' + y + '</option>');
      }
      valueInput = '<select class="filter-value" data-action="filter-value" data-scope="' + scope + '">' + opts.join('') + '</select>';
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
      + (value ? '<button class="search-clear" data-action="search-clear" data-scope="' + scope + '">' + ICONS.close + '</button>' : '')
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
      item.date,
      formatDateLong(item.date)
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  }

  function tagHtml(item) {
    const parts = [];
    // Pada mode gabungan, tandai transaksi yang bukan milik buku yang sedang dibuka
    if (state.includeSubs && item.bookId && item.bookId !== state.activeBookId && item.bookNama) {
      parts.push('<span class="tag tag-sub" title="Sub-pembukuan">' + escapeHtml(item.bookNama) + '</span>');
    }
    const cat = categoryName(item.categoryId);
    const pay = paymentName(item.paymentMethodId);
    if (cat) parts.push('<span class="tag tag-cat">' + escapeHtml(cat) + '</span>');
    if (pay) parts.push('<span class="tag tag-pay">' + escapeHtml(pay) + '</span>');
    if (item.notaPath) parts.push('<span class="tag tag-nota" title="Ada lampiran nota">' + ICONS.paperclip + '</span>');
    return parts;
  }

  function renderTransactionRow(item, showActions) {
    const dt = formatDateShort(item.date);
    const tags = tagHtml(item);
    const sub = formatDateLong(item.date) + (tags.length ? ' <span style="color:var(--color-line);">·</span> ' + tags.join(' ') : '');
    const actions = showActions
      ? '<div class="row-actions">'
        + '<button class="icon-btn" data-action="edit" data-id="' + item.id + '" data-type="' + item.type + '">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="delete" data-id="' + item.id + '">' + ICONS.trash + '</button>'
        + '</div>'
      : '';
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
  function render() {
    destroyChart(); // bersihkan grafik lama sebelum DOM diganti
    if (!CONFIG_OK) { appEl.innerHTML = renderConfigScreen(); return; }
    if (!state.dataReady) { appEl.innerHTML = '<div class="loading-wrap">Memuat…</div>'; return; }
    if (!state.session) { appEl.innerHTML = renderAuthScreen(); bindForms(); return; }

    let html = renderUserBar();

    if (state.isAdmin) html += renderViewToggle();

    if (state.isAdmin && state.view === 'admin') {
      html += renderAdminView();
      if (hasOverlay()) html += renderModal();
      appEl.innerHTML = html;
      bindForms();
      mountCharts();
      return;
    }

    if (state.isAdmin && state.view === 'master') {
      html += renderAdminMaster();
      if (hasOverlay()) html += renderModal();
      appEl.innerHTML = html;
      bindForms();
      return;
    }

    // Buku Saya
    if (state.books.length === 0) {
      html += renderNoBooksScreen();
      if (hasOverlay()) html += renderModal();
      appEl.innerHTML = html;
      bindForms();
      return;
    }

    html += renderBookView();
    if (hasOverlay()) html += renderModal();
    appEl.innerHTML = html;
    bindForms();
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

    const subs = book ? childrenOf(book.id) : [];
    const grouped = state.includeSubs && subs.length > 0;

    let html = '<div class="app-header">'
      + '<div class="app-title">'
      + '<button class="book-switcher" data-action="book-picker">'
      + '<span class="book-switcher-brand">BUKU KAS</span>'
      + '<span class="book-switcher-nama"><span class="txt">' + escapeHtml(book ? book.nama : '') + '</span>'
      + (grouped ? '<span class="badge-group">gabungan</span>' : '')
      + ICONS.chevronDown + '</span>'
      + '</button>'
      + '</div>'
      + renderExportMenu()
      + '</div>';

    if (!state.txReady) {
      return html + '<div class="loading-wrap" style="min-height:30vh;">Memuat transaksi…</div>';
    }

    html += '<div class="hero">'
      + '<div class="hero-seal">SALDO<br>TERCATAT</div>'
      + '<div class="hero-label">Saldo Akhir' + (grouped ? ' (Gabungan)' : '') + '</div>'
      + '<div class="hero-amount mono">' + formatRupiah(t.saldoAkhir) + '</div>'
      + '<div class="hero-updated">Diperbarui ' + formatDateLong(todayStr()) + '</div>'
      + '</div>';

    html += '<div class="stats-row">'
      + '<div class="stat-chip saldo"><div class="lbl">Saldo Awal' + (grouped ? ' (gabungan)' : '')
        + ' <button class="edit-saldo-btn" data-action="book-edit" data-id="' + (book ? book.id : '') + '">' + ICONS.edit + '</button></div>'
        + '<div class="val">' + formatRupiah(t.saldoAwal) + '</div></div>'
      + '<div class="stat-chip masuk"><div class="lbl">Pemasukan</div><div class="val">' + formatRupiah(t.pemasukan) + '</div></div>'
      + '<div class="stat-chip keluar"><div class="lbl">Pengeluaran</div><div class="val">' + formatRupiah(t.pengeluaran) + '</div></div>'
      + '</div>';

    html += renderGroupPanel(book, subs, grouped);

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


  // Kartu ringkasan sub-pembukuan + saklar mode gabungan.
  // Ringkasan angka hanya ditampilkan saat gabungan aktif, karena pada mode
  // "buku ini saja" transaksi sub memang tidak dimuat dari database.
  function renderGroupPanel(book, subs, grouped) {
    if (!book || !subs.length) return '';

    let html = '<div class="group-card">'
      + '<div class="group-card-head">'
      + '<div>'
      + '<h3>' + ICONS.layers + ' ' + subs.length + ' Sub-Pembukuan</h3>'
      + '<p>' + (grouped
          ? 'Angka di atas sudah mencakup seluruh sub-pembukuan.'
          : 'Angka di atas hanya pembukuan ini. Aktifkan gabungan untuk melihat seluruh sub.') + '</p>'
      + '</div>'
      + '<button class="btn-mini' + (grouped ? '' : ' primary') + '" data-action="toggle-subs">'
      + (grouped ? 'Buku ini saja' : 'Gabungkan') + '</button>'
      + '</div>';

    if (grouped) {
      const ownRows = state.transactions.filter(x => x.bookId === book.id);
      const ownMasuk = ownRows.filter(x => x.type === PEMASUKAN).reduce((s, x) => s + x.jumlah, 0);
      const ownKeluar = ownRows.filter(x => x.type === PENGELUARAN).reduce((s, x) => s + x.jumlah, 0);
      html += '<div class="group-list">'
        + '<div class="group-row own">'
        + '<div class="group-row-main">'
        + '<span class="group-row-nama">Transaksi langsung pada ' + escapeHtml(book.nama) + '</span>'
        + '<span class="group-row-sub">' + ownRows.length + ' transaksi &middot; saldo awal ' + formatRupiah(book.saldoAwal) + '</span>'
        + '</div>'
        + '<span class="group-row-amount mono">' + formatRupiah(Number(book.saldoAwal) + ownMasuk - ownKeluar) + '</span>'
        + '</div>'
        + subs.map(renderGroupSubRow).join('')
        + '</div>';
    }

    return html + '</div>';
  }

  // Satu baris ringkasan sub-pembukuan: nama, jumlah transaksi, saldo akhir sub,
  // dan tombol ekspor laporan khusus sub tersebut.
  function renderGroupSubRow(b) {
    const ids = bookWithDescendantIds(b.id);
    const rows = state.transactions.filter(x => ids.indexOf(x.bookId) > -1);
    const masuk = rows.filter(x => x.type === PEMASUKAN).reduce((s, x) => s + x.jumlah, 0);
    const keluar = rows.filter(x => x.type === PENGELUARAN).reduce((s, x) => s + x.jumlah, 0);
    const nested = ids.length - 1;
    return '<div class="group-row">'
      + '<button class="group-row-main" data-action="switch-book" data-id="' + b.id + '">'
      + '<span class="group-row-nama">' + escapeHtml(b.nama)
        + (nested ? ' <span class="badge-group">+' + nested + ' sub</span>' : '') + '</span>'
      + '<span class="group-row-sub">' + rows.length + ' transaksi &middot; saldo awal ' + formatRupiah(b.saldoAwal) + '</span>'
      + '</button>'
      + '<span class="group-row-amount mono">' + formatRupiah(Number(b.saldoAwal) + masuk - keluar) + '</span>'
      + '<button class="icon-btn" data-action="export-sub" data-id="' + b.id + '" title="Ekspor laporan sub ini" aria-label="Ekspor laporan sub ini">' + ICONS.download + '</button>'
      + '</div>';
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
    const subTotal = books.filter(b => b.parentId).length;
    const rootTotal = books.length - subTotal;

    let html = '<button class="btn-back" data-action="admin-back">' + ICONS.arrowLeft + ' Kembali ke daftar pengguna</button>';
    html += '<div class="admin-user-heading"><h2>' + escapeHtml(user ? user.email : '') + '</h2><p>'
      + books.length + ' pembukuan'
      + (subTotal ? ' (' + rootTotal + ' utama &middot; ' + subTotal + ' sub)' : '')
      + '</p></div>';
    html += renderSearchBar('admin-user', state.adminUserSearch, 'Cari pembukuan…');
    html += renderFilterBar('admin', state.adminFilter);

    const ubRange = periodRange(state.adminFilter.type, state.adminFilter.value);

    if (books.length === 0) {
      html += '<div class="empty-state">' + ICONS.book + '<p>Pengguna ini belum membuat pembukuan.</p></div>';
      return html;
    }

    html += '<div class="admin-list">' + treeOrder(books).map(row => {
      const b = row.book;
      const subCount = books.filter(x => x.parentId === b.id).length;
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
      return '<button class="admin-row' + (row.depth ? ' sub' : '') + '" data-action="book-detail" data-id="' + b.id + '"'
        + (row.depth ? ' style="margin-left:' + (row.depth * 14) + 'px;"' : '') + '>'
        + '<div class="admin-row-main">'
        + '<div class="admin-row-email">'
        + (row.depth ? '<span class="sub-mark">' + ICONS.cornerDownRight + '</span>' : '')
        + escapeHtml(b.nama)
        + (subCount ? ' <span class="badge-group">' + subCount + ' sub</span>' : '')
        + '</div>'
        + '<div class="admin-row-sub">' + subLabel + (subCount ? ' &middot; termasuk ' + subCount + ' sub-pembukuan' : '') + '</div>'
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
        + '<button class="icon-btn" data-action="category-edit" data-id="' + c.id + '">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="category-delete" data-id="' + c.id + '">' + ICONS.trash + '</button>'
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
        + '<button class="icon-btn" data-action="payment-edit" data-id="' + p.id + '">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="payment-delete" data-id="' + p.id + '">' + ICONS.trash + '</button>'
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
    return !!(state.modal || state.notaViewer || state.infoBox || state.confirmBox);
  }

  function renderModal() {
    const m = state.modal;
    // Penampil lampiran, kotak pemberitahuan, & konfirmasi digambar sebagai lapisan
    // tambahan sehingga modal yang sedang terbuka (mis. detail catatan) tidak ikut tertutup.
    const overlays = (state.notaViewer ? renderNotaViewerModal() : '')
      + (state.infoBox ? renderInfoBox() : '')
      + (state.confirmBox ? renderConfirmBox() : '');
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
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>' + escapeHtml(v.name || 'Lampiran') + '</h2><button class="modal-close" data-action="nota-viewer-close">' + ICONS.close + '</button></div>'
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
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>' + escapeHtml(b.title || 'Informasi') + '</h2><button class="modal-close" data-action="info-close">' + ICONS.close + '</button></div>'
      + '<div class="info-box' + (b.tone === 'warn' ? ' warn' : '') + '">'
      + (b.tone === 'warn' ? ICONS.alert : ICONS.file)
      + '<p>' + escapeHtml(b.message || '') + '</p>'
      + '</div>'
      + '<div class="modal-actions">'
      + '<button type="button" class="btn-secondary" data-action="info-close">Mengerti</button>'
      + (b.pdfAction
          ? '<button type="button" class="btn-primary" data-action="export-action" data-fmt="pdf" data-mode="' + escapeHtml(b.mode || 'unduh') + '"'
            + (b.bookId ? ' data-id="' + escapeHtml(b.bookId) + '"' : '') + '>' + ICONS.file + ' Pakai PDF</button>'
          : '')
      + '</div></div></div>';
  }

  // Kotak konfirmasi tindakan destruktif (mis. hapus pembukuan induk beserta
  // seluruh transaksi & sub-pembukuan di dalamnya). Aksi yang dijalankan
  // disimpan sebagai nama aksi + id agar tetap sejalan dengan pola ACTIONS.
  function renderConfirmBox() {
    const c = state.confirmBox;
    if (!c) return '';
    return '<div class="modal-overlay open overlay-top" data-action="confirm-overlay">'
      + '<div class="modal" data-stop style="max-width:440px;">'
      + '<div class="modal-head"><h2>' + escapeHtml(c.title || 'Konfirmasi') + '</h2>'
      + '<button class="modal-close" data-action="confirm-cancel">' + ICONS.close + '</button></div>'
      + '<div class="confirm-box' + (c.tone === 'warn' ? ' warn' : '') + '">'
      + (c.tone === 'warn' ? ICONS.alert : ICONS.book)
      + '<p>' + escapeHtml(c.message || '') + '</p>'
      + '</div>'
      + '<div class="modal-actions">'
      + '<button type="button" class="btn-secondary" data-action="confirm-cancel">Batal</button>'
      + '<button type="button" class="btn-primary danger" data-action="confirm-ok">'
      + ICONS.trash + ' ' + escapeHtml(c.confirmLabel || 'Lanjutkan') + '</button>'
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

    // Pemilihan pembukuan: hanya muncul bila buku aktif punya sub-pembukuan
    // (perlu memilih tujuan) — termasuk saat mengubah transaksi milik sub.
    const ownerIds = state.activeBookId ? bookWithDescendantIds(state.activeBookId) : [];
    const currentOwnerId = m.draft.bookId || state.activeBookId;
    if (currentOwnerId && ownerIds.indexOf(currentOwnerId) === -1) ownerIds.push(currentOwnerId);
    const bookField = ownerIds.length > 1
      ? '<div class="field"><label>Pembukuan Tujuan</label><select name="book_id">'
        + ownerIds.map(id => {
            const b = bookById(id);
            return '<option value="' + id + '"' + (id === currentOwnerId ? ' selected' : '') + '>' + escapeHtml(b ? bookOptionLabel(b) : '') + '</option>';
          }).join('')
        + '</select><div class="field-hint">Pilih sub-pembukuan bila transaksi ini milik cabang/unit tertentu.</div></div>'
      : '';

    // Lampiran nota hanya untuk pengeluaran
    const notaField = m.type === PENGELUARAN ? renderNotaField(m) : '';

    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah ' : 'Catat ') + typeLabel + '</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
      + '<form id="entry-form">'
      + bookField
      + '<div class="field"><label>Tanggal</label><input type="date" name="date" value="' + m.draft.date + '"><div class="field-error" data-err="date"></div></div>'
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
    const rows = treeOrder(sorted).map(row => {
      const b = row.book;
      const active = b.id === state.activeBookId;
      const subCount = childrenOf(b.id).length;
      return '<div class="book-row' + (active ? ' active' : '') + (row.depth ? ' sub' : '') + '"'
        + (row.depth ? ' style="margin-left:' + (row.depth * 14) + 'px;"' : '') + '>'
        + '<button class="book-row-main" data-action="switch-book" data-id="' + b.id + '">'
        + '<span class="book-row-nama">'
          + (row.depth ? '<span class="sub-mark">' + ICONS.cornerDownRight + '</span>' : '')
          + escapeHtml(b.nama)
          + (subCount ? ' <span class="badge-group">' + subCount + ' sub</span>' : '')
          + (b.isDefault ? ' <span class="badge-default">default</span>' : '')
          + (active ? ' <span class="badge-active">aktif</span>' : '') + '</span>'
        + '<span class="book-row-sub mono">' + formatRupiah(b.saldoAwal) + ' saldo awal'
          + (subCount ? ' &middot; ' + subCount + ' sub-pembukuan' : '') + '</span>'
        + '</button>'
        + '<button class="icon-btn" data-action="book-new-sub" data-id="' + b.id + '" title="Tambah sub-pembukuan" aria-label="Tambah sub-pembukuan">' + ICONS.plus + '</button>'
        // Bintang default hanya bermakna untuk pembukuan induk
        + (b.parentId ? '' : '<button class="icon-btn star' + (b.isDefault ? ' on' : '') + '" data-action="set-default-book" data-id="' + b.id + '" title="' + (b.isDefault ? 'Buku default' : 'Jadikan default') + '" aria-label="' + (b.isDefault ? 'Buku default' : 'Jadikan default') + '">' + (b.isDefault ? ICONS.starFilled : ICONS.star) + '</button>')
        + '<button class="icon-btn" data-action="book-edit" data-id="' + b.id + '" title="Ubah" aria-label="Ubah">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="book-delete" data-id="' + b.id + '" title="Hapus" aria-label="Hapus">' + ICONS.trash + '</button>'
        + '</div>';
    }).join('');
    const rootCount = rootBooks().length;
    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>Pilih Pembukuan</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
      + '<p class="modal-hint">' + rootCount + ' pembukuan utama &middot; ' + (state.books.length - rootCount) + ' sub-pembukuan. Tombol <b>+</b> menambah sub di bawah pembukuan tersebut.</p>'
      + '<div class="book-picker-list">' + (rows || '<p class="empty-hint">Belum ada pembukuan.</p>') + '</div>'
      + '<button class="btn-pill btn-pill-block" data-action="book-new">' + ICONS.plus + ' Tambah Pembukuan</button>'
      + '</div></div>';
  }


  function renderBookFormModal() {
    const m = state.modal;
    const isEdit = !!m.editId;
    const parentId = m.draft.parentId || '';
    const isSub = !!parentId;
    // Calon induk: semua pembukuan kecuali dirinya & sub-pembukuan miliknya sendiri
    const candidates = parentCandidates(m.editId);
    const parentOptions = candidates.map(b =>
      '<option value="' + b.id + '"' + (b.id === parentId ? ' selected' : '') + '>' + escapeHtml(bookOptionLabel(b)) + '</option>'
    ).join('');
    const saldoSumber = m.draft.saldoSumber || 'induk';
    const parentField = '<div class="field"><label>Induk Pembukuan</label>'
      + '<select name="parent_id"><option value="">— Tidak ada (pembukuan utama) —</option>' + parentOptions + '</select>'
      + '<div class="field-error" data-err="parentId"></div>'
      + '<div class="field-hint">Pilih induk untuk menjadikan ini sub-pembukuan. Induk menampilkan gabungan saldo & transaksi seluruh sub-pembukuan di dalamnya.</div>'
      + '</div>';
    const saldoSourceField = (parentId && candidates.length)
      ? '<div class="field"><label>Sumber Saldo Awal</label>'
        + '<div class="saldo-source">'
        + '<label><input type="radio" name="saldoSumber" value="induk"' + (saldoSumber === 'induk' ? ' checked' : '') + '>'
        + '<span><b>Ambil dari pembukuan induk</b>'
        + '<span class="saldo-source-desc">Uang dipindah dari induk: otomatis tercatat sebagai transaksi pengeluaran di induk. Total gabungan tetap.</span></span></label>'
        + '<label><input type="radio" name="saldoSumber" value="baru"' + (saldoSumber === 'baru' ? ' checked' : '') + '>'
        + '<span><b>Saldo baru</b>'
        + '<span class="saldo-source-desc">Dana tambahan baru — menambah total gabungan induk; tidak ada transaksi yang dibuat di induk.</span></span></label>'
        + '</div></div>'
      : '';
    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah Pembukuan' : (isSub ? 'Sub-Pembukuan Baru' : 'Pembukuan Baru')) + '</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
      + '<form id="entry-form">'
      + '<div class="field"><label>Nama Pembukuan</label><input type="text" name="nama" placeholder="mis. Toko Kelontong, Cabang A" value="' + escapeHtml(m.draft.nama) + '" autofocus><div class="field-error" data-err="nama"></div></div>'
      + (candidates.length ? parentField : '')
      + '<div class="field"><label>Saldo Awal</label><div class="prefix-wrap"><span>Rp</span><input type="text" inputmode="numeric" autocomplete="off" name="saldoAwal" class="amount-input" placeholder="0" value="' + formatAmountInput(m.draft.saldoAwal) + '"></div><div class="field-error" data-err="saldoAwal"></div></div>'
      + saldoSourceField
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
        .map(x => renderTransactionRow(x, false))
        .join('') + '</div>';
    }

    const subBooks = state.adminBooks.filter(x => x.parentId === b.id);
    const parentBook = b.parentId ? state.adminBooks.find(x => x.id === b.parentId) : null;
    const relationNote = parentBook
      ? 'Sub-pembukuan dari ' + escapeHtml(parentBook.nama)
      : (subBooks.length ? subBooks.length + ' sub-pembukuan' : '');

    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop style="max-width:520px;">'
      + '<div class="modal-head"><h2>' + escapeHtml(b.nama) + '</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
      + '<p style="font-size:11.5px;color:var(--color-ink-soft);margin:-10px 0 14px;">' + escapeHtml(m.ownerEmail)
        + (relationNote ? ' &middot; ' + relationNote : '') + '</p>'
      + '<div class="stats-row" style="margin-bottom:14px;">'
      + '<div class="stat-chip masuk"><div class="lbl">' + (isFiltered ? 'Pemasukan Periode' : 'Pemasukan') + '</div><div class="val">' + formatRupiah(periodMasuk) + '</div></div>'
      + '<div class="stat-chip keluar"><div class="lbl">' + (isFiltered ? 'Pengeluaran Periode' : 'Pengeluaran') + '</div><div class="val">' + formatRupiah(periodKeluar) + '</div></div>'
      + '<div class="stat-chip saldo"><div class="lbl">Saldo Akhir' + (subBooks.length ? ' (buku ini)' : '') + '</div><div class="val">' + formatRupiah(b.saldoAkhir) + '</div></div>'
      + '</div>'
      + (subBooks.length
          ? '<div class="group-card"><div class="group-card-head"><div>'
            + '<h3>' + ICONS.layers + ' ' + subBooks.length + ' Sub-Pembukuan</h3>'
            + '<p>Ketuk salah satu untuk melihat transaksinya.</p></div></div>'
            + '<div class="group-list">' + subBooks.map(s =>
                '<div class="group-row">'
                + '<button class="group-row-main" data-action="book-detail" data-id="' + s.id + '">'
                + '<span class="group-row-nama">' + escapeHtml(s.nama) + '</span>'
                + '<span class="group-row-sub">' + s.jumlahTransaksi + ' transaksi &middot; saldo awal ' + formatRupiah(s.saldoAwal) + '</span>'
                + '</button>'
                + '<span class="group-row-amount mono">' + formatRupiah(s.saldoAkhir) + '</span>'
                + '</div>').join('') + '</div></div>'
          : '')
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
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah Kategori' : 'Kategori Baru') + '</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
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
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah Metode Pembayaran' : 'Metode Pembayaran Baru') + '</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
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
        const fd = new FormData(entryForm);
        const btn = entryForm.querySelector('button[type=submit]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Menyimpan…';

        let task;
        if (state.modal.mode === 'book-form') {
          task = submitBookForm(fd.get('nama'), fd.get('saldoAwal'), state.modal.editId, fd.get('parent_id'), fd.get('saldoSumber'));
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
            bookId: fd.get('book_id'),
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

  function setSearch(scope, value) {
    if (scope === 'admin-user') state.adminUserSearch = value;
    else if (scope === 'admin-tx') state.adminTxSearch = value;
    else state.search = value;
    render();
    // kembalikan fokus & posisi kursor agar tetap bisa mengetik
    const input = document.querySelector('.search-input[data-scope="' + scope + '"]');
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
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
    export: exportPDF,
    'export-admin-book': exportAdminBookPDF,
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
      // data-id = sub-pembukuan yang mau diekspor (dari ringkasan sub / kotak info)
      const targetId = el.getAttribute('data-id') || '';
      const mode = explicitMode
        ? (explicitMode === 'bagikan' ? 'share' : 'download')
        : (state.exportMenu === 'bagikan' ? 'share' : 'download');
      // Jaring pengaman: bila riwayat terlalu panjang, format gambar tidak boleh
      // diproses (hasilnya akan terpotong/kosong) → tampilkan pemberitahuan.
      if (fmt === 'png' && !pngAllowed(targetId)) {
        state.exportMenu = null;
        state.infoBox = null;
        render();
        openPngBlockedInfo(mode === 'share' ? 'bagikan' : 'unduh', targetId);
        return;
      }
      state.exportMenu = null;
      state.infoBox = null;
      render();
      runReport(fmt, mode, targetId || null);
    },
    // Ekspor cepat sebuah sub-pembukuan langsung dari ringkasan sub
    'export-sub': el => runReport('pdf', 'download', el.getAttribute('data-id')),
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
    'book-new': () => openBookForm(null, null),
    'book-new-sub': el => openBookForm(null, el.getAttribute('data-id')),
    'book-edit': el => openBookForm(el.getAttribute('data-id')),
    'switch-book': el => { state.modal = null; switchActiveBook(el.getAttribute('data-id')); },
    'toggle-subs': () => { state.modal = null; toggleSubs(); },
    'book-delete': el => openDeleteBookConfirm(el.getAttribute('data-id')),
    'set-default-book': el => setBookDefault(el.getAttribute('data-id')),
    'confirm-ok': () => {
      const c = state.confirmBox;
      if (!c) return;
      state.confirmBox = null;
      if (c.action === 'delete-book') deleteBook(c.id);
      else render();
    },
    'confirm-cancel': () => { state.confirmBox = null; render(); },
    'confirm-overlay': (el, e) => { if (e.target === el) { state.confirmBox = null; render(); } },
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
    'export-png-blocked': el => openPngBlockedInfo(el.getAttribute('data-mode'), el.getAttribute('data-id') || ''),
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
    state.includeSubs = true;
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
    state.confirmBox = null;
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

