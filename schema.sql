-- ============================================================
-- Skema database untuk aplikasi Buku Kas (Pembukuan)
-- Cara pakai: buka project Supabase kamu -> SQL Editor -> New query
-- -> tempel seluruh isi file ini -> Run
--
-- Script ini AMAN dijalankan berkali-kali (idempotent), termasuk
-- di atas project yang sudah pernah menjalankan versi sebelumnya.
-- Versi ini menambahkan:
--   * Tabel categories (kategori transaksi, dikelola admin)
--   * Tabel payment_methods (metode pembayaran, dikelola admin)
--   * Kolom category_id & payment_method_id di tabel transactions
--   * Data awal (seed) kategori & metode pembayaran
--   * Aturan keamanan (RLS) untuk tabel baru
--   * Sub pembukuan: kolom books.parent_id (hierarki induk → sub)
--     beserta trigger penjaga hierarki & aturan buku default
--   * Sinkronisasi profiles.email saat email pengguna berubah
--   * Penjaga path lampiran nota (harus di folder pengguna sendiri)
--   * updated_at diisi trigger server (tabel books & transactions)
--   * SUB-PEMBUKUAN & ALOKASI DANA (bagian di akhir berkas):
--       - hierarki maksimal 2 level (induk → pos) + hapus buku yang aman
--       - jenis transaksi 'alokasi' (dua baris tertaut per pemindahan)
--       - RPC atomik allocate_funds / delete_allocation
--       - saldo pos tidak boleh minus; pos wajib mulai dari saldo 0
--       - fungsi bantu book_balance & my_book_balances
-- (Fungsi book_subtree_ids dari versi lama sudah dibuang — lihat bagian
--  "Pembersihan" di akhir berkas.)
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- Profil pengguna (untuk fitur admin)
-- ============================================================

-- Salinan ringan dari auth.users (id, email, role) yang aman
-- dibaca lewat anon key, karena auth.users sendiri tidak bisa
-- diakses langsung dari client.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Setiap ada pengguna baru daftar, otomatis dibuatkan baris profil.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Fungsi bantu untuk cek apakah pengguna yang sedang login admin.
-- security definer supaya tidak terjadi rekursi saat dipakai di RLS policy.
-- Ditandai stable (hanya membaca) agar planner bisa mengoptimalkan pemanggilan
-- yang terjadi untuk setiap baris di dalam policy.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- Pembukuan (books) — pengguna bisa punya banyak pembukuan bernama
-- ============================================================

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nama text not null,
  saldo_awal numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_user_id_idx on public.books(user_id);

-- ============================================================
-- Sub pembukuan: sebuah pembukuan bisa punya sub-pembukuan
-- (mis. "Toko Utama" → "Cabang A", "Cabang B"), dan sub bisa
-- punya sub lagi. Baris tanpa parent_id = pembukuan induk/utama.
--
-- on delete cascade: menghapus pembukuan induk berarti menghapus
-- sub-pembukuan di dalamnya beserta seluruh transaksinya. Sisi
-- aplikasi menampilkan konfirmasi lebih dulu (lihat app.js).
-- ============================================================

alter table public.books add column if not exists parent_id uuid
  references public.books(id) on delete cascade;

create index if not exists books_parent_id_idx on public.books(parent_id);

-- ============================================================
-- Tutup buku pos: kolom penanda pos sudah ditutup. NULL = masih
-- terbuka. Sebuah pos ditutup dengan mengembalikan sisa dananya ke
-- induk lalu dikunci read-only (lihat bagian "11. Tutup buku pos").
-- ============================================================

alter table public.books add column if not exists closed_at timestamptz;

-- ============================================================
-- Buku default: pengguna bisa menandai satu pembukuan sebagai
-- default yang otomatis terbuka saat masuk.
-- ============================================================

alter table public.books add column if not exists is_default boolean not null default false;
create index if not exists books_default_user_idx on public.books(user_id) where is_default;

-- Atur buku default secara atomik (validasi kepemilikan lewat auth.uid())
create or replace function public.set_default_book(p_book_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.books
    where id = p_book_id and user_id = auth.uid()
  ) then
    raise exception 'Buku tidak ditemukan atau bukan milik pengguna ini';
  end if;

  if exists (
    select 1 from public.books
    where id = p_book_id and parent_id is not null
  ) then
    raise exception 'Sub-pembukuan tidak bisa dijadikan buku default';
  end if;

  update public.books
  set is_default = false
  where user_id = auth.uid() and is_default = true;

  update public.books
  set is_default = true
  where id = p_book_id;
end;
$$;

-- Migrasi data: bila sebuah pengguna belum punya buku default,
-- buku induk pertamanya (urut created_at) dijadikan default.
-- Sub-pembukuan tidak pernah dijadikan default.
with first_book as (
  select distinct on (user_id) user_id, id
  from public.books
  where parent_id is null
  order by user_id, created_at asc, id asc
)
update public.books b
set is_default = true
from first_book f
where b.id = f.id
  and not exists (
    select 1 from public.books b2
    where b2.user_id = b.user_id and b2.is_default = true
  );

