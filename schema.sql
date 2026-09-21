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
create or replace function public.is_admin()
returns boolean
language sql
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
--   * tidak boleh terbentuk siklus (induk tidak boleh turunan dari
--     baris ini, mis. A → B → A)
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

  -- Telusuri ke atas dari calon induk: bila bertemu baris ini, berarti siklus
  if exists (
    with recursive up as (
      select b.id, b.parent_id from public.books b where b.id = new.parent_id
      union all
      select b.id, b.parent_id
      from public.books b
      join up on b.id = up.parent_id
    )
    select 1 from up where id = new.id
  ) then
    raise exception 'Pembukuan tidak bisa dipindah ke dalam sub-pembukuan miliknya sendiri';
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

