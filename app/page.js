"use client";

import { useMemo, useState } from "react";

const stores = ["Semua Store", "Yanit Agro", "Bos Ragi", "Yanit Barokah", "Zam Zam Herbal"];
const transactions = [
  { no: "SAL-20260825-0004", store: "Yanit Agro", channel: "Shopee", amount: 485000, status: "Selesai", time: "10:42" },
  { no: "SAL-20260825-0003", store: "Bos Ragi", channel: "Offline Store", amount: 178000, status: "Selesai", time: "09:18" },
  { no: "SAL-20260825-0002", store: "Zam Zam Herbal", channel: "TikTok Shop", amount: 320000, status: "Selesai", time: "08:55" },
  { no: "SAL-20260825-0001", store: "Yanit Barokah", channel: "WhatsApp", amount: 95000, status: "Selesai", time: "08:20" }
];
const lowStock = [
  { name: "Madu Hitam Pahit 500 ml", sku: "MDH-500", stock: 5, min: 10, state: "Menipis" },
  { name: "Ragi Instan 11 gr", sku: "RGI-011", stock: 0, min: 20, state: "Habis" },
  { name: "Herbal Jahe Merah", sku: "HJM-250", stock: 8, min: 15, state: "Menipis" }
];
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export default function Home() {
  const [store, setStore] = useState(stores[0]);
  const [period, setPeriod] = useState("Hari ini");
  const [menuOpen, setMenuOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const kpis = useMemo(() => [
    { label: "Penjualan Kotor", value: 1250000, icon: "↗", tone: "blue" },
    { label: "Total Potongan", value: 75000, icon: "−", tone: "orange" },
    { label: "Penjualan Bersih", value: 1175000, icon: "✓", tone: "green" },
    { label: "HPP", value: 620000, icon: "◫", tone: "purple" },
    { label: "Laba Kotor", value: 555000, icon: "↗", tone: "teal" },
    { label: "Biaya Operasional", value: 185000, icon: "◌", tone: "red" },
    { label: "Laba Bersih", value: 370000, icon: "✦", tone: "dark" }
  ], []);
  return (
    <main className="shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand"><span className="brandMark">Y</span><div><b>Yanit Group</b><small>Management System</small></div></div>
        <nav>
          <p>MENU UTAMA</p><a className="active">▦ <span>Dashboard</span></a>
          <a>▣ <span>Penjualan</span></a><a>▤ <span>Pembelian</span></a><a>▥ <span>Inventory & Stok</span></a><a>◫ <span>Biaya Operasional</span></a>
          <p>MASTER DATA</p><a>◈ <span>Produk</span></a><a>◇ <span>Supplier</span></a><a>⌂ <span>Store & Gudang</span></a><a>▤ <span>Laporan</span></a>
        </nav>
        <div className="user"><div className="avatar">A</div><div><b>Admin Yanit</b><small>Administrator</small></div><span>⌄</span></div>
      </aside>
      <section className="content">
        <header><button className="menuBtn" onClick={() => setMenuOpen(!menuOpen)}>☰</button><div><h1>Dashboard</h1><p>Ringkasan bisnis Anda hari ini.</p></div><button className="primary" onClick={() => setSaleOpen(true)}>＋ Penjualan Offline</button></header>
        <div className="filters"><div className="filterGroup"><button className="dateButton">◷ {period} <span>⌄</span></button><div className="periods">{["Hari ini", "Kemarin", "Minggu ini", "Bulan ini"].map(x => <button className={period === x ? "selected" : ""} onClick={() => setPeriod(x)} key={x}>{x}</button>)}</div></div><select value={store} onChange={e => setStore(e.target.value)}>{stores.map(x => <option key={x}>{x}</option>)}</select></div>
        <section className="kpis">{kpis.map((k) => <article className={`kpi ${k.tone}`} key={k.label}><div className="kpiTop"><span>{k.label}</span><i>{k.icon}</i></div><strong>{money.format(k.value)}</strong>{k.label === "Laba Bersih" && <small className="up">↑ 18,5% dari kemarin</small>}</article>)}</section>
        <section className="grid two"><article className="panel chart"><div className="panelHead"><div><h2>Penjualan 7 Hari Terakhir</h2><p>Penjualan bersih</p></div><button>⋯</button></div><div className="chartBody"><div className="yAxis"><span>1 jt</span><span>750 rb</span><span>500 rb</span><span>250 rb</span><span>0</span></div><div className="bars">{[38, 56, 43, 77, 63, 48, 86].map((h, i) => <div className="barCol" key={i}><i style={{height: `${h}%`}}></i><small>{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][i]}</small></div>)}</div></div></article><article className="panel"><div className="panelHead"><div><h2>Penjualan per Channel</h2><p>Hari ini</p></div><button>⋯</button></div><div className="donutRow"><div className="donut"><b>1,25 jt</b><small>Total</small></div><div className="legend"><p><i className="dot blueDot"/>Shopee <b>42%</b></p><p><i className="dot violetDot"/>TikTok Shop <b>25%</b></p><p><i className="dot amberDot"/>Offline <b>21%</b></p><p><i className="dot grayDot"/>Lainnya <b>12%</b></p></div></div></article></section>
        <section className="grid lower"><article className="panel tablePanel"><div className="panelHead"><div><h2>Transaksi Terbaru</h2><p>Penjualan hari ini</p></div><button className="link">Lihat semua →</button></div><div className="tableWrap"><table><thead><tr><th>NO. TRANSAKSI</th><th>STORE / CHANNEL</th><th>WAKTU</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>{transactions.map(t => <tr key={t.no}><td><b>{t.no}</b></td><td><span>{t.store}</span><small>{t.channel}</small></td><td>{t.time}</td><td><b>{money.format(t.amount)}</b></td><td><em>{t.status}</em></td></tr>)}</tbody></table></div></article><article className="panel stockPanel"><div className="panelHead"><div><h2>Stok Perlu Perhatian</h2><p>Segera cek dan lakukan pembelian.</p></div><button className="link">Lihat stok →</button></div>{lowStock.map(p => <div className="stockItem" key={p.sku}><div className="productIcon">□</div><div className="stockName"><b>{p.name}</b><small>{p.sku}</small></div><div><strong className={p.stock === 0 ? "danger" : "warning"}>{p.stock} unit</strong><small>Min. {p.min}</small></div></div>)}</article></section>
      </section>
      {saleOpen && <SaleModal close={() => setSaleOpen(false)} />}
    </main>
  );
}