-- ============================================================
-- Transaksi pemasukan & pengeluaran (terikat ke satu pembukuan)
-- ============================================================

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('pemasukan', 'pengeluaran')),
  date date not null,
  keterangan text not null,
  jumlah numeric not null check (jumlah > 0),
  created_at timestamptz not null default now()
);

alter table public.transactions add column if not exists book_id uuid references public.books(id) on delete cascade;
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_book_id_idx on public.transactions(book_id);

-- ============================================================
-- Kategori transaksi (master data global, dikelola admin)
-- type 'semua' berarti berlaku untuk pemasukan & pengeluaran
-- ============================================================

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  type text not null default 'semua' check (type in ('pemasukan', 'pengeluaran', 'semua')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (nama, type)
);

-- ============================================================
-- Metode pembayaran (master data global, dikelola admin)
-- contoh: Cash, Transfer, Online, QRIS
-- ============================================================

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Hubungkan transaksi ke kategori & metode pembayaran
-- on delete set null: jika master data dihapus, transaksi lama
-- tetap aman (kolom menjadi NULL) dan tampil sebagai "-"
-- ============================================================

alter table public.transactions
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists payment_method_id uuid references public.payment_methods(id) on delete set null;

create index if not exists transactions_category_id_idx on public.transactions(category_id);
create index if not exists transactions_payment_method_id_idx on public.transactions(payment_method_id);
create index if not exists transactions_date_idx on public.transactions(date);

-- ============================================================
-- Lampiran nota transaksi (gambar / PDF)
-- Disimpan sebagai PATH di bucket Storage privat "nota", bukan URL,
-- supaya tautan akses harus dibuat ulang (signed URL, kedaluwarsa).
-- Pola path: {user_id}/{book_id}/{uuid}.{ext}
-- ============================================================

alter table public.transactions add column if not exists nota_path text;
alter table public.transactions add column if not exists nota_mime text;
alter table public.transactions add column if not exists nota_name text;
alter table public.transactions add column if not exists nota_size bigint;

create index if not exists transactions_nota_path_idx
  on public.transactions(nota_path) where nota_path is not null;

-- Bucket privat "nota": gambar + PDF, maksimal 5 MB per file.
-- (allowed_mime_types membuat server ikut menolak jenis file lain)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nota', 'nota', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Aturan akses objek Storage: pemilik folder (= uid) penuh, admin boleh baca.
-- Elemen pertama folder adalah user id, jadi tiap pengguna terkunci di foldernya.
drop policy if exists "nota_select_own" on storage.objects;
create policy "nota_select_own" on storage.objects
  for select using (bucket_id = 'nota' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "nota_select_admin" on storage.objects;
create policy "nota_select_admin" on storage.objects
  for select using (bucket_id = 'nota' and public.is_admin());
drop policy if exists "nota_insert_own" on storage.objects;
create policy "nota_insert_own" on storage.objects
  for insert with check (bucket_id = 'nota' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "nota_update_own" on storage.objects;
create policy "nota_update_own" on storage.objects
  for update using (bucket_id = 'nota' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "nota_delete_own" on storage.objects;
create policy "nota_delete_own" on storage.objects
  for delete using (bucket_id = 'nota' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Migrasi otomatis dari skema lama (tabel "saldo" per-pengguna)
-- Hanya berjalan kalau tabel "saldo" masih ada di project kamu.
-- ============================================================
do $$
declare
  r record;
  new_book_id uuid;
begin
  if to_regclass('public.saldo') is not null then

    -- Pengguna yang sudah punya transaksi dari skema lama
    for r in
      select distinct user_id from public.transactions where book_id is null
    loop
      insert into public.books (user_id, nama, saldo_awal)
      values (
        r.user_id,
        'Pembukuan Utama',
        coalesce((select saldo_awal from public.saldo where user_id = r.user_id), 0)
      )
      returning id into new_book_id;

      update public.transactions
      set book_id = new_book_id
      where user_id = r.user_id and book_id is null;
    end loop;

    -- Pengguna yang punya saldo tapi belum pernah mencatat transaksi
    for r in
      select s.user_id, s.saldo_awal
      from public.saldo s
      where not exists (select 1 from public.books b where b.user_id = s.user_id)
    loop
      insert into public.books (user_id, nama, saldo_awal)
      values (r.user_id, 'Pembukuan Utama', r.saldo_awal);
    end loop;

  end if;
end $$;

-- Setelah migrasi, setiap baris transaksi wajib terhubung ke satu pembukuan
alter table public.transactions alter column book_id set not null;

-- Skema lama sudah tidak dipakai lagi
drop table if exists public.saldo cascade;

-- ============================================================
-- Data awal (seed) — aman dijalankan berulang (on conflict do nothing)
-- ============================================================

insert into public.categories (nama, type) values
  ('Penjualan', 'pemasukan'),
  ('Modal', 'pemasukan'),
  ('Pendapatan Lain', 'pemasukan'),
  ('Belanja', 'pengeluaran'),
  ('Gaji & Upah', 'pengeluaran'),
  ('Transportasi', 'pengeluaran'),
  ('Utilitas', 'pengeluaran'),
  ('Pengeluaran Lain', 'pengeluaran')
on conflict (nama, type) do nothing;

insert into public.payment_methods (nama) values
  ('Cash'),
  ('Transfer'),
  ('Online'),
  ('QRIS')
on conflict (nama) do nothing;


-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.transactions enable row level security;
alter table public.categories enable row level security;
alter table public.payment_methods enable row level security;

-- Kebijakan akses tabel profiles
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Kebijakan akses tabel books
drop policy if exists "books_select_own" on public.books;
create policy "books_select_own" on public.books
  for select using (auth.uid() = user_id);
drop policy if exists "books_select_admin" on public.books;
create policy "books_select_admin" on public.books
  for select using (public.is_admin());
-- Cek kepemilikan buku dilakukan lewat fungsi security definer (bukan subquery
-- langsung) karena subquery pada tabel yang sama di dalam ekspresi WITH CHECK
-- tunduk pada RLS pemanggil — bila baris induk "tidak terlihat" bagi pemanggil
-- saat evaluasi, INSERT ditolak dengan "new row violates row-level security
-- policy". Fungsi ini murni mengecek kepemilikan baris di bawah hak pemilik
-- tabel, sehingga hasilnya deterministik.
create or replace function public.book_owned_by(p_book_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.books
    where id = p_book_id and user_id = p_user_id
  );
$$;

drop policy if exists "books_insert_own" on public.books;
create policy "books_insert_own" on public.books
  for insert with check (
    auth.uid() = user_id
    and (parent_id is null or public.book_owned_by(parent_id, auth.uid()))
  );
drop policy if exists "books_update_own" on public.books;
create policy "books_update_own" on public.books
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (parent_id is null or public.book_owned_by(parent_id, auth.uid()))
  );
drop policy if exists "books_delete_own" on public.books;
create policy "books_delete_own" on public.books
  for delete using (auth.uid() = user_id);

-- Kebijakan akses tabel transactions
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);
drop policy if exists "transactions_select_admin" on public.transactions;
create policy "transactions_select_admin" on public.transactions
  for select using (public.is_admin());
drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id))
    and (payment_method_id is null or exists (select 1 from public.payment_methods p where p.id = payment_method_id))
  );
drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id))
    and (payment_method_id is null or exists (select 1 from public.payment_methods p where p.id = payment_method_id))
  );
drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

-- Kebijakan akses tabel categories (baca semua user login, tulis admin)
drop policy if exists "categories_select_authenticated" on public.categories;
create policy "categories_select_authenticated" on public.categories
  for select using (auth.role() = 'authenticated');
drop policy if exists "categories_insert_admin" on public.categories;
create policy "categories_insert_admin" on public.categories
  for insert with check (public.is_admin());
drop policy if exists "categories_update_admin" on public.categories;
create policy "categories_update_admin" on public.categories
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "categories_delete_admin" on public.categories;
create policy "categories_delete_admin" on public.categories
  for delete using (public.is_admin());

-- Kebijakan akses tabel payment_methods (baca semua user login, tulis admin)
drop policy if exists "payment_methods_select_authenticated" on public.payment_methods;
create policy "payment_methods_select_authenticated" on public.payment_methods
  for select using (auth.role() = 'authenticated');
drop policy if exists "payment_methods_insert_admin" on public.payment_methods;
create policy "payment_methods_insert_admin" on public.payment_methods
  for insert with check (public.is_admin());
drop policy if exists "payment_methods_update_admin" on public.payment_methods;
create policy "payment_methods_update_admin" on public.payment_methods
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "payment_methods_delete_admin" on public.payment_methods;
create policy "payment_methods_delete_admin" on public.payment_methods
  for delete using (public.is_admin());

-- ============================================================
-- Penjaga hierarki sub-pembukuan
--   * induk harus milik pengguna yang sama
--   * sebuah buku tidak boleh menjadi induk dirinya sendiri
--   * tidak boleh terbentuk siklus (dijamin oleh batas 2 level di bawah)
-- security definer dipakai agar pemeriksaan tidak terpengaruh
-- kebijakan RLS milik pengguna yang sedang menulis.
-- ============================================================

create or replace function public.books_guard_hierarchy()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Sebuah pembukuan tidak bisa menjadi induk dirinya sendiri';
  end if;

  if not exists (
    select 1 from public.books p
    where p.id = new.parent_id and p.user_id = new.user_id
  ) then
    raise exception 'Pembukuan induk tidak ditemukan atau bukan milik pengguna ini';
  end if;

  -- Maksimal 2 level: induk harus pembukuan utama. Pemeriksaan ini sekaligus
  -- membuat siklus hierarki mustahil terbentuk, sehingga telusur rekursif
  -- yang dipakai versi lama tidak diperlukan lagi.
  if exists (
    select 1 from public.books p
    where p.id = new.parent_id and p.parent_id is not null
  ) then
    raise exception 'Sub-pembukuan tidak bisa memiliki sub-pembukuan lagi (maksimal 2 level)';
  end if;

  return new;
end;
$$;

drop trigger if exists books_guard_hierarchy_trg on public.books;
create trigger books_guard_hierarchy_trg
  before insert or update of parent_id, user_id on public.books
  for each row execute procedure public.books_guard_hierarchy();

-- Buku default hanya boleh berupa pembukuan induk (bukan sub-pembukuan)
create or replace function public.books_default_root_only()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_default and new.parent_id is not null then
    raise exception 'Buku default harus berupa pembukuan utama (bukan sub-pembukuan)';
  end if;
  return new;
