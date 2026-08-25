"use client";

import {useEffect,useMemo,useState} from "react";
import {loadLocal,saveLocal,money,csv,isRemote,apiList,apiInsert,apiUpdate,apiDelete,apiRpc} from "@/lib/db";

const menu=[
  ["dashboard","Dashboard","▦"],["sales","Penjualan","▣"],["purchases","Pembelian","▤"],["inventory","Inventory & Stok","▥"],["expenses","Biaya Operasional","◫"],
  ["products","Produk","◈"],["suppliers","Supplier","◇"],["warehouse","Store & Gudang","⌂"],["reports","Laporan","▤"]
];
const emptyForm={};
const today=()=>new Date().toISOString().slice(0,10);

function normalizeRemote(base, lists){
  const units=(lists.business_units||[]).filter(x=>x.unit_type==='store');
  return {...base,
    expenseCategories:lists.expense_categories||[],
    channels:lists.sales_channels||base.channels,
    payments:lists.payment_methods||base.payments,
    stores:units.map(x=>({id:x.id,code:x.code,name:x.name,type:x.unit_type})),
    products:(lists.products||[]).map(x=>({...x,id:x.id,categoryId:x.category_id,unitId:x.unit_id,price:x.default_selling_price,cost:x.cost||0,min:x.reorder_min_qty,stock:Number((lists.v_product_stock||[]).find(v=>v.id===x.id)?.stock_qty||0),location:(lists.v_product_stock||[]).find(v=>v.id===x.id)?.sample_location||''})),
    suppliers:(lists.suppliers||[]).map(x=>({...x,active:x.is_active})),
    warehouses:(lists.warehouses||[]).map(x=>({id:x.id,storeId:x.business_unit_id,code:x.code,name:x.name})),
    sales:lists.sales||[],purchases:lists.purchases||[],expenses:lists.expenses||[],movements:lists.inventory_movements||[],
    categories:lists.product_categories||[],units:lists.units||[]
  };
}