function SaleModal({ close }) {
  const [qty, setQty] = useState(1); const [price, setPrice] = useState(45000); const [discount, setDiscount] = useState(0);
  const total = Math.max(0, qty * price - discount);
  return <div className="modalOverlay"><div className="modal"><div className="modalHead"><div><h2>Penjualan Offline Baru</h2><p>Isi data, lalu simpan transaksi.</p></div><button onClick={close}>×</button></div><div className="form"><label>Store<select defaultValue="Yanit Agro"><option>Yanit Agro</option><option>Bos Ragi</option><option>Yanit Barokah</option><option>Zam Zam Herbal</option></select></label><label>Produk<select><option>Madu Hitam Pahit 500 ml</option><option>Ragi Instan 11 gr</option><option>Herbal Jahe Merah</option></select></label><div className="formRow"><label>Jumlah<input type="number" min="1" value={qty} onChange={e => setQty(Number(e.target.value))}/></label><label>Harga jual<input type="number" min="0" value={price} onChange={e => setPrice(Number(e.target.value))}/></label></div><label>Diskon (opsional)<input type="number" min="0" value={discount} onChange={e => setDiscount(Number(e.target.value))}/></label><label>Metode Pembayaran<select><option>Tunai</option><option>Transfer Bank</option><option>QRIS</option></select></label><div className="total"><span>Total pembayaran</span><strong>{money.format(total)}</strong></div></div><div className="modalActions"><button className="secondary" onClick={close}>Batal</button><button className="primary" onClick={close}>Simpan Penjualan</button></div></div></div>;
}