end;
$$;

drop trigger if exists books_default_root_only_trg on public.books;
create trigger books_default_root_only_trg
  before insert or update of is_default, parent_id on public.books
  for each row execute procedure public.books_default_root_only();

-- Rapikan kondisi lama: barang kali ada sub-pembukuan yang terlanjur default
update public.books set is_default = false where is_default and parent_id is not null;

-- ============================================================
-- Tambahan versi terbaru
--   * Sinkronisasi email profil
--   * Penjaga path lampiran nota
--   * Pohon pembukuan (book_subtree_ids)
--   * updated_at diisi server
-- ============================================================

-- ---------- Sinkronisasi email profil ----------
-- Trigger handle_new_user hanya berjalan saat pendaftaran; bila pengguna
-- mengganti emailnya di Auth, baris profil harus ikut dirapikan supaya
-- dashboard admin tidak menampilkan email lama.
create or replace function public.handle_user_email_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute procedure public.handle_user_email_update();

-- ---------- Penjaga path lampiran nota ----------
-- Dilakukan di trigger (bukan CHECK) supaya pesan kesalahannya jelas.
-- LAMPIRAN LAMA: periksa dulu dengan query berikut di SQL Editor, hasilnya
-- harus 0 sebelum bagian ini dijalankan. Bila ada, rapikan baris tersebut
-- (mis. set nota_path = null) karena lampirannya memang tidak bisa diakses.
--
--   select count(*) from public.transactions
--   where nota_path is not null
--     and nota_path not like user_id::text || '/' || book_id::text || '/%';
--
create or replace function public.transactions_guard_nota()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.nota_path is not null
     and new.nota_path not like new.user_id::text || '/' || new.book_id::text || '/%' then
    raise exception 'Path lampiran tidak valid (harus di folder pengguna & pembukuan ini)';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_guard_nota_trg on public.transactions;
create trigger transactions_guard_nota_trg
  before insert or update of nota_path, book_id, user_id on public.transactions
  for each row execute procedure public.transactions_guard_nota();

-- ---------- updated_at diisi server ----------
-- Aplikasi tidak lagi mengirim updated_at dari jam perangkat pengguna.
alter table public.transactions add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists books_touch_updated_at on public.books;
create trigger books_touch_updated_at
  before update on public.books
  for each row execute procedure public.touch_updated_at();

drop trigger if exists transactions_touch_updated_at on public.transactions;
create trigger transactions_touch_updated_at
  before update on public.transactions
  for each row execute procedure public.touch_updated_at();

-- ============================================================
-- Sub-pembukuan & alokasi dana
--
-- Model: saldo TIDAK disimpan sebagai kolom, melainkan selalu dihitung
-- dari transaksi (saldo_awal + pemasukan - pengeluaran + alokasi masuk -
-- alokasi keluar). Karena itu pemindahan dana ditulis sebagai DUA baris
-- transaksi tertaut (transfer_group) yang lahir dalam satu operasi atomik:
--   * baris 'keluar' pada pembukuan asal
--   * baris 'masuk' pada pembukuan tujuan
-- Dengan begitu saldo induk & sub-pembukuan selalu konsisten tanpa proses
-- sinkronisasi, dan menghapus salah satu sisi selalu menghapus pasangannya.
--
-- Aturan yang ditegakkan di sini:
--   1. Hierarki maksimal 2 level (induk -> pos). Aturan ini sekaligus
--      membuat siklus hierarki mustahil.
--   2. Pos selalu mulai dari saldo_awal 0 (dana masuk lewat alokasi).
--   3. Saldo pos tidak boleh minus.
--   4. Pembukuan tidak bisa dihapus bila masih punya pos atau saldonya != 0.
--   5. Baris 'alokasi' hanya bisa ditulis/diubah/dihapus lewat RPC
--      (policy RLS mengecualikan jenis ini), sehingga pasangannya tidak
--      pernah tercerai.
--   6. Pos yang sudah ditutup tidak bisa dicatat lagi (termasuk alokasi
--      dana) sampai dibuka kembali; sisa dananya sudah dikembalikan ke
--      induk saat penutupan.
-- ============================================================

-- ---------- 1. Hierarki: maksimal 2 level ----------
-- Periksa dulu apakah ada data lama dengan kedalaman 3 level atau lebih.
-- (Antarmuka lama belum pernah menyediakan pembuatan sub-pembukuan, jadi
-- idealnya tidak ada; blok ini hanya jaring pengaman.)
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.books b
  join public.books p on p.id = b.parent_id
  where p.parent_id is not null;

  if v_bad > 0 then
    raise exception 'Ada % pembukuan dengan kedalaman 3 level atau lebih. Pindahkan dulu ke induk utama sebelum menjalankan skrip ini.', v_bad;
  end if;
end $$;

-- Aturan hierarkinya sendiri ditegakkan oleh public.books_guard_hierarchy()
-- yang diperbarui di bagian "Penjaga hierarki sub-pembukuan" di atas
-- (induk wajib pembukuan utama → kedalaman maksimal 2 level, siklus mustahil).