export default function Home(){
  const [tab,setTab]=useState("dashboard");
  const [data,setData]=useState(loadLocal());
  const [loading,setLoading]=useState(true); const [toast,setToast]=useState("");
  const [modal,setModal]=useState(null); const [storeFilter,setStoreFilter]=useState("all"); const [period,setPeriod]=useState("today");
  const [mobile,setMobile]=useState(false);

  useEffect(()=>{(async()=>{try{
    if(isRemote()){
      const tables={business_units:"select=*&order=code.asc",products:"select=*",v_product_stock:"select=*",suppliers:"select=*&order=name.asc",warehouses:"select=*",sales:"select=*&order=transaction_date.desc",purchases:"select=*&order=purchase_date.desc",expenses:"select=*&order=expense_date.desc",inventory_movements:"select=*&order=occurred_at.desc",product_categories:"select=*",units:"select=*",expense_categories:"select=*&order=name.asc",sales_channels:"select=*&order=name.asc",payment_methods:"select=*&order=name.asc"};
      const entries=await Promise.all(Object.entries(tables).map(async([t,q])=>[t,await apiList(t,q)]));
      setData(normalizeRemote(data,Object.fromEntries(entries)));
    }
  }catch(e){setToast(`Mode lokal: ${e.message}`);}finally{setLoading(false);}})()},[]);

  function notify(s){setToast(s);setTimeout(()=>setToast(""),2800)}
  const filteredProducts=data.products.filter(p=>storeFilter==='all'||true);
  const totalSales=data.sales.reduce((a,b)=>a+Number(b.net_sales_amount||b.total||0),0);
  const totalExpenses=data.expenses.reduce((a,b)=>a+Number(b.amount||0),0);
  const stockAlert=data.products.filter(p=>Number(p.stock||0)<=Number(p.min||0));

  async function addEntity(type,payload){
    try{
      if(type==='product'){
        if(!payload.sku||!payload.name) throw new Error('SKU dan nama produk wajib diisi');
        if(isRemote()) await apiInsert('products',{sku:payload.sku,name:payload.name,category_id:payload.categoryId||null,unit_id:payload.unitId||null,product_type:'stock',default_selling_price:Number(payload.price||0),reorder_min_qty:Number(payload.min||0),target_stock_qty:Number(payload.target||0),barcode:payload.barcode||null,notes:payload.notes||null});
        else data.products.unshift({...payload,id:crypto.randomUUID(),stock:0,active:true});
      }
      if(type==='supplier'){
        if(!payload.name) throw new Error('Nama supplier wajib diisi');
        const row={code:payload.code||`SUP-${String(data.suppliers.length+1).padStart(3,'0')}`,name:payload.name,contact_person:payload.contact||null,phone:payload.phone||null,email:payload.email||null,address:payload.address||null,is_active:true};
        if(isRemote()) await apiInsert('suppliers',row); else data.suppliers.unshift({...row,id:crypto.randomUUID(),contact:row.contact_person,active:true});
      }
      if(type==='expense'){
        if(!payload.description||!payload.amount) throw new Error('Deskripsi dan nominal biaya wajib');
        const categoryId=payload.categoryId || data.expenseCategories?.[0]?.id; if(isRemote()&&!categoryId) throw new Error("Kategori biaya belum tersedia di Supabase"); const row={expense_no:`EXP-${today().replaceAll('-','')}-${String(data.expenses.length+1).padStart(4,'0')}`,expense_date:payload.date||today(),owner_business_unit_id:payload.storeId,expense_category_id:categoryId,payment_method_id:null,description:payload.description,amount:Number(payload.amount),status:'posted'};
        if(isRemote()) await apiInsert('expenses',row); else data.expenses.unshift({...row,id:crypto.randomUUID()});
      }
      if(type==='warehouse'){
        const row={business_unit_id:payload.storeId,code:payload.code,name:payload.name,is_active:true};
        if(isRemote()) await apiInsert('warehouses',row); else data.warehouses.unshift({...row,id:crypto.randomUUID(),storeId:row.business_unit_id});
      }
      saveLocal(data); setData({...data}); setModal(null); notify("Data berhasil disimpan");
    }catch(e){notify(e.message)}
  }

  async function deleteEntity(type,id){
    try{
      const table={product:'products',supplier:'suppliers',expense:'expenses',warehouse:'warehouses'}[type];
      if(isRemote()) await apiDelete(table,id);
      const key={product:'products',supplier:'suppliers',expense:'expenses',warehouse:'warehouses'}[type];
      const next={...data,[key]:data[key].filter(x=>x.id!==id)}; saveLocal(next); setData(next); notify("Data dihapus");
    }catch(e){notify(`Gagal menghapus: ${e.message}`)}
  }

  async function sell(payload){
    try{
      const product=data.products.find(p=>p.id===payload.productId); if(!product) throw new Error('Produk tidak ditemukan');
      if(Number(product.stock)<Number(payload.qty)) throw new Error(`Stok tidak cukup. Tersisa ${product.stock}`);
      const total=Number(payload.qty)*Number(payload.price)-Number(payload.discount||0);
      const sale={id:crypto.randomUUID(),transaction_no:`SAL-${today().replaceAll('-','')}-${String(data.sales.length+1).padStart(4,'0')}`,transaction_date:new Date().toISOString(),business_unit_id:payload.storeId,channel_id:payload.channel,payment_method_id:payload.payment,payment_method:payload.payment,customer_name:payload.customer||null,status:'completed',gross_amount:Number(payload.qty)*Number(payload.price),discount_amount:Number(payload.discount||0),total_deduction_amount:Number(payload.discount||0),net_sales_amount:total};
      if(isRemote()){ const ch=(data.channels||[]).find(c=>c.code===sale.channel||c.name===sale.channel); const pay=(data.payments||[]).find(c=>c.name===sale.payment_method); if(!ch) throw new Error("Channel penjualan belum ada di Supabase"); const inserted=await apiInsert('sales',{transaction_no:sale.transaction_no,transaction_date:sale.transaction_date,business_unit_id:sale.business_unit_id,channel_id:ch.id,payment_method_id:pay?.id||null,customer_name:sale.customer_name,status:'draft',gross_amount:0,discount_amount:0,total_deduction_amount:0,net_sales_amount:0}); sale.id=inserted?.[0]?.id||sale.id; await apiRpc('post_sale',{p_sale_id:sale.id,p_product_id:product.id,p_business_unit_id:sale.business_unit_id,p_quantity:Number(payload.qty),p_unit_selling_price:Number(payload.price),p_discount:Number(payload.discount||0)}); }
      product.stock=Number(product.stock)-Number(payload.qty); data.products=data.products.map(p=>p.id===product.id?product:p); data.sales=[sale,...data.sales]; saveLocal(data); setData({...data}); setModal(null); notify(`Penjualan tersimpan: ${money(total)}`);
    }catch(e){notify(e.message)}
  }

  async function purchase(payload){
    try{
      const product=data.products.find(p=>p.id===payload.productId); if(!product) throw new Error("Produk tidak ditemukan");
      const total=Number(payload.qty)*Number(payload.cost);
      const purchase={id:crypto.randomUUID(),purchase_no:`PUR-${today().replaceAll("-","")}-${String(data.purchases.length+1).padStart(4,"0")}`,purchase_date:new Date().toISOString(),business_unit_id:payload.storeId,supplier_id:payload.supplierId,status:payload.status,subtotal:total,discount_amount:0,shipping_amount:0,total_amount:total};
      if(isRemote()){ const ins=await apiInsert("purchases",{purchase_no:purchase.purchase_no,purchase_date:purchase.purchase_date,business_unit_id:purchase.business_unit_id,supplier_id:purchase.supplier_id,status:'draft',subtotal:total,total_amount:total,discount_amount:0,shipping_amount:0}); purchase.id=ins?.[0]?.id||purchase.id; if(payload.status==="received") await apiRpc('receive_purchase',{p_purchase_id:purchase.id,p_product_id:product.id,p_business_unit_id:payload.storeId,p_quantity:Number(payload.qty),p_unit_cost:Number(payload.cost)}); }
      data.purchases=[purchase,...data.purchases];
      if(payload.status==="received"){ product.stock=Number(product.stock||0)+Number(payload.qty); data.products=data.products.map(x=>x.id===product.id?product:x); data.movements=[{id:crypto.randomUUID(),movement_no:`MOV-${Date.now()}`,occurred_at:new Date().toISOString(),product_id:product.id,business_unit_id:payload.storeId,movement_type:"purchase",quantity_in:Number(payload.qty),quantity_out:0,unit_cost:Number(payload.cost),source_document_type:"purchase",source_document_id:purchase.id},...data.movements]; }
      saveLocal(data);setData({...data});setModal(null);notify(`Pembelian tersimpan: ${money(total)}`);
    }catch(e){notify(e.message)}
  }

  function exportCurrent(){
    const rows=tab==='products'?data.products:tab==='sales'?data.sales:tab==='purchases'?data.purchases:tab==='expenses'?data.expenses:data.movements;
    if(!rows.length) return notify('Tidak ada data untuk diekspor'); const blob=new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=`yanit-${tab}-${today()}.csv`;a.click();URL.revokeObjectURL(url);
  }

  return <main className="shell">
    <aside className={`sidebar ${mobile?'open':''}`}>
      <div className="brand"><span className="brandMark">Y</span><div><b>Yanit Group</b><small>Management System</small></div></div>
      <nav><p>MENU UTAMA</p>{menu.slice(0,5).map(([id,label,icon])=><button key={id} className={tab===id?'nav active':'nav'} onClick={()=>{setTab(id);setMobile(false)}}>{icon}<span>{label}</span></button>)}<p>MASTER DATA</p>{menu.slice(5).map(([id,label,icon])=><button key={id} className={tab===id?'nav active':'nav'} onClick={()=>{setTab(id);setMobile(false)}}>{icon}<span>{label}</span></button>)}</nav>
      <div className="user"><div className="avatar">A</div><div><b>Admin Yanit</b><small>Administrator</small></div></div>
    </aside>
    <section className="content"><header><button className="menuBtn" onClick={()=>setMobile(!mobile)}>☰</button><div><h1>{menu.find(x=>x[0]===tab)?.[1]}</h1><p>{tab==='dashboard'?'Ringkasan bisnis dan indikator utama.':'Kelola data dan transaksi secara langsung.'}</p></div><div className="headActions"><span className="mode">{isRemote()?'☁ Supabase':'◉ Mode Lokal'}</span>{['products','sales','purchases','expenses','suppliers','warehouse'].includes(tab)&&<button className="secondary" onClick={exportCurrent}>⇩ Export CSV</button>}{tab==='sales'&&<button className="primary" onClick={()=>setModal('sale')}>＋ Penjualan</button>}</div></header>
      {loading?<div className="loading">Memuat data…</div>:<>{tab==='dashboard'&&<Dashboard data={data} stockAlert={stockAlert} totalSales={totalSales} totalExpenses={totalExpenses} period={period} setPeriod={setPeriod}/>} {tab==='products'&&<Products data={data} onAdd={()=>setModal('product')} onDelete={id=>deleteEntity('product',id)}/>} {tab==='sales'&&<Sales data={data} onAdd={()=>setModal('sale')}/>} {tab==='purchases'&&<Purchases data={data} onAdd={()=>setModal('purchase')}/>} {tab==='inventory'&&<Inventory data={data}/>} {tab==='expenses'&&<Expenses data={data} onAdd={()=>setModal('expense')} onDelete={id=>deleteEntity('expense',id)}/>} {tab==='suppliers'&&<Suppliers data={data} onAdd={()=>setModal('supplier')} onDelete={id=>deleteEntity('supplier',id)}/>} {tab==='warehouse'&&<Warehouses data={data} onAdd={()=>setModal('warehouse')} onDelete={id=>deleteEntity('warehouse',id)}/>} {tab==='reports'&&<Reports data={data} totalSales={totalSales} totalExpenses={totalExpenses}/>}</>}
    </section>
    {modal==='sale'&&<SaleModal data={data} close={()=>setModal(null)} submit={sell}/>} {modal==='product'&&<ProductModal data={data} close={()=>setModal(null)} submit={p=>addEntity('product',p)}/>} {modal==='supplier'&&<SupplierModal close={()=>setModal(null)} submit={p=>addEntity('supplier',p)}/>} {modal==='expense'&&<ExpenseModal data={data} close={()=>setModal(null)} submit={p=>addEntity('expense',p)}/>} {modal==='warehouse'&&<WarehouseModal data={data} close={()=>setModal(null)} submit={p=>addEntity('warehouse',p)}/>} {modal==='purchase'&&<PurchaseModal data={data} close={()=>setModal(null)} submit={purchase}/>} {toast&&<div className="toast">{toast}</div>}
  </main>
}

