"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadLocal, saveLocal, money, csv, isRemote,
  apiList, apiInsert, apiDelete, apiRpc
} from "@/lib/db";

const menu = [
  ["dashboard","Dashboard","▦"],
  ["sales","Penjualan","▣"],
  ["purchases","Pembelian","▤"],
  ["inventory","Inventory & Stok","▥"],
  ["expenses","Biaya Operasional","◫"],
  ["products","Produk","◈"],
  ["suppliers","Supplier","◇"],
  ["warehouse","Store & Gudang","⌂"],
  ["reports","Laporan","▤"]
];

const today = () => new Date().toISOString().slice(0, 10);
const makeNo = (prefix, length) =>
  `${prefix}-${today().replaceAll("-", "")}-${String(length + 1).padStart(4, "0")}`;

function lineTotal(line) {
  return Math.max(0, Number(line.qty || 0) * Number(line.price || line.cost || 0));
}

function normalizeRemote(base, lists) {
  const stores = (lists.business_units || [])
    .filter(x => x.unit_type === "store")
    .map(x => ({ id: x.id, code: x.code, name: x.name, type: x.unit_type }));

  const stockMap = new Map((lists.v_product_stock || []).map(x => [x.id, x]));

  return {
    ...base,
    stores,
    categories: lists.product_categories || [],
    units: lists.units || [],
    channels: lists.sales_channels || base.channels,
    payments: lists.payment_methods || base.payments,
    expenseCategories: lists.expense_categories || [],
    products: (lists.products || []).map(x => {
      const s = stockMap.get(x.id);
      return {
        id: x.id,
        sku: x.sku,
        name: x.name,
        categoryId: x.category_id,
        unitId: x.unit_id,
        price: Number(x.default_selling_price || 0),
        cost: Number(x.cost || 0),
        min: Number(x.reorder_min_qty || 0),
        stock: Number(s?.stock_qty || 0),
        location: s?.sample_location || "",
        active: x.is_active
      };
    }),
    suppliers: (lists.suppliers || []).map(x => ({
      ...x, active: x.is_active, contact: x.contact_person
    })),
    warehouses: (lists.warehouses || []).map(x => ({
      id: x.id, storeId: x.business_unit_id, code: x.code, name: x.name
    })),
    sales: lists.sales || [],
    purchases: lists.purchases || [],
    expenses: lists.expenses || [],
    movements: lists.inventory_movements || []
  };
}