-- ---------- 2. Kolom alokasi pada tabel transactions ----------
alter table public.transactions add column if not exists transfer_group uuid;
alter table public.transactions add column if not exists transfer_direction text;
alter table public.transactions add column if not exists transfer_pair_book_id uuid
  references public.books(id) on delete set null;

create index if not exists transactions_transfer_group_idx
  on public.transactions(transfer_group) where transfer_group is not null;

comment on column public.transactions.transfer_group is
  'Penanda pasangan baris alokasi; kedua sisi (keluar & masuk) memakai uuid yang sama';
comment on column public.transactions.transfer_direction is
  'Arah baris alokasi: keluar (buku asal) atau masuk (buku tujuan)';
comment on column public.transactions.transfer_pair_book_id is
  'Buku pasangan pada satu alokasi (asal dilihat dari baris tujuan, dan sebaliknya)';

-- Jenis transaksi: tambah 'alokasi'. Constraint lama dibuat inline oleh
-- Postgres tanpa nama pasti, jadi dicari lewat pg_constraint supaya skrip
-- tetap idempotent walau penamaannya berbeda.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%pemasukan%'
  loop
    execute format('alter table public.transactions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('pemasukan', 'pengeluaran', 'alokasi'));

-- Kolom pasangan alokasi wajib terisi tepat ketika jenisnya 'alokasi'
alter table public.transactions drop constraint if exists transactions_transfer_fields_check;
alter table public.transactions add constraint transactions_transfer_fields_check
  check (
    (type = 'alokasi'
      and transfer_group is not null
      and transfer_pair_book_id is not null
      and transfer_direction in ('keluar', 'masuk'))
    or
    (type <> 'alokasi'
      and transfer_group is null
      and transfer_direction is null
      and transfer_pair_book_id is null)
  );

-- ---------- 3. Satu tempat untuk hitungan saldo ----------
-- Dipakai ulang oleh penjaga trigger dan RPC alokasi supaya rumus saldo
-- tidak pernah berbeda antar jalur penulisan.
create or replace function public.book_balance(p_book_id uuid, p_user_id uuid)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select b.saldo_awal
       + coalesce(sum(case when t.type = 'pemasukan' then t.jumlah else 0 end), 0)
       + coalesce(sum(case when t.type = 'alokasi' and t.transfer_direction = 'masuk' then t.jumlah else 0 end), 0)
       - coalesce(sum(case when t.type = 'pengeluaran' then t.jumlah else 0 end), 0)
       - coalesce(sum(case when t.type = 'alokasi' and t.transfer_direction = 'keluar' then t.jumlah else 0 end), 0)
  from public.books b
  left join public.transactions t on t.book_id = b.id
  where b.id = p_book_id and b.user_id = p_user_id
  group by b.saldo_awal;
$$;

-- Saldo seluruh pembukuan milik pengguna yang sedang masuk, dalam satu
-- permintaan: dipakai antarmuka untuk hero "Total Kas Bersih" & kartu pos.
create or replace function public.my_book_balances()
returns table (book_id uuid, saldo numeric)
language sql
stable
security definer set search_path = public
as $$
  select b.id, coalesce(public.book_balance(b.id, b.user_id), b.saldo_awal)
  from public.books b
  where b.user_id = auth.uid();
$$;

-- ---------- 4. Pos wajib mulai dari saldo awal 0 ----------
-- Dana masuk ke pos hanya lewat alokasi, supaya Total Kas Bersih tidak
-- bertambah hanya karena membuat pos baru.
create or replace function public.books_guard_pos_saldo_awal()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.parent_id is not null and coalesce(new.saldo_awal, 0) <> 0 then
    raise exception 'Sub-pembukuan harus mulai dari saldo awal Rp0; pindahkan dananya lewat Alokasi Dana.';
  end if;
  return new;
end;
$$;

drop trigger if exists books_guard_pos_saldo_awal_trg on public.books;
create trigger books_guard_pos_saldo_awal_trg
  before insert or update of saldo_awal, parent_id on public.books
  for each row execute procedure public.books_guard_pos_saldo_awal();

-- ---------- 5. Saldo pos tidak boleh minus ----------
-- Berlaku untuk baris yang MENGURANGI saldo (pengeluaran & alokasi keluar)
-- pada buku yang punya induk. Kas induk sengaja tidak dijaga: pencatatan
-- pengeluaran di sana tetap bebas seperti sebelumnya, sedangkan alokasi
-- keluar dari induk sudah divalidasi di RPC allocate_funds.
create or replace function public.transactions_guard_pos_balance()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_parent uuid;
  v_saldo numeric;
  v_locked integer;
begin
  if new.type <> 'pengeluaran'
     and not (new.type = 'alokasi' and new.transfer_direction = 'keluar') then
    return new;
  end if;

  select parent_id into v_parent from public.books where id = new.book_id;
  if v_parent is null then
    return new;
  end if;

  -- Kunci baris buku: menghitung saldo lalu menulis tidak boleh balapan
  select 1 into v_locked from public.books where id = new.book_id for update;

  v_saldo := coalesce(public.book_balance(new.book_id, new.user_id), 0);

  -- Saat mengubah baris yang sudah ada, efek baris lama dikeluarkan dulu
  if tg_op = 'UPDATE'
     and old.book_id = new.book_id
     and (old.type = 'pengeluaran' or (old.type = 'alokasi' and old.transfer_direction = 'keluar')) then
    v_saldo := v_saldo + old.jumlah;
  end if;

  if v_saldo - new.jumlah < 0 then
    raise exception 'Saldo pos tidak mencukupi (tersedia Rp%). Kurangi nominalnya atau alokasikan dana dulu.',
      to_char(v_saldo, 'FM999,999,999,999');
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_guard_pos_balance_trg on public.transactions;
create trigger transactions_guard_pos_balance_trg
  before insert or update on public.transactions
  for each row execute procedure public.transactions_guard_pos_balance();

-- ---------- 6. Pembukuan tidak bisa dihapus sembarangan ----------
-- FK diubah dari cascade ke restrict: menghapus induk tidak lagi menyeret
-- sub-pembukuan beserta transaksinya tanpa disadari.
alter table public.books drop constraint if exists books_parent_id_fkey;
alter table public.books add constraint books_parent_id_fkey
  foreign key (parent_id) references public.books(id) on delete restrict;

create or replace function public.books_guard_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_anak integer;
  v_saldo numeric;
begin
  select count(*) into v_anak from public.books where parent_id = old.id;
  if v_anak > 0 then
    raise exception 'Pembukuan ini masih punya % sub-pembukuan. Hapus atau pindahkan sub-pembukuan itu dulu.', v_anak;
  end if;

  -- Pos yang sudah ditutup dibuka kembali dulu agar penghapusan selalu
  -- didahului keputusan sadar dari pengguna.
  if old.closed_at is not null then
    raise exception 'Pos ini sudah ditutup. Buka kembali dulu sebelum menghapusnya.';
  end if;

  v_saldo := coalesce(public.book_balance(old.id, old.user_id), 0);
  if v_saldo <> 0 then
    raise exception 'Saldo pembukuan masih Rp%. Kosongkan dulu (tarik dana atau sesuaikan saldonya) sebelum dihapus.',
      to_char(v_saldo, 'FM999,999,999,999');
  end if;

  return old;
end;
$$;

drop trigger if exists books_guard_delete_trg on public.books;
create trigger books_guard_delete_trg
  before delete on public.books
  for each row execute procedure public.books_guard_delete();

-- ---------- 7. RPC alokasi dana (atomik) ----------
-- Satu panggilan = dua baris transaksi tertaut. Validasi dilakukan di dalam
-- fungsi memakai auth.uid() (klien tidak boleh mengirim identitas pengguna).
create or replace function public.allocate_funds(
  p_from_book_id uuid,
  p_to_book_id uuid,
  p_amount numeric,
  p_date date,
  p_description text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from public.books;
  v_to public.books;
  v_saldo numeric;
  v_group uuid := gen_random_uuid();
  v_amount numeric := coalesce(p_amount, 0);
  v_date date := coalesce(p_date, current_date);
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_locked integer;
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan masuk ulang.';
  end if;

  if v_amount <= 0 then
    raise exception 'Nominal alokasi harus lebih dari Rp0.';
  end if;

  if p_from_book_id = p_to_book_id then
    raise exception 'Pembukuan asal dan tujuan tidak boleh sama.';
  end if;

  -- Kunci kedua baris dengan urutan tetap (id) supaya dua alokasi berlawanan
  -- arah tidak saling mengunci sampai deadlock.
  select 1 into v_locked from public.books
   where id = least(p_from_book_id, p_to_book_id) and user_id = v_uid for update;
  select 1 into v_locked from public.books
   where id = greatest(p_from_book_id, p_to_book_id) and user_id = v_uid for update;

  select * into v_from from public.books where id = p_from_book_id and user_id = v_uid;
  if not found then
    raise exception 'Pembukuan asal tidak ditemukan atau bukan milik pengguna ini.';
  end if;

  select * into v_to from public.books where id = p_to_book_id and user_id = v_uid;
  if not found then
    raise exception 'Pembukuan tujuan tidak ditemukan atau bukan milik pengguna ini.';
  end if;

  -- Hanya induk <-> sub-pembukuan dalam satu pohon yang boleh dipindahi dana
  if v_to.parent_id is distinct from v_from.id and v_from.parent_id is distinct from v_to.id then
    raise exception 'Alokasi hanya bisa antara pembukuan induk dan sub-pembukuan di bawahnya.';
  end if;

  v_saldo := coalesce(public.book_balance(p_from_book_id, v_uid), 0);
  if v_saldo - v_amount < 0 then
    raise exception 'Saldo % tidak mencukupi (tersedia Rp%).', v_from.nama, to_char(v_saldo, 'FM999,999,999,999');
  end if;

  insert into public.transactions
    (user_id, book_id, type, date, keterangan, jumlah, transfer_group, transfer_direction, transfer_pair_book_id)
  values
    (v_uid, p_from_book_id, 'alokasi', v_date, coalesce(v_desc, 'Alokasi ke ' || v_to.nama),
     v_amount, v_group, 'keluar', p_to_book_id),
    (v_uid, p_to_book_id, 'alokasi', v_date, coalesce(v_desc, 'Alokasi dari ' || v_from.nama),
     v_amount, v_group, 'masuk', p_from_book_id);

  return v_group;
end;
$$;

-- ---------- 8. RPC pembatalan alokasi (hapus kedua sisi) ----------
-- Menghapus satu sisi saja akan menciptakan atau menghilangkan uang, jadi
-- pembatalan selalu menghapus sepasang baris. Ditolak bila dana di sisi
-- penerima sudah terpakai (saldo tidak cukup untuk dikurangi).
create or replace function public.delete_allocation(p_transaction_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
  v_masuk public.transactions;
  v_saldo numeric;
  v_locked integer;
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan masuk ulang.';
  end if;

  select t.transfer_group into v_group
  from public.transactions t
  where t.id = p_transaction_id and t.user_id = v_uid;

  if v_group is null then
    raise exception 'Catatan alokasi tidak ditemukan atau bukan milik pengguna ini.';
  end if;

  select * into v_masuk from public.transactions
   where transfer_group = v_group and transfer_direction = 'masuk';
  if not found then
    raise exception 'Pasangan alokasi tidak lengkap; hubungi admin.';
  end if;

  select 1 into v_locked from public.books where id = v_masuk.book_id for update;
  v_saldo := coalesce(public.book_balance(v_masuk.book_id, v_uid), 0);

  if v_saldo - v_masuk.jumlah < 0 then
    raise exception 'Saldo % tidak cukup untuk membatalkan alokasi ini (tersedia Rp%). Tarik dana dulu, atau hapus catatan pengeluarannya.',
      (select nama from public.books where id = v_masuk.book_id),
      to_char(v_saldo, 'FM999,999,999,999');
  end if;

  delete from public.transactions
   where transfer_group = v_group and user_id = v_uid;

  return v_group;
end;
$$;

-- ---------- 9. RLS: baris alokasi hanya boleh lahir/hilang lewat RPC ----------
-- Kalau klien bisa menulis baris 'alokasi' langsung, pasangan barisnya bisa
-- tercerai dan saldo bisa diubah tanpa jejak. Karena itu jenis ini
-- dikecualikan dari policy tulis, dan hanya RPC di atas (security definer)
-- yang boleh membuat/menghapusnya.
drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert with check (
    auth.uid() = user_id
    and type <> 'alokasi'
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id))
    and (payment_method_id is null or exists (select 1 from public.payment_methods p where p.id = payment_method_id))
  );

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id and type <> 'alokasi')
  with check (
    auth.uid() = user_id
    and type <> 'alokasi'
    and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id))
    and (payment_method_id is null or exists (select 1 from public.payment_methods p where p.id = payment_method_id))
  );

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id and type <> 'alokasi');