function Toolbar({title,desc,children}){return <div className="toolbar"><div><h2>{title}</h2><p>{desc}</p></div><div className="toolbarActions">{children}</div></div>}
function Dashboard({data,stockAlert,totalSales,totalExpenses,period,setPeriod}){const cards=[['Penjualan Bersih',totalSales,'green'],['Biaya Operasional',totalExpenses,'red'],['Produk',data.products.length,'blue'],['Stok Menipis',stockAlert.length,'orange']]; return <><div className="filters"><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="today">Hari ini</option><option value="week">Minggu ini</option><option value="month">Bulan ini</option></select></div><section className="kpis">{cards.map(c=><article className={`kpi ${c[2]}`} key={c[0]}><span>{c[0]}</span><strong>{typeof c[1]==='number'&&c[0].includes('Produk')||c[0].includes('Stok')?c[1]:money(c[1])}</strong></article>)}</section><section className="grid two"><article className="panel"><div className="panelHead"><div><h2>Transaksi Terbaru</h2><p>Data transaksi tersimpan</p></div></div><table><thead><tr><th>No</th><th>Store</th><th>Total</th><th>Status</th></tr></thead><tbody>{data.sales.slice(0,8).map(x=><tr key={x.id}><td>{x.transaction_no}</td><td>{data.stores.find(s=>s.id===x.business_unit_id)?.name||'-'}</td><td>{money(x.net_sales_amount)}</td><td><em>{x.status}</em></td></tr>)}{!data.sales.length&&<tr><td colSpan="4" className="empty">Belum ada transaksi.</td></tr>}</tbody></table></article><article className="panel"><div className="panelHead"><div><h2>Stok Perlu Perhatian</h2><p>Segera lakukan pembelian.</p></div></div>{stockAlert.map(p=><div className="stockItem" key={p.id}><div className="productIcon">□</div><div className="stockName"><b>{p.name}</b><small>{p.sku}</small></div><div><strong className={Number(p.stock)===0?'danger':'warning'}>{p.stock} unit</strong><small>Min. {p.min}</small></div></div>)}{!stockAlert.length&&<div className="empty">Semua stok aman.</div>}</article></section></>}

