# Instruksi Codex — Finalisasi TOKOONLINE

Repository target: `Yanitgroup/TOKOONLINE`

## Tujuan
Ubah aplikasi dashboard mockup menjadi aplikasi management toko yang benar-benar operasional.

## Source of truth
File dalam folder ini adalah baseline implementasi baru. Pertahankan migration awal repository dan tambahkan:
`supabase/migrations/202608250002_app_completion.sql`

## Perubahan wajib
1. Replace `app/page.js`, `app/globals.css`, `app/layout.js` dengan versi pada bundle ini.
2. Add `lib/db.js`.
3. Add `.env.example`.
4. Add migration `202608250002_app_completion.sql`.
5. Pertahankan `supabase/migrations/202608250001_initial_schema.sql` dan `supabase/seed.sql`.
6. Install dependency dari `package.json` bila package version berbeda.
7. Jalankan `pnpm build`.
8. Perbaiki error compile/runtime yang muncul.
9. Jangan menghapus data Supabase existing.
10. Setelah build lolos, commit dengan message: `feat: complete yanit group management app` dan push ke branch kerja/PR.

## Target modul
- Dashboard
- Penjualan
- Pembelian
- Inventory & Stok
- Biaya Operasional
- Produk
- Supplier
- Store & Gudang
- Laporan

## Standar produksi yang masih perlu diterapkan setelah baseline ini
- Supabase Auth + role/permission
- RLS semua tabel
- PostgreSQL RPC atomik untuk posting penjualan/pembelian
- Stock opname
- transfer antar-gudang
- HPP moving average/FIFO
- barcode scanning
- audit log server-side
- attachment storage

## Konteks penting
Versi lama hanya berisi hard-coded dashboard dan modal penjualan yang tidak menyimpan transaksi. Schema database sudah memiliki inventory movement, inventory balance, sales, suppliers, warehouses, products, expenses dan audit logs. Baseline ini menyambungkan UI ke model data dan menyediakan localStorage fallback.