-- ---------- 10. Hak eksekusi fungsi ----------
-- Hitungan saldo per buku hanya dipakai di dalam database (penjaga & RPC),
-- jadi tidak perlu dibuka ke klien. Bookkeeping RPC hanya untuk pengguna
-- yang sudah masuk.
revoke execute on function public.book_balance(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.my_book_balances() from public, anon;
revoke execute on function public.allocate_funds(uuid, uuid, numeric, date, text) from public, anon;
revoke execute on function public.delete_allocation(uuid) from public, anon;

grant execute on function public.my_book_balances() to authenticated;
grant execute on function public.allocate_funds(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function public.delete_allocation(uuid) to authenticated;

-- ---------- 11. Tutup buku pos (sisa dana kembali ke induk) ----------
-- Sebuah pos bisa "ditutup": sisa dananya dipindahkan kembali ke induk lewat
-- RPC alokasi yang sama (dua baris tertaut), lalu posnya dikunci read-only
-- sampai dibuka kembali. Urutannya penting — baris alokasi ditulis LEBIH
-- DULU, baru closed_at diisi — supaya penjaga di bawah tidak memblokir RPC
-- penutupnya sendiri.

-- Penjaga: pos tertutup tidak menerima catatan baru, perubahan, atau
-- penghapusan (termasuk baris alokasi).
create or replace function public.transactions_guard_closed_book()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_tutup timestamptz;
  v_nama text;
begin
  if tg_op <> 'DELETE' then
    select b.closed_at, b.nama into v_tutup, v_nama
    from public.books b where b.id = new.book_id;
    if v_tutup is not null then
      raise exception 'Pos % sudah ditutup pada %. Buka kembali dulu untuk mengubah catatannya.',
        v_nama, to_char(v_tutup, 'DD-MM-YYYY');
    end if;
  end if;

  -- Saat baris yang sudah ada dipindah ke buku lain, buku asalnya juga diperiksa
  if tg_op = 'UPDATE' and old.book_id is distinct from new.book_id then
    select b.closed_at, b.nama into v_tutup, v_nama
    from public.books b where b.id = old.book_id;
    if v_tutup is not null then
      raise exception 'Pos % sudah ditutup pada %. Buka kembali dulu untuk memindahkan catatannya.',
        v_nama, to_char(v_tutup, 'DD-MM-YYYY');
    end if;
  end if;

  if tg_op = 'DELETE' then
    select b.closed_at, b.nama into v_tutup, v_nama
    from public.books b where b.id = old.book_id;
    if v_tutup is not null then
      raise exception 'Pos % sudah ditutup pada %. Buka kembali dulu untuk menghapus catatannya.',
        v_nama, to_char(v_tutup, 'DD-MM-YYYY');
    end if;
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_guard_closed_book_trg on public.transactions;
create trigger transactions_guard_closed_book_trg
  before insert or update or delete on public.transactions
  for each row execute procedure public.transactions_guard_closed_book();

-- Tutup pos: sisa dana dikembalikan ke induk (satu alokasi atomik) lalu pos
-- ditandai tertutup. Satu panggilan = satu transaksi database, jadi tidak ada
-- langkah yang setengah jalan.
create or replace function public.close_sub_book(
  p_book_id uuid,
  p_date date default current_date,
  p_description text default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pos public.books;
  v_sisa numeric;
  v_group uuid := null;
  v_date date := coalesce(p_date, current_date);
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_locked integer;
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan masuk ulang.';
  end if;

  select * into v_pos from public.books
   where id = p_book_id and user_id = v_uid;
  if not found then
    raise exception 'Pos tidak ditemukan atau bukan milik pengguna ini.';
  end if;

  if v_pos.parent_id is null then
    raise exception 'Hanya pos (sub-pembukuan) yang bisa ditutup.';
  end if;

  -- Kunci kedua baris dengan urutan tetap (sama seperti allocate_funds) supaya
  -- dua operasi berlawanan arah tidak saling mengunci sampai deadlock.
  select 1 into v_locked from public.books
   where id = least(p_book_id, v_pos.parent_id) for update;
  select 1 into v_locked from public.books
   where id = greatest(p_book_id, v_pos.parent_id) for update;

  -- Dibaca ulang setelah terkunci: status tutup bisa berubah oleh permintaan lain
  select * into v_pos from public.books
   where id = p_book_id and user_id = v_uid;
  if v_pos.closed_at is not null then
    raise exception 'Pos % sudah ditutup.', v_pos.nama;
  end if;

  v_sisa := coalesce(public.book_balance(p_book_id, v_uid), 0);
  if v_sisa < 0 then
    raise exception 'Saldo pos % minus (Rp%). Rapikan catatannya dulu sebelum ditutup.',
      v_pos.nama, to_char(v_sisa, 'FM999,999,999,999');
  end if;

  -- Sisa dana kembali ke induk. Sisanya Rp0 berarti tidak ada yang dipindahkan.
  if v_sisa > 0 then
    v_group := public.allocate_funds(
      p_book_id,
      v_pos.parent_id,
      v_sisa,
      v_date,
      coalesce(v_desc, 'Penutupan pos ' || v_pos.nama)
    );
  end if;

  update public.books set closed_at = now() where id = p_book_id;

  return v_group;
end;
$$;

-- Buka kembali pos. Dana yang sudah dikembalikan ke induk TIDAK ditarik
-- otomatis: pakai alokasi "Tambah Dana" bila pos perlu diisi lagi.
create or replace function public.reopen_sub_book(p_book_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pos public.books;
  v_locked integer;
begin
  if v_uid is null then
    raise exception 'Sesi tidak ditemukan. Silakan masuk ulang.';
  end if;

  select 1 into v_locked from public.books
   where id = p_book_id and user_id = v_uid for update;
  if not found then
    raise exception 'Pos tidak ditemukan atau bukan milik pengguna ini.';
  end if;

  select * into v_pos from public.books where id = p_book_id;
  if v_pos.closed_at is null then
    raise exception 'Pos % belum ditutup.', v_pos.nama;
  end if;

  update public.books set closed_at = null where id = p_book_id;
end;
$$;

-- Hak eksekusi kedua RPC di atas. Harus berada SETELAH definisinya: Postgres
-- menolak GRANT/REVOKE untuk fungsi yang belum ada
-- (ERROR 42883: function ... does not exist).
revoke execute on function public.close_sub_book(uuid, date, text) from public, anon;
revoke execute on function public.reopen_sub_book(uuid) from public, anon;

grant execute on function public.close_sub_book(uuid, date, text) to authenticated;
grant execute on function public.reopen_sub_book(uuid) to authenticated;

-- ============================================================
-- Pembersihan: fungsi yang tidak lagi dipakai
-- book_subtree_ids dulu dipakai aplikasi untuk membersihkan lampiran
-- seluruh pohon sebelum buku induk dihapus. Aturan hapus sekarang
-- membatasi hal itu di database (buku berisi sub-pembukuan tidak bisa
-- dihapus), jadi fungsinya tidak punya pemakai lagi dan dibuang agar
-- tidak menumpuk sebagai kode mati.
-- ============================================================
drop function if exists public.book_subtree_ids(uuid);

-- ============================================================
-- Setelah menjalankan script ini dan mendaftar akun pertama kamu,
-- jadikan akun itu admin dengan menjalankan (ganti email-nya):
--
--   update public.profiles set role = 'admin' where email = 'email-kamu@contoh.com';
--
-- Kalau akun kamu sudah lebih dulu daftar sebelum tabel profiles
-- ada, isi dulu profil yang terlewat dengan:
--
--   insert into public.profiles (id, email)
--   select id, email from auth.users
--   where id not in (select id from public.profiles);
-- ============================================================

