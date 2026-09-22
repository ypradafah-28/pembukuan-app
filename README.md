# Buku Kas — Pembukuan

Aplikasi pencatatan kas (pemasukan & pengeluaran) berbasis web, mobile-first.
Tanpa build step: HTML + CSS + JavaScript biasa, dengan Supabase sebagai
backend (Auth, Postgres, Storage).

## Fitur

- Login/daftar akun (email + kata sandi) lewat Supabase Auth.
- Banyak pembukuan (buku) per pengguna, satu buku bisa ditandai **default**.
  Skema database sudah menyiapkan **sub-pembukuan** (`books.parent_id`, pohon
  induk → anak beserta penjaga hierarki), namun antarmukanya belum dibuat.
- Catat pemasukan & pengeluaran dengan kategori dan metode pembayaran
  (master data dikelola admin).
- Filter periode: harian, mingguan (ISO), bulanan, tahunan, atau semua waktu.
- Pencarian bebas pada keterangan, kategori, metode, tanggal, dan nominal.
- **Lampiran nota** pada pengeluaran: foto (dikompres otomatis) atau PDF,
  disimpan di bucket privat `nota` dan diakses lewat signed URL berbatas waktu.
- Ekspor laporan **PDF** (jsPDF + AutoTable) dan **gambar PNG** (html2canvas),
  dengan opsi unduh atau bagikan (Web Share API).
- Area admin: pantau pengguna, rincian tiap pembukuan, dan master data.
- PWA ringan: `manifest.json` + ikon, bisa dipasang ke layar utama.

## Struktur berkas

| Berkas | Isi |
|---|---|
| `index.html` | Kerangka halaman + pustaka CDN (versi terkunci + SRI) |
| `app.js` | Seluruh logika aplikasi (satu IIFE, tanpa modul) |
| `styles.css` | Seluruh tampilan (CSS variable, mobile-first) |
| `schema.sql` | Skema Supabase: tabel, RLS, trigger, bucket Storage, seed, migrasi |
| `manifest.json` | Metadata PWA |
| `icons/` | Ikon aplikasi (`icon.svg` + PNG hasil generator) |
| `tests/pagination.check.mjs` | Uji logika paginasi data |
| `tests/consistency.check.mjs` | Periksa manifest, rujukan `index.html`, jaringan `data-action`, skema |
| `tools/cdn-hash.mjs` | Penghitung hash SRI untuk pustaka CDN |
| `tools/make-icons.mjs` | Pembuat ulang ikon PNG |


## Pemasangan

