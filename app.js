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
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
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
    return 'Rp' + num.toLocaleString('id-ID', { maximumFractionDigits: 0 });
  }

  function compactRupiah(n) {
    const num = Number(n) || 0;
    if (num >= 1000000000) return (num / 1000000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
    if (num >= 1000000) return (num / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    if (num >= 1000) return (num / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' rb';
    return String(num);
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
    return { id: b.id, nama: b.nama, saldoAwal: Number(b.saldo_awal), createdAt: b.created_at };
  }

  function mapTransaction(r) {
    return {
      id: r.id,
      type: r.type,
      date: r.date,
      keterangan: r.keterangan,
      jumlah: Number(r.jumlah),
      categoryId: r.category_id,
      paymentMethodId: r.payment_method_id
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

    getTransactions(bookId) {
      return sb.from('transactions').select('*').eq('book_id', bookId).order('date', { ascending: false });
    },

    createBook(nama, saldoAwal) {
      return sb.from('books')
        .insert([{ user_id: state.session.user.id, nama: nama, saldo_awal: saldoAwal }])
        .select().single();
    },

    updateBook(id, nama, saldoAwal) {
      return sb.from('books')
        .update({ nama: nama, saldo_awal: saldoAwal, updated_at: new Date().toISOString() })
        .eq('id', id);
    },

    deleteBook(id) {
      return sb.from('books').delete().eq('id', id);
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
        sb.from('books').select('id, user_id, nama, saldo_awal, created_at'),
        sb.from('transactions').select('id, user_id, book_id, type, date, jumlah')
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

      if (state.books.length && !state.books.some(b => b.id === state.activeBookId)) {
        state.activeBookId = state.books[0].id;
      }
      if (!state.books.length) state.activeBookId = null;
    }).catch(e => {
      console.error(e);
      showToast('Gagal memuat data: ' + (e.message || 'terjadi kesalahan'));
    }).finally(() => {
      state.dataReady = true;
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
    api.getTransactions(bookId).then(res => {
      if (res.error) throw res.error;
      if (state.activeBookId !== bookId) return; // pengguna pindah buku sebelum selesai
      state.transactions = (res.data || []).map(mapTransaction);
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
    render();
  }

  // ---------- Pembukuan (books) ----------
  function openBookPicker() { state.modal = { mode: 'book-picker' }; render(); }

  function openBookForm(editId) {
    const book = editId ? state.books.find(b => b.id === editId) : null;
    state.modal = {
      mode: 'book-form',
      editId: editId || null,
      draft: book ? { nama: book.nama, saldoAwal: book.saldoAwal } : { nama: '', saldoAwal: 0 }
    };
    render();
  }

  function submitBookForm(nama, saldoAwal, editId) {
    const errors = {};
    if (!nama || !nama.trim()) errors.nama = 'Nama pembukuan wajib diisi';
    const num = Number(saldoAwal);
    if (saldoAwal === '' || saldoAwal === null || isNaN(num) || num < 0) errors.saldoAwal = 'Masukkan angka yang valid';
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
      const b = { id: res.data.id, nama: res.data.nama, saldoAwal: Number(res.data.saldo_awal), createdAt: res.data.created_at };
      state.books.push(b);
      state.modal = null;
      switchActiveBook(b.id);
      showToast('Pembukuan dibuat');
      return null;
    }).catch(e => {
      showToast('Gagal membuat pembukuan: ' + (e.message || 'terjadi kesalahan'));
      return {};
    });
  }

  function deleteBook(id) {
    api.deleteBook(id).then(res => {
      if (res.error) throw res.error;
      state.books = state.books.filter(b => b.id !== id);
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
    }).catch(e => {
      showToast('Gagal menghapus: ' + (e.message || 'terjadi kesalahan'));
    });
  }


  // ---------- Transaksi ----------
  function openEntryModal(type, editId) {
    const edit = editId ? state.transactions.find(t => t.id === editId) : null;
    state.modal = {
      mode: 'entry',
      type: type,
      editId: editId || null,
      draft: edit
        ? Object.assign({}, edit)
        : { date: todayStr(), keterangan: '', jumlah: '', categoryId: '', paymentMethodId: '' }
    };
    render();
  }

  function closeModal() {
    state.modal = null;
    render();
  }

  function submitEntry({ type, date, keterangan, jumlah, categoryId, paymentMethodId, editId }) {
    const errors = {};
    if (!date) errors.date = 'Tanggal wajib diisi';
    if (!keterangan || !keterangan.trim()) errors.keterangan = 'Keterangan wajib diisi';
    const num = Number(jumlah);
    if (!jumlah || isNaN(num) || num <= 0) errors.jumlah = 'Jumlah harus lebih dari 0';
    if (Object.keys(errors).length) return Promise.resolve(errors);

    const payload = {
      type: type,
      date: date,
      keterangan: keterangan.trim(),
      jumlah: num,
      category_id: categoryId || null,
      payment_method_id: paymentMethodId || null
    };

    const op = editId
      ? api.updateTransaction(editId, payload)
      : api.createTransaction(payload);

    return op.then(res => {
      if (res.error) throw res.error;
      if (editId) {
        const idx = state.transactions.findIndex(t => t.id === editId);
        if (idx > -1) {
          state.transactions[idx] = Object.assign({}, state.transactions[idx], {
            type: type,
            date: date,
            keterangan: keterangan.trim(),
            jumlah: num,
            categoryId: payload.category_id,
            paymentMethodId: payload.payment_method_id
          });
        }
      } else {
        const tx = Object.assign({ id: res.data.id }, payload);
        state.transactions.push({
          id: tx.id,
          type: tx.type,
          date: tx.date,
          keterangan: tx.keterangan,
          jumlah: tx.jumlah,
          categoryId: tx.category_id,
          paymentMethodId: tx.payment_method_id
        });
      }
      state.modal = null;
      render();
      showToast(editId ? 'Perubahan disimpan' : (type === PEMASUKAN ? 'Pemasukan dicatat' : 'Pengeluaran dicatat'));
      return null;
    }).catch(e => {
      showToast('Gagal menyimpan: ' + (e.message || 'terjadi kesalahan'));
      return {};
    });
  }

  function deleteEntry(id) {
    api.deleteTransaction(id).then(res => {
      if (res.error) throw res.error;
      state.transactions = state.transactions.filter(t => t.id !== id);
      render();
      showToast('Data dihapus');
    }).catch(e => {
      showToast('Gagal menghapus: ' + (e.message || 'terjadi kesalahan'));
    });
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
        type: r.type, date: r.date, jumlah: Number(r.jumlah)
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
      categoryName(x.categoryId) || '-',
      paymentName(x.paymentMethodId) || '-',
      formatRupiah(x.jumlah)
    ]);
  }

  function pdfSection(doc, title, rows, fillColor, startY) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, 14, startY);
    doc.autoTable({
      startY: startY + 3,
      head: [PDF_HEAD],
      body: rows.length ? pdfRows(rows) : [['-', 'Tidak ada data', '-', '-', '-']],
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 3 },
      headStyles: { fillColor: fillColor, textColor: 255 },
      columnStyles: { 4: { halign: 'right' } },
      margin: { left: 14, right: 14 }
    });
    return doc.lastAutoTable.finalY;
  }

  function exportPDF() {
    if (!pdfReady()) return;
    const book = activeBook();
    if (!book) { showToast('Belum ada pembukuan untuk diekspor'); return; }
    const t = totals();
    const periodTx = filterByPeriod(state.transactions, state.filter);
    const isFiltered = state.filter.type !== 'all';
    const pemasukanList = periodTx.filter(x => x.type === PEMASUKAN).sort((a, b) => a.date.localeCompare(b.date));
    const pengeluaranList = periodTx.filter(x => x.type === PENGELUARAN).sort((a, b) => a.date.localeCompare(b.date));
    const periodPemasukan = pemasukanList.reduce((s, x) => s + x.jumlah, 0);
    const periodPengeluaran = pengeluaranList.reduce((s, x) => s + x.jumlah, 0);

    const doc = new window.jspdf.jsPDF();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(31, 43, 36);
    doc.text('Laporan Pembukuan', 14, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60, 70, 64);
    doc.text(book.nama, 14, 25);
    doc.setFontSize(9.5); doc.setTextColor(90, 100, 90);
    doc.text('Dicetak pada ' + new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), 14, 31);
    let y = 36;
    if (isFiltered) {
      doc.text('Periode: ' + periodLabel(state.filter.type, state.filter.value), 14, y);
      y += 5;
    }

    doc.setFontSize(10.5); doc.setTextColor(31, 43, 36);
    doc.text((isFiltered ? 'Saldo Awal Keseluruhan: ' : 'Saldo Awal: ') + formatRupiah(t.saldoAwal), 14, y);
    y += 6;

    y = pdfSection(doc, 'Pemasukan', pemasukanList, [31, 111, 84], y) + 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text('Subtotal Pemasukan: ' + formatRupiah(periodPemasukan), 14, y);

    y += 10;
    y = pdfSection(doc, 'Pengeluaran', pengeluaranList, [175, 70, 43], y) + 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text('Subtotal Pengeluaran: ' + formatRupiah(periodPengeluaran), 14, y);

    y += 12;
    doc.setDrawColor(217, 211, 191);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFontSize(12.5);
    if (isFiltered) {
      doc.text('Arus Kas Periode Ini: ' + formatRupiah(periodPemasukan - periodPengeluaran), 14, y);
      y += 7;
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 100, 90);
      doc.text('Saldo Akhir Keseluruhan (semua waktu): ' + formatRupiah(t.saldoAkhir), 14, y);
    } else {
      doc.text('Saldo Akhir: ' + formatRupiah(t.saldoAkhir), 14, y);
    }

    const fileSuffix = isFiltered ? '-' + slugify(periodLabel(state.filter.type, state.filter.value)) : '';
    doc.save('laporan-' + slugify(book.nama) + fileSuffix + '-' + todayStr() + '.pdf');
    showToast('PDF diunduh');
  }


  function exportAdminBookPDF() {
    if (!pdfReady()) return;
    if (!state.modal || state.modal.mode !== 'book-detail') return;
    const b = state.modal.book;
    const rows = filterByPeriod(state.modal.rows, state.adminFilter).sort((a, c) => a.date.localeCompare(c.date));
    const isFiltered = state.adminFilter.type !== 'all';
    const pemasukanList = rows.filter(x => x.type === PEMASUKAN);
    const pengeluaranList = rows.filter(x => x.type === PENGELUARAN);
    const periodMasuk = pemasukanList.reduce((s, x) => s + x.jumlah, 0);
    const periodKeluar = pengeluaranList.reduce((s, x) => s + x.jumlah, 0);

    const doc = new window.jspdf.jsPDF();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(31, 43, 36);
    doc.text('Laporan Pembukuan (Admin)', 14, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(60, 70, 64);
    doc.text(b.nama + ' — ' + state.modal.ownerEmail, 14, 25);
    doc.setFontSize(9.5); doc.setTextColor(90, 100, 90);
    doc.text('Dicetak pada ' + new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }), 14, 31);
    let y = 36;
    if (isFiltered) {
      doc.text('Periode: ' + periodLabel(state.adminFilter.type, state.adminFilter.value), 14, y);
      y += 5;
    }

    doc.setFontSize(10.5); doc.setTextColor(31, 43, 36);
    doc.text('Saldo Awal: ' + formatRupiah(b.saldoAwal), 14, y);
    y += 6;

    y = pdfSection(doc, 'Pemasukan', pemasukanList, [31, 111, 84], y) + 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text('Subtotal Pemasukan: ' + formatRupiah(periodMasuk), 14, y);

    y += 10;
    y = pdfSection(doc, 'Pengeluaran', pengeluaranList, [175, 70, 43], y) + 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text('Subtotal Pengeluaran: ' + formatRupiah(periodKeluar), 14, y);

    y += 12;
    doc.setDrawColor(217, 211, 191);
    doc.line(14, y, 196, y);
    y += 8;
    doc.setFontSize(12.5);
    if (isFiltered) {
      doc.text('Arus Kas Periode Ini: ' + formatRupiah(periodMasuk - periodKeluar), 14, y);
      y += 7;
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 100, 90);
      doc.text('Saldo Akhir Keseluruhan (semua waktu): ' + formatRupiah(b.saldoAkhir), 14, y);
    } else {
      doc.text('Saldo Akhir: ' + formatRupiah(b.saldoAkhir), 14, y);
    }

    const fileSuffix = isFiltered ? '-' + slugify(periodLabel(state.adminFilter.type, state.adminFilter.value)) : '';
    doc.save('laporan-admin-' + slugify(b.nama) + fileSuffix + '-' + todayStr() + '.pdf');
    showToast('PDF diunduh');
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
    const cat = categoryName(item.categoryId);
    const pay = paymentName(item.paymentMethodId);
    if (cat) parts.push('<span class="tag tag-cat">' + escapeHtml(cat) + '</span>');
    if (pay) parts.push('<span class="tag tag-pay">' + escapeHtml(pay) + '</span>');
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
    return '<div class="row">'
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
      if (state.modal) html += renderModal();
      appEl.innerHTML = html;
      bindForms();
      mountCharts();
      return;
    }

    if (state.isAdmin && state.view === 'master') {
      html += renderAdminMaster();
      if (state.modal) html += renderModal();
      appEl.innerHTML = html;
      bindForms();
      return;
    }

    // Buku Saya
    if (state.books.length === 0) {
      html += renderNoBooksScreen();
      if (state.modal) html += renderModal();
      appEl.innerHTML = html;
      bindForms();
      return;
    }

    html += renderBookView();
    if (state.modal) html += renderModal();
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
      + '<button class="btn-primary" data-action="book-new" style="display:inline-flex;padding:10px 18px;">' + ICONS.plus + ' Buat Pembukuan</button>'
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
      + '<button class="btn-export" data-action="export">' + ICONS.download + ' PDF</button>'
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
      + '<div class="stat-chip saldo"><div class="lbl">Saldo Awal <button class="edit-saldo-btn" data-action="book-edit" data-id="' + (book ? book.id : '') + '">' + ICONS.edit + '</button></div><div class="val">' + formatRupiah(t.saldoAwal) + '</div></div>'
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
  function renderModal() {
    const m = state.modal;
    if (!m) return '';
    if (m.mode === 'book-detail') return renderBookDetailModal();
    if (m.mode === 'book-picker') return renderBookPickerModal();
    if (m.mode === 'book-form') return renderBookFormModal();
    if (m.mode === 'category-form') return renderCategoryFormModal();
    if (m.mode === 'payment-form') return renderPaymentFormModal();
    return renderEntryModal();
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

    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah ' : 'Catat ') + typeLabel + '</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
      + '<form id="entry-form">'
      + '<div class="field"><label>Tanggal</label><input type="date" name="date" value="' + m.draft.date + '"><div class="field-error" data-err="date"></div></div>'
      + '<div class="field"><label>Keterangan</label><input type="text" name="keterangan" placeholder="mis. Penjualan produk, Bayar listrik" value="' + escapeHtml(m.draft.keterangan || '') + '"><div class="field-error" data-err="keterangan"></div></div>'
      + '<div class="field"><label>Kategori</label><select name="category_id"><option value="">— Pilih kategori —</option>' + catOptions + '</select></div>'
      + '<div class="field"><label>Metode Pembayaran</label><select name="payment_method_id"><option value="">— Pilih metode —</option>' + payOptions + '</select></div>'
      + '<div class="field"><label>Jumlah</label><div class="prefix-wrap"><span>Rp</span><input type="number" min="0" step="1" name="jumlah" placeholder="0" inputmode="numeric" value="' + (m.draft.jumlah || '') + '"></div><div class="field-error" data-err="jumlah"></div></div>'
      + '<div class="modal-actions"><button type="button" class="btn-secondary" data-action="close">Batal</button><button type="submit" class="btn-primary' + (m.type === PENGELUARAN ? ' danger' : '') + '">Simpan</button></div>'
      + '</form></div></div>';
  }

  function renderBookPickerModal() {
    const rows = state.books.map(b => {
      const active = b.id === state.activeBookId;
      return '<div class="book-row' + (active ? ' active' : '') + '">'
        + '<button class="book-row-main" data-action="switch-book" data-id="' + b.id + '">'
        + '<span class="book-row-nama">' + escapeHtml(b.nama) + (active ? ' <span class="badge-active">aktif</span>' : '') + '</span>'
        + '<span class="book-row-sub mono">' + formatRupiah(b.saldoAwal) + ' saldo awal</span>'
        + '</button>'
        + '<button class="icon-btn" data-action="book-edit" data-id="' + b.id + '">' + ICONS.edit + '</button>'
        + '<button class="icon-btn danger" data-action="book-delete" data-id="' + b.id + '">' + ICONS.trash + '</button>'
        + '</div>';
    }).join('');
    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>Pilih Pembukuan</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
      + '<div class="book-picker-list">' + (rows || '<p class="empty-hint">Belum ada pembukuan.</p>') + '</div>'
      + '<button class="btn-primary" style="width:100%;margin-top:14px;" data-action="book-new">' + ICONS.plus + ' Buku Baru</button>'
      + '</div></div>';
  }


  function renderBookFormModal() {
    const m = state.modal;
    const isEdit = !!m.editId;
    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop>'
      + '<div class="modal-head"><h2>' + (isEdit ? 'Ubah Pembukuan' : 'Pembukuan Baru') + '</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
      + '<form id="entry-form">'
      + '<div class="field"><label>Nama Pembukuan</label><input type="text" name="nama" placeholder="mis. Toko Kelontong, Usaha Sampingan" value="' + escapeHtml(m.draft.nama) + '" autofocus><div class="field-error" data-err="nama"></div></div>'
      + '<div class="field"><label>Saldo Awal</label><div class="prefix-wrap"><span>Rp</span><input type="number" min="0" step="1" name="saldoAwal" inputmode="numeric" value="' + m.draft.saldoAwal + '"></div><div class="field-error" data-err="saldoAwal"></div></div>'
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

    return '<div class="modal-overlay open" data-action="overlay">'
      + '<div class="modal" data-stop style="max-width:520px;">'
      + '<div class="modal-head"><h2>' + escapeHtml(b.nama) + '</h2><button class="modal-close" data-action="close">' + ICONS.close + '</button></div>'
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
      + '<button class="btn-export-outline" data-action="export-admin-book">' + ICONS.download + ' Unduh PDF' + (isFiltered ? ' (periode ini)' : '') + '</button>'
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


  // ---- Delegasi event klik ----
  const ACTIONS = {
    export: exportPDF,
    'export-admin-book': exportAdminBookPDF,
    tab: el => switchTab(el.getAttribute('data-tab')),
    add: el => openEntryModal(el.getAttribute('data-type'), null),
    edit: el => openEntryModal(el.getAttribute('data-type'), el.getAttribute('data-id')),
    delete: el => { if (confirm('Hapus catatan ini?')) deleteEntry(el.getAttribute('data-id')); },
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
    'search-clear': el => setSearch(el.getAttribute('data-scope'), '')
  };

  appEl.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const handler = ACTIONS[el.getAttribute('data-action')];
    if (handler) handler(el, e);
  });

  // ---- Delegasi event change (filter periode) ----
  appEl.addEventListener('change', e => {
    const el = e.target;
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

  // ---- Delegasi event input (pencarian) ----
  appEl.addEventListener('input', e => {
    const el = e.target;
    if (el.getAttribute('data-action') === 'search-input') {
      setSearch(el.getAttribute('data-scope'), el.value);
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
  }

  function init() {
    if (!CONFIG_OK) { state.dataReady = true; render(); return; }
    if (typeof window.supabase === 'undefined') {
      appEl.innerHTML = '<div class="loading-wrap">Gagal memuat pustaka Supabase. Periksa koneksi internet lalu muat ulang halaman.</div>';
      return;
    }
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    sb.auth.onAuthStateChange((event, session) => {
      state.session = session;
      if (session) {
        loadUserData();
      } else {
        resetSessionState();
        state.txReady = true;
        state.dataReady = true;
        render();
      }
    });
  }

  init();
})();

