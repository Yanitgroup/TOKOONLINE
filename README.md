# Yanit Group Management — Full App

Versi ini mengubah dashboard mockup menjadi aplikasi management toko yang memiliki modul:

- Dashboard KPI dan stok perlu perhatian
- Penjualan offline
- Pembelian
- Inventory & stok
- Biaya operasional
- Produk
- Supplier
- Store & gudang
- Laporan + print + export CSV
- Mode lokal (`localStorage`) agar aplikasi tetap bisa dipakai tanpa Supabase
- Mode Supabase via `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Jalankan

```bash
pnpm install
pnpm dev
```

## Supabase

1. Jalankan migration awal yang sudah ada di repo.
2. Jalankan `supabase/migrations/202608250002_app_completion.sql`.
3. Pastikan seed dasar sudah dijalankan.
4. Salin `.env.example` menjadi `.env.local` lalu isi URL dan anon key.
5. `pnpm build` untuk verifikasi build.

## Catatan arsitektur

Schema awal repo sudah memiliki inventory movement dan inventory balance. Migration tambahan menambah dokumen pembelian dan view stok/laporan. Untuk lingkungan produksi, posting pembelian dan penjualan sebaiknya dipindahkan ke PostgreSQL RPC/transaction sehingga insert dokumen + mutasi + saldo stok benar-benar atomik dan tidak dapat menghasilkan stok setengah tersimpan.

## Tujuan lanjutan produksi

- Auth + role/permission berbasis Supabase Auth
- RLS seluruh tabel
- RPC transaksi penjualan/pembelian atomik
- Barcode scanner
- Stock opname
- Transfer antar-gudang
- HPP moving-average/FIFO yang konsisten
- Audit log server-side
- Upload attachment biaya/pembelian