export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState(loadLocal());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [period, setPeriod] = useState("today");

  useEffect(() => {
    (async () => {
      try {
        if (isRemote()) {
          const tables = {
            business_units: "select=*&order=code.asc",
            products: "select=*",
            v_product_stock: "select=*",
            suppliers: "select=*&order=name.asc",
            warehouses: "select=*",
            sales: "select=*&order=transaction_date.desc",
            purchases: "select=*&order=purchase_date.desc",
            expenses: "select=*&order=expense_date.desc",
            inventory_movements: "select=*&order=occurred_at.desc",
            product_categories: "select=*",
            units: "select=*",
            expense_categories: "select=*&order=name.asc",
            sales_channels: "select=*&order=name.asc",
            payment_methods: "select=*&order=name.asc"
          };
          const entries = await Promise.all(
            Object.entries(tables).map(async ([t, q]) => [t, await apiList(t, q)])
          );
          setData(normalizeRemote(data, Object.fromEntries(entries)));
        }
      } catch (e) {
        setToast(`Mode lokal: ${e.message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const notify = (message) => {
    setToast(message);
    window.clearTimeout(window.__yanitToast);
    window.__yanitToast = window.setTimeout(() => setToast(""), 2800);
  };

  const totalSales = useMemo(
    () => data.sales.reduce((sum, row) => sum + Number(row.net_sales_amount || row.total || 0), 0),
    [data.sales]
  );
  const totalExpenses = useMemo(
    () => data.expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [data.expenses]
  );
  const stockAlert = data.products.filter(
    p => Number(p.stock || 0) <= Number(p.min || 0)
  );

  async function deleteEntity(type, id) {
    try {
      const map = {
        product: ["products", "products"],
        supplier: ["suppliers", "suppliers"],
        expense: ["expenses", "expenses"],
        warehouse: ["warehouses", "warehouses"]
      };
      const [table, key] = map[type];
      if (isRemote()) await apiDelete(table, id);
      const next = { ...data, [key]: data[key].filter(x => x.id !== id) };
      saveLocal(next);
      setData(next);
      notify("Data berhasil dihapus");
    } catch (e) {
      notify(`Gagal menghapus: ${e.message}`);
    }
  }

  async function addEntity(type, payload) {
    try {
      if (type === "product") {
        if (!payload.sku || !payload.name) throw new Error("SKU dan nama produk wajib diisi");
        const row = {
          sku: payload.sku, name: payload.name,
          category_id: payload.categoryId || null,
          unit_id: payload.unitId || null,
          product_type: "stock",
          default_selling_price: Number(payload.price || 0),
          reorder_min_qty: Number(payload.min || 0),
          target_stock_qty: Number(payload.target || 0),
          barcode: payload.barcode || null, notes: payload.notes || null
        };
        if (isRemote()) {
          const inserted = await apiInsert("products", row);
          const p = inserted?.[0];
          if (p) data.products.unshift({ id: p.id, sku: p.sku, name: p.name, price: Number(p.default_selling_price || 0), cost: 0, min: Number(p.reorder_min_qty || 0), stock: 0, location: "" });
        } else {
          data.products.unshift({ ...payload, id: crypto.randomUUID(), stock: 0, active: true });
        }
      }

      if (type === "supplier") {
        if (!payload.name) throw new Error("Nama supplier wajib diisi");
        const row = {
          code: payload.code || `SUP-${String(data.suppliers.length + 1).padStart(3, "0")}`,
          name: payload.name, contact_person: payload.contact || null,
          phone: payload.phone || null, email: payload.email || null,
          address: payload.address || null, is_active: true
        };
        if (isRemote()) {
          const inserted = await apiInsert("suppliers", row);
          const s = inserted?.[0];
          if (s) data.suppliers.unshift({ ...s, contact: s.contact_person, active: true });
        } else data.suppliers.unshift({ ...row, id: crypto.randomUUID(), contact: row.contact_person, active: true });
      }

      if (type === "expense") {
        if (!payload.description || !payload.amount) throw new Error("Deskripsi dan nominal biaya wajib");
        const categoryId = payload.categoryId || data.expenseCategories?.[0]?.id;
        if (isRemote() && !categoryId) throw new Error("Kategori biaya belum tersedia di Supabase");
        const row = {
          expense_no: `EXP-${today().replaceAll("-", "")}-${String(data.expenses.length + 1).padStart(4, "0")}`,
          expense_date: payload.date || today(),
          owner_business_unit_id: payload.storeId,
          expense_category_id: categoryId,
          payment_method_id: payload.paymentId || null,
          description: payload.description,
          amount: Number(payload.amount),
          status: "posted"
        };
        if (isRemote()) {
          const inserted = await apiInsert("expenses", row);
          if (inserted?.[0]) data.expenses.unshift(inserted[0]);
        } else data.expenses.unshift({ ...row, id: crypto.randomUUID() });
      }

      if (type === "warehouse") {
        const row = {
          business_unit_id: payload.storeId,
          code: payload.code, name: payload.name, is_active: true
        };
        if (isRemote()) {
          const inserted = await apiInsert("warehouses", row);
          if (inserted?.[0]) data.warehouses.unshift({ ...inserted[0], storeId: inserted[0].business_unit_id });
        } else data.warehouses.unshift({ ...row, id: crypto.randomUUID(), storeId: row.business_unit_id });
      }

      saveLocal(data);
      setData({ ...data });
      setModal(null);
      notify("Data berhasil disimpan");
    } catch (e) {
      notify(e.message);
    }
  }

  async function sellCart(payload) {
    try {
      if (!payload.items.length) throw new Error("Minimal satu produk harus ditambahkan");
      for (const item of payload.items) {
        const product = data.products.find(p => p.id === item.productId);
        if (!product) throw new Error(`Produk ${item.name} tidak ditemukan`);
        if (Number(product.stock) < Number(item.qty)) {
          throw new Error(`Stok ${item.name} tidak cukup. Tersisa ${product.stock}`);
        }
      }

      const gross = payload.items.reduce((s, x) => s + lineTotal(x), 0);
      const total = Math.max(0, gross - Number(payload.discount || 0));
      const saleNo = makeNo("SAL", data.sales.length);

      if (isRemote()) {
        const inserted = await apiInsert("sales", {
          transaction_no: saleNo,
          transaction_date: new Date().toISOString(),
          business_unit_id: payload.storeId,
          channel_id: payload.channelId,
          payment_method_id: payload.paymentId || null,
          customer_name: payload.customer || null,
          status: "draft",
          gross_amount: 0, discount_amount: 0,
          total_deduction_amount: 0, net_sales_amount: 0
        });
        const saleId = inserted?.[0]?.id;
        if (!saleId) throw new Error("Gagal membuat dokumen penjualan");
        await apiRpc("post_sale_multi", {
          p_sale_id: saleId,
          p_business_unit_id: payload.storeId,
          p_items: payload.items.map(x => ({
            product_id: x.productId,
            quantity: Number(x.qty),
            unit_selling_price: Number(x.price),
            discount_amount: 0
          })),
          p_discount: Number(payload.discount || 0)
        });
      }

      const nextProducts = data.products.map(product => {
        const item = payload.items.find(x => x.productId === product.id);
        return item ? { ...product, stock: Number(product.stock) - Number(item.qty) } : product;
      });

      const localItems = payload.items.map(x => ({
        id: crypto.randomUUID(),
        product_id: x.productId,
        product_name: x.name,
        quantity: Number(x.qty),
        unit_selling_price: Number(x.price),
        gross_amount: lineTotal(x),
        discount_amount: 0,
        net_amount: lineTotal(x)
      }));
      const sale = {
        id: crypto.randomUUID(),
        transaction_no: saleNo,
        transaction_date: new Date().toISOString(),
        business_unit_id: payload.storeId,
        customer_name: payload.customer || null,
        status: "completed",
        gross_amount: gross,
        discount_amount: Number(payload.discount || 0),
        total_deduction_amount: Number(payload.discount || 0),
        net_sales_amount: total,
        items: localItems
      };

      const next = {
        ...data,
        products: nextProducts,
        sales: [sale, ...data.sales]
      };
      saveLocal(next);
      setData(next);
      setModal(null);
      notify(`Penjualan ${saleNo} tersimpan • ${money(total)}`);
    } catch (e) {
      notify(e.message);
    }
  }

  async function purchaseCart(payload) {
    try {
      if (!payload.items.length) throw new Error("Minimal satu produk harus ditambahkan");
      const subtotal = payload.items.reduce((s, x) => s + lineTotal({ ...x, cost: x.cost }), 0);
      const total = Math.max(0, subtotal - Number(payload.discount || 0) + Number(payload.shipping || 0));
      const purchaseNo = makeNo("PUR", data.purchases.length);

      if (isRemote()) {
        const inserted = await apiInsert("purchases", {
          purchase_no: purchaseNo,
          purchase_date: new Date().toISOString(),
          business_unit_id: payload.storeId,
          supplier_id: payload.supplierId,
          status: "draft",
          subtotal, discount_amount: Number(payload.discount || 0),
          shipping_amount: Number(payload.shipping || 0),
          total_amount: total
        });
        const purchaseId = inserted?.[0]?.id;
        if (!purchaseId) throw new Error("Gagal membuat dokumen pembelian");

        if (payload.status === "received") {
          await apiRpc("receive_purchase_multi", {
            p_purchase_id: purchaseId,
            p_business_unit_id: payload.storeId,
            p_items: payload.items.map(x => ({
              product_id: x.productId,
              quantity: Number(x.qty),
              unit_cost: Number(x.cost)
            }))
          });
        }
      }

      const nextProducts = payload.status === "received"
        ? data.products.map(product => {
            const qty = payload.items.filter(x => x.productId === product.id).reduce((s, x) => s + Number(x.qty), 0);
            if (!qty) return product;
            const costWeighted = payload.items.filter(x => x.productId === product.id);
            const addedCost = costWeighted.reduce((s, x) => s + Number(x.qty) * Number(x.cost), 0);
            const oldQty = Number(product.stock || 0);
            const oldCost = Number(product.cost || 0);
            const newQty = oldQty + qty;
            return {
              ...product,
              stock: newQty,
              cost: newQty ? ((oldQty * oldCost) + addedCost) / newQty : Number(product.cost || 0)
            };
          })
        : data.products;

      const purchase = {
        id: crypto.randomUUID(),
        purchase_no: purchaseNo,
        purchase_date: new Date().toISOString(),
        business_unit_id: payload.storeId,
        supplier_id: payload.supplierId,
        status: payload.status,
        subtotal, discount_amount: Number(payload.discount || 0),
        shipping_amount: Number(payload.shipping || 0),
        total_amount: total,
        items: payload.items.map(x => ({
          id: crypto.randomUUID(), product_id: x.productId, product_name: x.name,
          quantity: Number(x.qty), unit_cost: Number(x.cost), net_amount: lineTotal({ ...x, cost: x.cost })
        }))
      };

      const movements = payload.status === "received"
        ? payload.items.map(x => ({
            id: crypto.randomUUID(), movement_no: `MOV-${Date.now()}-${x.productId.slice(0, 4)}`,
            occurred_at: new Date().toISOString(), product_id: x.productId,
            business_unit_id: payload.storeId, movement_type: "purchase",
            quantity_in: Number(x.qty), quantity_out: 0, unit_cost: Number(x.cost),
            source_document_type: "purchase", source_document_id: purchase.id
          })).concat(data.movements)
        : data.movements;

      const next = {
        ...data,
        products: nextProducts,
        purchases: [purchase, ...data.purchases],
        movements
      };
      saveLocal(next);
      setData(next);
      setModal(null);
      notify(`Pembelian ${purchaseNo} tersimpan`);
    } catch (e) {
      notify(e.message);
    }
  }

  function exportCurrent() {
    const rows =
      tab === "products" ? data.products :
      tab === "sales" ? data.sales :
      tab === "purchases" ? data.purchases :
      tab === "expenses" ? data.expenses :
      data.movements;
    if (!rows.length) return notify("Tidak ada data untuk diekspor");
    const blob = new Blob([csv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `yanit-${tab}-${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <span className="brandMark logoMark"><img src="/yanit-logo.jpg" alt="Yanit Group" /></span>
          <div><b>Yanit Group</b><small>Management System</small></div>
        </div>
        <nav>
          <p>MENU UTAMA</p>
          {menu.slice(0, 5).map(([id,label,icon]) => (
            <button key={id} className={tab === id ? "nav active" : "nav"} onClick={() => { setTab(id); setMobile(false); }}>
              {icon}<span>{label}</span>
            </button>
          ))}
          <p>MASTER DATA</p>
          {menu.slice(5).map(([id,label,icon]) => (
            <button key={id} className={tab === id ? "nav active" : "nav"} onClick={() => { setTab(id); setMobile(false); }}>
              {icon}<span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="user"><div className="avatar">A</div><div><b>Admin Yanit</b><small>Administrator</small></div></div>
      </aside>

      <section className="content">
        <header>
          <button className="menuBtn" onClick={() => setMobile(!mobile)}>☰</button>
          <div>
            <h1>{menu.find(x => x[0] === tab)?.[1]}</h1>
            <p>{tab === "dashboard" ? "Ringkasan bisnis dan indikator utama." : "Kelola data dan transaksi secara langsung."}</p>
          </div>
          <div className="headActions">
            <span className="mode">{isRemote() ? "☁ Supabase" : "◉ Mode Lokal"}</span>
            {["products","sales","purchases","expenses","suppliers","warehouse"].includes(tab) &&
              <button className="secondary" onClick={exportCurrent}>⇩ Export CSV</button>}
            {tab === "sales" &&
              <button className="primary" onClick={() => setModal("sale")}>＋ Penjualan</button>}
            {tab === "purchases" &&
              <button className="primary" onClick={() => setModal("purchase")}>＋ Pembelian</button>}
          </div>
        </header>

        {loading ? <div className="loading">Memuat data…</div> :
          <>
            {tab === "dashboard" && <Dashboard data={data} stockAlert={stockAlert} totalSales={totalSales} totalExpenses={totalExpenses} period={period} setPeriod={setPeriod} />}
            {tab === "sales" && <Sales data={data} />}
            {tab === "purchases" && <Purchases data={data} />}
            {tab === "inventory" && <Inventory data={data} />}
            {tab === "expenses" && <Expenses data={data} onAdd={() => setModal("expense")} onDelete={id => deleteEntity("expense", id)} />}
            {tab === "products" && <Products data={data} onAdd={() => setModal("product")} onDelete={id => deleteEntity("product", id)} />}
            {tab === "suppliers" && <Suppliers data={data} onAdd={() => setModal("supplier")} onDelete={id => deleteEntity("supplier", id)} />}
            {tab === "warehouse" && <Warehouses data={data} onAdd={() => setModal("warehouse")} onDelete={id => deleteEntity("warehouse", id)} />}
            {tab === "reports" && <Reports data={data} totalSales={totalSales} totalExpenses={totalExpenses} />}
          </>
        }
      </section>

      {modal === "sale" && <SaleModal data={data} close={() => setModal(null)} submit={sellCart} />}
      {modal === "purchase" && <PurchaseModal data={data} close={() => setModal(null)} submit={purchaseCart} />}
      {modal === "product" && <ProductModal data={data} close={() => setModal(null)} submit={p => addEntity("product", p)} />}
      {modal === "supplier" && <SupplierModal close={() => setModal(null)} submit={p => addEntity("supplier", p)} />}
      {modal === "expense" && <ExpenseModal data={data} close={() => setModal(null)} submit={p => addEntity("expense", p)} />}
      {modal === "warehouse" && <WarehouseModal data={data} close={() => setModal(null)} submit={p => addEntity("warehouse", p)} />}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

function Toolbar({title, desc, children}) {
  return <div className="toolbar"><div><h2>{title}</h2><p>{desc}</p></div><div className="toolbarActions">{children}</div></div>;
}

function Dashboard({data, stockAlert, totalSales, totalExpenses, period, setPeriod}) {
  const cards = [
    ["Penjualan Bersih", totalSales, "green"],
    ["Biaya Operasional", totalExpenses, "red"],
    ["Produk", data.products.length, "blue"],
    ["Stok Menipis", stockAlert.length, "orange"]
  ];
  return <>
    <div className="filters"><select value={period} onChange={e => setPeriod(e.target.value)}>
      <option value="today">Hari ini</option><option value="week">Minggu ini</option><option value="month">Bulan ini</option>
    </select></div>
    <section className="kpis">
      {cards.map(c => <article className={`kpi ${c[2]}`} key={c[0]}>
        <span>{c[0]}</span><strong>{c[0] === "Produk" || c[0] === "Stok Menipis" ? c[1] : money(c[1])}</strong>
      </article>)}
    </section>
    <section className="grid two">
      <article className="panel">
        <div className="panelHead"><div><h2>Transaksi Terbaru</h2><p>{data.sales.length ? `${data.sales.length} transaksi tersimpan` : "Data transaksi tersimpan"}</p></div></div>
        {data.sales.length ? <div className="tableWrap"><table><thead><tr><th>No</th><th>Tanggal</th><th>Item</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>{data.sales.slice(0,8).map(s => <tr key={s.id || s.transaction_no}>
            <td><b>{s.transaction_no}</b></td>
            <td>{new Date(s.transaction_date).toLocaleDateString("id-ID")}</td>
            <td>{s.items?.length || "—"}</td>
            <td><b>{money(s.net_sales_amount || s.total || 0)}</b></td>
            <td><em>{s.status || "completed"}</em></td>
          </tr>)}</tbody></table></div> : <div className="empty">Belum ada transaksi.</div>}
      </article>
      <article className="panel">
        <div className="panelHead"><div><h2>Stok Perlu Perhatian</h2><p>Segera lakukan pembelian.</p></div></div>
        {stockAlert.length ? stockAlert.slice(0,6).map(p => <div className="stockItem" key={p.id}>
          <div className="productIcon">□</div><div className="stockName"><b>{p.name}</b><small>{p.sku}</small></div>
          <div><strong className={p.stock === 0 ? "danger" : "warning"}>{p.stock} unit</strong><small>Min. {p.min}</small></div>
        </div>) : <div className="empty">Semua stok aman.</div>}
      </article>
    </section>
  </>;
}

function Products({data,onAdd,onDelete}) {
  return <><Toolbar title="Produk" desc="Kelola produk, harga, minimum stok, dan SKU." ><button className="primary" onClick={onAdd}>＋ Produk</button></Toolbar>
    <article className="panel"><div className="tableWrap"><table><thead><tr><th>SKU</th><th>Produk</th><th>Harga</th><th>Stok</th><th>Min.</th><th>Lokasi</th><th>Aksi</th></tr></thead>
    <tbody>{data.products.map(p=><tr key={p.id}><td><b>{p.sku}</b></td><td>{p.name}</td><td>{money(p.price)}</td><td>{p.stock}</td><td>{p.min}</td><td><code>{p.location || "-"}</code></td><td><button className="iconBtn" onClick={()=>onDelete(p.id)}>Hapus</button></td></tr>)}</tbody></table></div></article></>;
}

function Sales({data}) {
  return <><Toolbar title="Penjualan" desc="Penjualan multi-item dengan histori transaksi." />
    <article className="panel"><div className="tableWrap"><table><thead><tr><th>No</th><th>Tanggal</th><th>Customer</th><th>Item</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>{data.sales.length ? data.sales.map(s=><tr key={s.id || s.transaction_no}><td><b>{s.transaction_no}</b></td><td>{new Date(s.transaction_date).toLocaleString("id-ID")}</td><td>{s.customer_name || "-"}</td><td>{s.items?.length || "-"}</td><td>{money(s.net_sales_amount || s.total || 0)}</td><td><em>{s.status || "completed"}</em></td></tr>) : <tr><td colSpan="6" className="empty">Belum ada penjualan.</td></tr>}</tbody></table></div></article></>;
}

function Purchases({data}) {
  return <><Toolbar title="Pembelian" desc="Pembelian multi-item dan penerimaan stok." />
    <article className="panel"><div className="tableWrap"><table><thead><tr><th>No</th><th>Tanggal</th><th>Supplier</th><th>Item</th><th>Total</th><th>Status</th></tr></thead>
    <tbody>{data.purchases.length ? data.purchases.map(p=><tr key={p.id || p.purchase_no}><td><b>{p.purchase_no}</b></td><td>{new Date(p.purchase_date).toLocaleString("id-ID")}</td><td>{p.supplier_id || "-"}</td><td>{p.items?.length || "-"}</td><td>{money(p.total_amount || 0)}</td><td><em>{p.status}</em></td></tr>) : <tr><td colSpan="6" className="empty">Belum ada pembelian.</td></tr>}</tbody></table></div></article></>;
}

function Inventory({data}) {
  return <><Toolbar title="Inventory & Stok" desc="Pantau saldo stok dan histori movement." />
    <section className="grid two">
      <article className="panel"><div className="panelHead"><div><h2>Saldo Produk</h2><p>Stok saat ini</p></div></div>
        {data.products.map(p=><div className="stockItem" key={p.id}><div className="productIcon">□</div><div className="stockName"><b>{p.name}</b><small>{p.location || "Lokasi belum diatur"}</small></div><div><strong>{p.stock} unit</strong><small>Min. {p.min}</small></div></div>)}
      </article>
      <article className="panel"><div className="panelHead"><div><h2>Movement Terbaru</h2><p>Masuk/keluar stok</p></div></div>
        {data.movements.slice(0,10).map(m=><div className="reportRow" key={m.id}><span>{m.movement_type}</span><b>{m.quantity_in ? `+${m.quantity_in}` : `-${m.quantity_out}`}</b></div>)}
        {!data.movements.length && <div className="empty">Belum ada movement.</div>}
      </article>
    </section></>;
}

function Expenses({data,onAdd,onDelete}) {
  return <><Toolbar title="Biaya Operasional" desc="Catat biaya per store dan kategori."><button className="primary" onClick={onAdd}>＋ Biaya</button></Toolbar>
    <article className="panel"><div className="tableWrap"><table><thead><tr><th>No</th><th>Tanggal</th><th>Deskripsi</th><th>Nominal</th><th>Aksi</th></tr></thead>
    <tbody>{data.expenses.map(e=><tr key={e.id}><td>{e.expense_no}</td><td>{e.expense_date}</td><td>{e.description}</td><td>{money(e.amount)}</td><td><button className="iconBtn" onClick={()=>onDelete(e.id)}>Hapus</button></td></tr>)}</tbody></table></div></article></>;
}

function Suppliers({data,onAdd,onDelete}) {
  return <><Toolbar title="Supplier" desc="Kelola mitra pemasok." ><button className="primary" onClick={onAdd}>＋ Supplier</button></Toolbar>
    <article className="panel"><div className="tableWrap"><table><thead><tr><th>Kode</th><th>Nama</th><th>Kontak</th><th>Telepon</th><th>Aksi</th></tr></thead>
    <tbody>{data.suppliers.map(s=><tr key={s.id}><td>{s.code}</td><td><b>{s.name}</b></td><td>{s.contact || s.contact_person || "-"}</td><td>{s.phone || "-"}</td><td><button className="iconBtn" onClick={()=>onDelete(s.id)}>Hapus</button></td></tr>)}</tbody></table></div></article></>;
}

function Warehouses({data,onAdd,onDelete}) {
  return <><Toolbar title="Store & Gudang" desc="Kelola store dan warehouse."><button className="primary" onClick={onAdd}>＋ Gudang</button></Toolbar>
    <article className="panel"><div className="tableWrap"><table><thead><tr><th>Kode</th><th>Gudang</th><th>Store</th><th>Aksi</th></tr></thead>
    <tbody>{data.warehouses.map(w=><tr key={w.id}><td>{w.code}</td><td>{w.name}</td><td>{data.stores.find(s=>s.id===w.storeId)?.name || w.storeId}</td><td><button className="iconBtn" onClick={()=>onDelete(w.id)}>Hapus</button></td></tr>)}</tbody></table></div></article></>;
}

function Reports({data,totalSales,totalExpenses}) {
  const gross = data.sales.reduce((s,x)=>s+Number(x.gross_amount||0),0);
  const discount = data.sales.reduce((s,x)=>s+Number(x.discount_amount||0),0);
  return <><Toolbar title="Laporan" desc="Ringkasan kinerja bisnis." ><button className="secondary" onClick={()=>window.print()}>▣ Cetak</button></Toolbar>
    <section className="kpis">
      <article className="kpi green"><span>Penjualan Kotor</span><strong>{money(gross)}</strong></article>
      <article className="kpi orange"><span>Diskon</span><strong>{money(discount)}</strong></article>
      <article className="kpi blue"><span>Penjualan Bersih</span><strong>{money(totalSales)}</strong></article>
      <article className="kpi red"><span>Biaya Operasional</span><strong>{money(totalExpenses)}</strong></article>
    </section>
    <article className="panel"><div className="panelHead"><div><h2>Ringkasan</h2><p>Data tersimpan saat ini</p></div></div>
      <div className="reportRow"><span>Jumlah transaksi penjualan</span><b>{data.sales.length}</b></div>
      <div className="reportRow"><span>Jumlah dokumen pembelian</span><b>{data.purchases.length}</b></div>
      <div className="reportRow"><span>Jumlah produk</span><b>{data.products.length}</b></div>
      <div className="reportRow"><span>Produk stok menipis</span><b>{data.products.filter(p=>Number(p.stock||0)<=Number(p.min||0)).length}</b></div>
    </article>
  </>;
}

function CartRow({item,onQty,onRemove,mode}) {
  return <tr>
    <td><b>{item.name}</b><small>{item.sku}</small></td>
    <td><input className="tx-qty" type="number" min="1" value={item.qty} onChange={e=>onQty(Math.max(1,Number(e.target.value)||1))}/></td>
    <td><input className="tx-price" type="number" min="0" value={mode==="sale"?item.price:item.cost} onChange={e=>onQty(item.qty, Number(e.target.value)||0, true)}/></td>
    <td><b>{money(lineTotal(item))}</b></td>
    <td><button className="iconBtn" onClick={onRemove}>Hapus</button></td>
  </tr>;
}

function SaleModal({data,close,submit}) {
  const [storeId,setStoreId]=useState(data.stores[0]?.id||"");
  const [channelId,setChannelId]=useState(data.channels[0]?.id || data.channels[0]?.code || data.channels[0] || "");
  const [paymentId,setPaymentId]=useState(data.payments[0]?.id || data.payments[0] || "");
  const [customer,setCustomer]=useState("");
  const [discount,setDiscount]=useState(0);
  const [productId,setProductId]=useState(data.products[0]?.id||"");
  const [qty,setQty]=useState(1);
  const [cart,setCart]=useState([]);

  const channel = value => typeof value === "object" ? value.id : value;
  const payment = value => typeof value === "object" ? value.id : value;
  const channelName = id => (data.channels.find(c => (c.id || c) === id)?.name || data.channels.find(c => (c.id || c) === id)?.code || id);
  const paymentName = id => (data.payments.find(c => (c.id || c) === id)?.name || id);

  function add() {
    const p=data.products.find(x=>x.id===productId);
    if(!p) return;
    const existing=cart.find(x=>x.productId===p.id);
    const nextQty=(existing?.qty||0)+qty;
    if(nextQty>Number(p.stock)) return;
    setCart(existing
      ? cart.map(x=>x.productId===p.id?{...x,qty:nextQty}:x)
      : [...cart,{productId:p.id,name:p.name,sku:p.sku,qty,price:Number(p.price||0)}]);
    setQty(1);
  }
  const gross=cart.reduce((s,x)=>s+lineTotal(x),0);
  const total=Math.max(0,gross-Number(discount||0));

  return <div className="modalOverlay"><div className="modal transactionModal">
    <div className="modalHead"><div><h2>Penjualan Baru</h2><p>Tambahkan beberapa produk dalam satu transaksi.</p></div><button onClick={close}>×</button></div>
    <div className="form">
      <div className="formRow tx-form-top">
        <label>Store<select value={storeId} onChange={e=>setStoreId(e.target.value)}>{data.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Channel<select value={channelId} onChange={e=>setChannelId(e.target.value)}>{data.channels.map(c=><option key={c.id||c.code||c} value={c.id||c.code||c}>{c.name||c.code||c}</option>)}</select></label>
        <label>Pembayaran<select value={paymentId} onChange={e=>setPaymentId(e.target.value)}>{data.payments.map(c=><option key={c.id||c.name||c} value={c.id||c.name||c}>{c.name||c}</option>)}</select></label>
        <label>Customer<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Opsional"/></label>
      </div>

      <div className="tx-add-row">
        <select value={productId} onChange={e=>setProductId(e.target.value)}>{data.products.map(p=><option key={p.id} value={p.id}>{p.name} • stok {p.stock}</option>)}</select>
        <input type="number" min="1" value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)||1))}/>
        <button className="primary" type="button" onClick={add}>＋ Tambah</button>
      </div>

      <div className="tx-cart">
        {cart.length ? <table><thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>{cart.map(item=><CartRow key={item.productId} item={item} mode="sale"
            onQty={(newQty,newPrice,priceChange)=>setCart(cart.map(x=>x.productId===item.productId?{...x,qty:newQty,...(priceChange?{price:newPrice}:{})}:x))}
            onRemove={()=>setCart(cart.filter(x=>x.productId!==item.productId))}/>)}</tbody></table>
          : <div className="empty tx-empty">Belum ada item. Tambahkan produk ke keranjang.</div>}
      </div>

      <div className="formRow">
        <label>Diskon<input type="number" min="0" value={discount} onChange={e=>setDiscount(Math.max(0,Number(e.target.value)||0))}/></label>
        <div className="tx-summary"><div><span>Subtotal</span><b>{money(gross)}</b></div><div><span>Diskon</span><b>- {money(discount)}</b></div><div className="grand"><span>Total</span><strong>{money(total)}</strong></div></div>
      </div>
    </div>
    <div className="modalActions"><button className="secondary" onClick={close}>Batal</button><button className="primary" onClick={()=>submit({items:cart,storeId,channelId,paymentId,customer,discount})}>Simpan Penjualan</button></div>
  </div></div>;
}

function PurchaseModal({data,close,submit}) {
  const [storeId,setStoreId]=useState(data.stores[0]?.id||"");
  const [supplierId,setSupplierId]=useState(data.suppliers[0]?.id||"");
  const [productId,setProductId]=useState(data.products[0]?.id||"");
  const [qty,setQty]=useState(1);
  const [cost,setCost]=useState(Number(data.products[0]?.cost||0));
  const [discount,setDiscount]=useState(0);
  const [shipping,setShipping]=useState(0);
  const [status,setStatus]=useState("received");
  const [cart,setCart]=useState([]);

  function add() {
    const p=data.products.find(x=>x.id===productId);
    if(!p) return;
    const existing=cart.find(x=>x.productId===p.id);
    setCart(existing
      ? cart.map(x=>x.productId===p.id?{...x,qty:x.qty+qty,cost}:x)
      : [...cart,{productId:p.id,name:p.name,sku:p.sku,qty,cost}]);
    setQty(1);
  }
  const subtotal=cart.reduce((s,x)=>s+Number(x.qty||0)*Number(x.cost||0),0);
  const total=Math.max(0,subtotal-Number(discount||0)+Number(shipping||0));

  return <div className="modalOverlay"><div className="modal transactionModal">
    <div className="modalHead"><div><h2>Pembelian Baru</h2><p>Tambahkan beberapa produk dan tentukan penerimaan stok.</p></div><button onClick={close}>×</button></div>
    <div className="form">
      <div className="formRow tx-form-top">
        <label>Store<select value={storeId} onChange={e=>setStoreId(e.target.value)}>{data.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Supplier<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}>{data.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="received">Received / Tambah Stok</option><option value="draft">Draft</option></select></label>
      </div>

      <div className="tx-add-row purchase-add">
        <select value={productId} onChange={e=>{setProductId(e.target.value);const p=data.products.find(x=>x.id===e.target.value);setCost(Number(p?.cost||0));}}>{data.products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input type="number" min="1" value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)||1))}/>
        <input type="number" min="0" value={cost} onChange={e=>setCost(Math.max(0,Number(e.target.value)||0))}/>
        <button className="primary" type="button" onClick={add}>＋ Tambah</button>
      </div>

      <div className="tx-cart">
        {cart.length ? <table><thead><tr><th>Produk</th><th>Qty</th><th>Harga Beli</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>{cart.map(item=><CartRow key={item.productId} item={item} mode="purchase"
            onQty={(newQty,newCost,costChange)=>setCart(cart.map(x=>x.productId===item.productId?{...x,qty:newQty,...(costChange?{cost:newCost}:{})}:x))}
            onRemove={()=>setCart(cart.filter(x=>x.productId!==item.productId))}/>)}</tbody></table>
          : <div className="empty tx-empty">Belum ada item. Tambahkan produk ke keranjang.</div>}
      </div>

      <div className="formRow">
        <label>Diskon<input type="number" min="0" value={discount} onChange={e=>setDiscount(Math.max(0,Number(e.target.value)||0))}/></label>
        <label>Ongkir<input type="number" min="0" value={shipping} onChange={e=>setShipping(Math.max(0,Number(e.target.value)||0))}/></label>
      </div>
      <div className="tx-summary"><div><span>Subtotal</span><b>{money(subtotal)}</b></div><div><span>Diskon</span><b>- {money(discount)}</b></div><div><span>Ongkir</span><b>+ {money(shipping)}</b></div><div className="grand"><span>Total Pembelian</span><strong>{money(total)}</strong></div></div>
    </div>
    <div className="modalActions"><button className="secondary" onClick={close}>Batal</button><button className="primary" onClick={()=>submit({items:cart,storeId,supplierId,discount,shipping,status})}>Simpan Pembelian</button></div>
  </div></div>;
}

function ProductModal({data,close,submit}) {
  const [form,setForm]=useState({sku:"",name:"",price:0,min:0,target:0,categoryId:data.categories[0]?.id||"",unitId:data.units[0]?.id||""});
  const set=(k,v)=>setForm({...form,[k]:v});
  return <SimpleModal title="Produk Baru" close={close} submit={()=>submit(form)} fields={[
    ["sku","SKU"],["name","Nama Produk"],["price","Harga Jual"],["min","Minimum Stok"],["target","Target Stok"],["barcode","Barcode"]
  ].map(([k,l])=><label key={k}>{l}<input value={form[k]||""} type={["price","min","target"].includes(k)?"number":"text"} onChange={e=>set(k,e.target.value)}/></label>)}/>;
}
function SupplierModal({close,submit}) {
  const [form,setForm]=useState({code:"",name:"",contact:"",phone:"",email:"",address:""});
  const set=(k,v)=>setForm({...form,[k]:v});
  return <SimpleModal title="Supplier Baru" close={close} submit={()=>submit(form)} fields={["code","name","contact","phone","email","address"].map(k=><label key={k}>{k}<input value={form[k]} onChange={e=>set(k,e.target.value)}/></label>)}/>;
}
function ExpenseModal({data,close,submit}) {
  const [form,setForm]=useState({description:"",amount:0,date:today(),storeId:data.stores[0]?.id||"",categoryId:data.expenseCategories[0]?.id||""});
  const set=(k,v)=>setForm({...form,[k]:v});
  return <SimpleModal title="Biaya Operasional" close={close} submit={()=>submit(form)} fields={[
    <label key="date">Tanggal<input type="date" value={form.date} onChange={e=>set("date",e.target.value)}/></label>,
    <label key="store">Store<select value={form.storeId} onChange={e=>set("storeId",e.target.value)}>{data.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>,
    <label key="description">Deskripsi<input value={form.description} onChange={e=>set("description",e.target.value)}/></label>,
    <label key="amount">Nominal<input type="number" min="0" value={form.amount} onChange={e=>set("amount",e.target.value)}/></label>
  ]}/>;
}
function WarehouseModal({data,close,submit}) {
  const [form,setForm]=useState({storeId:data.stores[0]?.id||"",code:"",name:""});
  const set=(k,v)=>setForm({...form,[k]:v});
  return <SimpleModal title="Gudang Baru" close={close} submit={()=>submit(form)} fields={[
    <label key="store">Store<select value={form.storeId} onChange={e=>set("storeId",e.target.value)}>{data.stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>,
    <label key="code">Kode Gudang<input value={form.code} onChange={e=>set("code",e.target.value)}/></label>,
    <label key="name">Nama Gudang<input value={form.name} onChange={e=>set("name",e.target.value)}/></label>
  ]}/>;
}
function SimpleModal({title,close,submit,fields}) {
  return <div className="modalOverlay"><div className="modal"><div className="modalHead"><div><h2>{title}</h2><p>Lengkapi data berikut.</p></div><button onClick={close}>×</button></div><div className="form">{fields}</div><div className="modalActions"><button className="secondary" onClick={close}>Batal</button><button className="primary" onClick={submit}>Simpan</button></div></div></div>;
}