1. Buat project gratis di [supabase.com](https://supabase.com).
2. Buka **SQL Editor** → **New query**, tempel seluruh isi `schema.sql`, lalu
   **Run**. Skrip ini idempotent: aman dijalankan berkali-kali.
3. Buka **Project Settings → API**, salin `Project URL` dan `anon public key`.
4. Isi keduanya di `app.js` bagian **1. KONFIGURASI** (`SUPABASE_URL`,
   `SUPABASE_ANON_KEY`).
5. Jalankan aplikasi, daftar akun pertama, lalu jadikan akun itu admin dari
   SQL Editor:

   ```sql
   update public.profiles set role = 'admin' where email = 'email-kamu@contoh.com';
   ```

   Bila akun sudah terdaftar sebelum tabel `profiles` ada, isi dulu profilnya:

   ```sql
   insert into public.profiles (id, email)
   select id, email from auth.users
   where id not in (select id from public.profiles);
   ```

### Menjalankan lokal

Karena tidak ada build step, cukup sajikan folder ini sebagai berkas statis
(jangan dibuka lewat `file://` agar Supabase Auth bekerja normal):

```bash
python -m http.server 5173      # atau: npx serve .
```

Lalu buka `http://localhost:5173`.

### Deploy

Unggah seluruh folder (tanpa `tests/` dan `tools/` bila tidak diperlukan) ke
hosting statis apa pun: GitHub Pages, Netlify, Cloudflare Pages, Vercel, dsb.
Tidak ada variabel lingkungan yang dibutuhkan.

## Keamanan

- `SUPABASE_ANON_KEY` memang dirancang publik dan **aman** ditaruh di berkas
  klien **selama RLS aktif** (sudah diatur `schema.sql`). Setiap tabel punya
  policy berbasis `auth.uid()`; baca-silang antar pengguna hanya untuk admin.
- **Jangan pernah** menaruh `service_role key` di `app.js` atau berkas mana pun
  di folder ini — kunci itu melewati semua RLS.
- Lampiran disimpan di bucket privat; tautan akses dibuat ulang sebagai signed
  URL (masa berlaku 1 jam, di-cache di memori sampai mendekati kedaluwarsa).
- Pustaka CDN dikunci versinya dan diberi `integrity` (SRI) agar isi berkas
  tidak bisa berubah diam-diam di sisi CDN.


## Catatan penting

- **Paginasi data.** Data API Supabase membatasi jumlah baris per respons
  (`Max Rows`, default **1000** — lihat *Dashboard → Settings → API*). Aplikasi
  menyusuri seluruh halaman (`fetchAllRows`) untuk transaksi, pembukuan, dan
  agregat admin, jadi angka saldo tetap lengkap. Bila Anda menaikkan setelan
  `Max Rows`, sesuaikan `PAGE_SIZE` di `app.js` agar tidak lebih kecil.
- **Lampiran nota** hanya tersedia untuk pengeluaran; gambar otomatis dikompres
  ke maksimal 1280 px (JPEG 0.75); PDF maksimal 5 MB. Format yang didukung:
  JPG, PNG, WebP, PDF. Foto HEIC (iPhone) ditolak karena browser tidak bisa
  mengompresinya — pilih "Pilih PDF / Gambar" agar iPhone mengirim JPEG.
- **Ekspor gambar (PNG)** dibatasi 110 baris laporan agar satu PNG pasti muat
  di canvas semua perangkat. Untuk riwayat lebih panjang, gunakan PDF (batas
  ini dijelaskan di UI, bukan kegagalan senyap).
- **Lampiran saat menghapus buku**: sebelum baris buku dihapus, aplikasi
  memanggil RPC `book_subtree_ids` lalu membersihkan lampiran seluruh pohon
  pembukuan dari Storage (best-effort; kegagalan hanya dicatat di konsol).
- **`updated_at`** diisi trigger di server, bukan jam perangkat pengguna.
- **Pencarian** dibungkus jeda 200 ms (debounce) supaya daftar panjang tidak
  berat saat mengetik.
- **Format angka** mengikuti konvensi input aplikasi: `Rp1,000,000` (pemisah
  ribuan koma). Bila ingin gaya Indonesia (`Rp1.000.000`), ubah `formatRupiah()`
  **dan** `formatAmountField()` agar keduanya tetap konsisten.
- **`index.html` tanpa `maximum-scale`** agar pengguna tetap bisa mencubit-zoom.

## Pengujian & perawatan

```bash
node tests/pagination.check.mjs     # uji logika paginasi (menguji kode asli app.js)
node tests/consistency.check.mjs    # periksa manifest, index.html, data-action, schema
node tools/cdn-hash.mjs             # hitung ulang hash SRI setelah naik versi pustaka
node tools/make-icons.mjs           # buat ulang ikon PNG dari desain di skrip
```

Setelah mengubah `schema.sql`, jalankan ulang seluruh berkas di SQL Editor.
Khusus penjaga lampiran (`transactions_guard_nota`), periksa dulu baris lama:

```sql
select count(*) from public.transactions
where nota_path is not null
  and nota_path not like user_id::text || '/' || book_id::text || '/%';
```

Hasilnya harus `0`; bila tidak, rapikan baris tersebut (mis. `nota_path = null`)
karena lampirannya memang tidak dapat diakses.

### Checklist uji manual setelah perubahan

1. Daftar/masuk, buat pembukuan, catat pemasukan dan pengeluaran.
2. Tambah lampiran foto dan PDF, buka lewat **Lihat** dan **Unduh**, lalu ulangi
   setelah halaman dimuat ulang (uji signed URL).
3. Ubah catatan (termasuk ganti/hapus lampiran), lalu hapus catatan.
4. Ganti buku aktif, uji filter periode dan pencarian.
5. Ekspor PDF dan PNG (unduh & bagikan).
6. Masuk sebagai admin: pantau pengguna, buka detail buku, lihat lampiran
   (hanya tombol lihat/unduh), kelola kategori & metode pembayaran.
7. Hapus pembukuan, pastikan transaksi dan berkas lampirannya ikut hilang
   (periksa bucket `nota` di dashboard Supabase).
8. Uji keyboard: buka modal, tekan `Tab`, tutup dengan `Esc`, dan cubit-zoom.

## Naik versi pustaka CDN

1. Jalankan `node tools/cdn-hash.mjs` — skrip menampilkan URL yang benar-benar
   dilayani, ukuran, stabilitas, dan hash `sha384`.
2. Perbarui `src` + `integrity` di `index.html`. Selalu pakai URL versi konkret
   (mis. `@supabase/supabase-js@2.116.0`), **bukan** alias `@2`/`@4`: alias itu
   ikut berubah saat pustaka merilis versi baru sehingga SRI langsung gagal.
3. Muat ulang aplikasi di browser dan pastikan tidak ada error SRI di konsol.