function Products({data,onAdd,onDelete}){return <><Toolbar title="Produk" desc={`${data.products.length} produk terdaftar`}><button className="primary" onClick={onAdd}>＋ Produk</button></Toolbar><div className="panel tablePanel"><div className="tableWrap"><table><thead><tr><th>SKU</th><th>PRODUK</th><th>HARGA</th><th>STOK</th><th>MINIMUM</th><th>LOKASI</th><th></th></tr></thead><tbody>{data.products.map(p=><tr key={p.id}><td><b>{p.sku}</b></td><td>{p.name}</td><td>{money(p.price)}</td><td><b className={Number(p.stock)<=Number(p.min)?'danger':''}>{p.stock}</b></td><td>{p.min}</td><td>{p.location||'-'}</td><td><button className="iconBtn" onClick={()=>onDelete(p.id)}>⌫</button></td></tr>)}</tbody></table></div></div></>}
function Sales({data,onAdd}){return <><Toolbar title="Penjualan" desc="Semua transaksi penjualan"><button className="primary" onClick={onAdd}>＋ Penjualan</button></Toolbar><div className="panel tablePanel"><div className="tableWrap"><table><thead><tr><th>TRANSAKSI</th><th>TANGGAL</th><th>STORE</th><th>GROSS</th><th>NET</th><th>STATUS</th></tr></thead><tbody>{data.sales.map(x=><tr key={x.id}><td><b>{x.transaction_no}</b></td><td>{String(x.transaction_date||'').slice(0,10)}</td><td>{data.stores.find(s=>s.id===x.business_unit_id)?.name||'-'}</td><td>{money(x.gross_amount)}</td><td><b>{money(x.net_sales_amount)}</b></td><td><em>{x.status}</em></td></tr>)}{!data.sales.length&&<tr><td colSpan="6" className="empty">Belum ada transaksi.</td></tr>}</tbody></table></div></div></>}
function Purchases({data,onAdd}){return <><Toolbar title="Pembelian" desc="Pencatatan pembelian dari supplier"><button className="primary" onClick={onAdd}>＋ Pembelian</button></Toolbar><div className="panel tablePanel"><div className="tableWrap"><table><thead><tr><th>NO. PEMBELIAN</th><th>TANGGAL</th><th>SUPPLIER</th><th>STORE</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>{data.purchases.map(x=><tr key={x.id}><td><b>{x.purchase_no}</b></td><td>{String(x.purchase_date||'').slice(0,10)}</td><td>{data.suppliers.find(s=>s.id===x.supplier_id)?.name||'-'}</td><td>{data.stores.find(s=>s.id===x.business_unit_id)?.name||'-'}</td><td>{money(x.total_amount)}</td><td><em>{x.status}</em></td></tr>)}{!data.purchases.length&&<tr><td colSpan="6" className="empty">Belum ada pembelian. Menu ini sudah disiapkan untuk menyimpan dokumen pembelian dan nantinya memengaruhi stok.</td></tr>}</tbody></table></div></div></>}
function Inventory({data}){const total=data.products.reduce((a,p)=>a+Number(p.stock||0),0); return <><Toolbar title="Inventory & Stok" desc="Saldo stok dan lokasi penyimpanan"><div className="summaryChip">Total unit: <b>{total}</b></div></Toolbar><div className="panel tablePanel"><div className="tableWrap"><table><thead><tr><th>SKU</th><th>PRODUK</th><th>STOK</th><th>MIN</th><th>STATUS</th><th>LOKASI RAK</th></tr></thead><tbody>{data.products.map(p=>{const low=Number(p.stock)<=Number(p.min); return <tr key={p.id}><td>{p.sku}</td><td><b>{p.name}</b></td><td>{p.stock}</td><td>{p.min}</td><td><em className={low?'statusWarn':'statusOk'}>{Number(p.stock)===0?'Habis':low?'Menipis':'Aman'}</em></td><td><code>{p.location||'-'}</code></td></tr>})}</tbody></table></div></div></>}
function Expenses({data,onAdd,onDelete}){return <><Toolbar title="Biaya Operasional" desc="Pencatatan biaya perusahaan"><button className="primary" onClick={onAdd}>＋ Biaya</button></Toolbar><div className="panel tablePanel"><div className="tableWrap"><table><thead><tr><th>NO</th><th>TANGGAL</th><th>DESKRIPSI</th><th>STORE</th><th>NOMINAL</th><th></th></tr></thead><tbody>{data.expenses.map(x=><tr key={x.id}><td>{x.expense_no}</td><td>{x.expense_date}</td><td>{x.description}</td><td>{data.stores.find(s=>s.id===x.owner_business_unit_id)?.name||'-'}</td><td><b>{money(x.amount)}</b></td><td><button className="iconBtn" onClick={()=>onDelete(x.id)}>⌫</button></td></tr>)}{!data.expenses.length&&<tr><td colSpan="6" className="empty">Belum ada biaya.</td></tr>}</tbody></table></div></div></>}
function Suppliers({data,onAdd,onDelete}){return <><Toolbar title="Supplier" desc={`${data.suppliers.length} supplier`}><button className="primary" onClick={onAdd}>＋ Supplier</button></Toolbar><div className="panel tablePanel"><div className="tableWrap"><table><thead><tr><th>KODE</th><th>NAMA</th><th>CONTACT</th><th>TELEPON</th><th>EMAIL</th><th></th></tr></thead><tbody>{data.suppliers.map(x=><tr key={x.id}><td>{x.code}</td><td><b>{x.name}</b></td><td>{x.contact||x.contact_person||'-'}</td><td>{x.phone||'-'}</td><td>{x.email||'-'}</td><td><button className="iconBtn" onClick={()=>onDelete(x.id)}>⌫</button></td></tr>)}</tbody></table></div></div></>}
function Warehouses({data,onAdd,onDelete}){return <><Toolbar title="Store & Gudang" desc="Store, gudang dan kode lokasi"><button className="primary" onClick={onAdd}>＋ Gudang</button></Toolbar><div className="panel tablePanel"><div className="tableWrap"><table><thead><tr><th>KODE</th><th>GUDANG</th><th>STORE</th><th></th></tr></thead><tbody>{data.warehouses.map(x=><tr key={x.id}><td><code>{x.code}</code></td><td><b>{x.name}</b></td><td>{data.stores.find(s=>s.id===x.storeId)?.name||'-'}</td><td><button className="iconBtn" onClick={()=>onDelete(x.id)}>⌫</button></td></tr>)}</tbody></table></div></div></>}
function Reports({data,totalSales,totalExpenses}){const byStore=data.stores.map(s=>({name:s.name,sales:data.sales.filter(x=>x.business_unit_id===s.id).reduce((a,x)=>a+Number(x.net_sales_amount||0),0)})); return <><Toolbar title="Laporan" desc="Ringkasan kinerja bisnis"><button className="primary" onClick={()=>window.print()}>🖨 Cetak</button></Toolbar><section className="kpis"><article className="kpi green"><span>Total Penjualan</span><strong>{money(totalSales)}</strong></article><article className="kpi red"><span>Total Biaya</span><strong>{money(totalExpenses)}</strong></article><article className="kpi dark"><span>Laba Kas Sederhana</span><strong>{money(totalSales-totalExpenses)}</strong></article></section><div className="panel"><div className="panelHead"><div><h2>Penjualan per Store</h2><p>Akumulasi transaksi yang tersimpan</p></div></div>{byStore.map(x=><div className="reportRow" key={x.name}><span>{x.name}</span><b>{money(x.sales)}</b></div>)}</div></>}

function Modal({title,children,onClose,onSubmit,submitText='Simpan'}){return <div className="modalOverlay"><div className="modal"><div className="modalHead"><div><h2>{title}</h2><p>Isi data dengan lengkap.</p></div><button onClick={onClose}>×</button></div><form className="form" onSubmit={e=>{e.preventDefault();onSubmit(new FormData(e.currentTarget))}}>{children}<div className="modalActions"><button type="button" className="secondary" onClick={onClose}>Batal</button><button className="primary">{submitText}</button></div></form></div></div>}
function Field({label,name,type='text',required=false,defaultValue=''}){return <label>{label}<input name={name} type={type} required={required} defaultValue={defaultValue}/></label>}
function SelectField({label,name,children,required=false}){return <label>{label}<select name={name} required={required}>{children}</select></label>}
function ProductModal({data,close,submit}){return <Modal title="Tambah Produk" onClose={close} onSubmit={f=>submit(Object.fromEntries(f))}><div className="formRow"><Field label="SKU" name="sku" required/><Field label="Nama produk" name="name" required/></div><div className="formRow"><SelectField label="Kategori" name="categoryId"><option value="">-</option>{data.categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</SelectField><SelectField label="Satuan" name="unitId">{data.units.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</SelectField></div><div className="formRow"><Field label="Harga jual" name="price" type="number"/><Field label="Minimum stok" name="min" type="number"/></div><Field label="Barcode" name="barcode"/><Field label="Catatan" name="notes"/></Modal>}
function SupplierModal({close,submit}){return <Modal title="Tambah Supplier" onClose={close} onSubmit={f=>submit(Object.fromEntries(f))}><div className="formRow"><Field label="Kode" name="code"/><Field label="Nama supplier" name="name" required/></div><Field label="Contact person" name="contact"/><div className="formRow"><Field label="Telepon" name="phone"/><Field label="Email" name="email"/></div><Field label="Alamat" name="address"/></Modal>}
function ExpenseModal({data,close,submit}){return <Modal title="Tambah Biaya" onClose={close} onSubmit={f=>submit(Object.fromEntries(f))}><div className="formRow"><Field label="Tanggal" name="date" type="date" defaultValue={today()} required/><Field label="Nominal" name="amount" type="number" required/></div><SelectField label="Store" name="storeId" required>{data.stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</SelectField><SelectField label="Kategori" name="categoryId" required><option value="">Pilih kategori</option><option value="operasional">Operasional</option><option value="marketing">Marketing</option><option value="transport">Transport</option><option value="listrik">Listrik</option></SelectField><Field label="Deskripsi" name="description" required/></Modal>}
function WarehouseModal({data,close,submit}){return <Modal title="Tambah Gudang" onClose={close} onSubmit={f=>submit(Object.fromEntries(f))}><SelectField label="Store" name="storeId" required>{data.stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</SelectField><div className="formRow"><Field label="Kode gudang" name="code" required/><Field label="Nama gudang" name="name" required/></div></Modal>}
function SaleModal({data,close,submit}){const [p,setP]=useState(data.products[0]?.id||'');const [q,setQ]=useState(1);const [price,setPrice]=useState(Number(data.products[0]?.price||0)); useEffect(()=>{const x=data.products.find(v=>v.id===p);if(x)setPrice(Number(x.price||0))},[p]);return <Modal title="Penjualan Baru" onClose={close} onSubmit={f=>submit({productId:p,qty:Number(q),price:Number(price),discount:Number(f.get('discount')||0),storeId:f.get('storeId'),channel:f.get('channel'),payment:f.get('payment'),customer:f.get('customer')})}><SelectField label="Store" name="storeId" required>{data.stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</SelectField><SelectField label="Produk" name="product" required>{data.products.map(x=><option value={x.id} key={x.id} onClick={()=>setP(x.id)}>{x.sku} — {x.name} (stok {x.stock})</option>)}</SelectField><div className="formRow"><label>Produk aktif<select value={p} onChange={e=>setP(e.target.value)}>{data.products.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><label>Jumlah<input type="number" min="1" value={q} onChange={e=>setQ(e.target.value)}/></label><label>Harga jual<input type="number" min="0" value={price} onChange={e=>setPrice(e.target.value)}/></label></div><div className="formRow"><SelectField label="Channel" name="channel"><option value="OFFLINE">Offline Store</option><option value="SHOPEE">Shopee</option><option value="TIKTOK">TikTok Shop</option><option value="WHATSAPP">WhatsApp</option></SelectField><SelectField label="Pembayaran" name="payment"><option>Tunai</option><option>Transfer Bank</option><option>QRIS</option></SelectField></div><Field label="Customer (opsional)" name="customer"/><Field label="Diskon" name="discount" type="number" defaultValue="0"/></Modal>}
function PurchaseModal({data,close,submit}){const [p,setP]=useState(data.products[0]?.id||'');const [q,setQ]=useState(1);const [cost,setCost]=useState(Number(data.products[0]?.cost||0)); useEffect(()=>{const x=data.products.find(v=>v.id===p);if(x)setCost(Number(x.cost||0))},[p]);return <Modal title="Pembelian Baru" submitText="Simpan Pembelian" onClose={close} onSubmit={f=>submit({productId:p,qty:Number(q),cost:Number(cost),storeId:f.get('storeId'),supplierId:f.get('supplierId'),status:f.get('status')})}><SelectField label="Store" name="storeId" required>{data.stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</SelectField><SelectField label="Supplier" name="supplierId" required>{data.suppliers.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</SelectField><label>Produk<select value={p} onChange={e=>setP(e.target.value)}>{data.products.map(x=><option value={x.id} key={x.id}>{x.sku} — {x.name}</option>)}</select></label><div className="formRow"><label>Jumlah<input type="number" min="1" value={q} onChange={e=>setQ(e.target.value)}/></label><label>Harga beli<input type="number" min="0" value={cost} onChange={e=>setCost(e.target.value)}/></label></div><SelectField label="Status" name="status"><option value="received">Diterima / masuk stok</option><option value="draft">Draft</option></SelectField><div className="infoBox">Saat status <b>Diterima</b>, mode lokal langsung menambah stok dan membuat histori mutasi. Mode Supabase mencatat dokumen pembelian; untuk mutasi stok atomik gunakan RPC produksi.</div></Modal>}
