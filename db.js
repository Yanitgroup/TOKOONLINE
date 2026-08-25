const KEY = "yanit-group-local-v2";

export const seed = {
  stores:[
    {id:"ya",code:"YA",name:"Yanit Agro",type:"store"},
    {id:"br",code:"BR",name:"Bos Ragi",type:"store"},
    {id:"yb",code:"YB",name:"Yanit Barokah",type:"store"},
    {id:"zz",code:"ZZ",name:"Zam Zam Herbal",type:"store"}
  ],
  categories:[{id:"cat-herbal",name:"Herbal"},{id:"cat-food",name:"Makanan"},{id:"cat-other",name:"Lainnya"}],
  units:[{id:"pcs",code:"PCS",name:"Pcs"},{id:"btl",code:"BTL",name:"Botol"},{id:"pack",code:"PACK",name:"Pack"},{id:"kg",code:"KG",name:"Kilogram"}],
  products:[
    {id:"p1",sku:"MDH-500",name:"Madu Hitam Pahit 500 ml",categoryId:"cat-herbal",unitId:"btl",price:85000,cost:58000,min:10,stock:5,location:"YA-R01-L01-B01",active:true},
    {id:"p2",sku:"RGI-011",name:"Ragi Instan 11 gr",categoryId:"cat-food",unitId:"pack",price:15000,cost:9000,min:20,stock:0,location:"BR-R01-L01-B01",active:true},
    {id:"p3",sku:"HJM-250",name:"Herbal Jahe Merah",categoryId:"cat-herbal",unitId:"btl",price:60000,cost:39000,min:15,stock:8,location:"ZZ-R01-L02-B02",active:true}
  ],
  suppliers:[{id:"s1",code:"SUP-001",name:"CV Herbal Sehat",contact:"Budi",phone:"08123456789",email:"sales@herbalsehat.id",active:true}],
  warehouses:[{id:"w1",storeId:"ya",code:"WH-YA",name:"Gudang Yanit Agro"},{id:"w2",storeId:"br",code:"WH-BR",name:"Gudang Bos Ragi"},{id:"w3",storeId:"yb",code:"WH-YB",name:"Gudang Yanit Barokah"},{id:"w4",storeId:"zz",code:"WH-ZZ",name:"Gudang Zam Zam Herbal"}],
  sales:[], purchases:[], expenses:[], movements:[],
  channels:["Shopee","TikTok Shop","Tokopedia","Offline Store","WhatsApp"],
  payments:["Tunai","Transfer Bank","QRIS"]
};

function clone(v){return JSON.parse(JSON.stringify(v));}

export function isRemote(){return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);}

export function loadLocal(){
  if(typeof window === "undefined") return clone(seed);
  const raw=localStorage.getItem(KEY);
  if(!raw){localStorage.setItem(KEY,JSON.stringify(seed));return clone(seed);}
  try{return JSON.parse(raw);}catch{localStorage.setItem(KEY,JSON.stringify(seed));return clone(seed);}
}
export function saveLocal(data){if(typeof window!=="undefined") localStorage.setItem(KEY,JSON.stringify(data)); return data;}

async function remoteFetch(table,{method="GET",query="select=*",body,headers={}}={}){
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!base||!key) throw new Error("Supabase belum dikonfigurasi");
  const res=await fetch(`${base}/rest/v1/${table}?${query}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer: method === "POST" ? "return=representation" : "return=minimal",...headers},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const text=await res.text();
  if(!res.ok) throw new Error(text || `Supabase error ${res.status}`);
  return text?JSON.parse(text):null;
}

export async function apiList(table,query="select=*&order=created_at.desc"){
  if(!isRemote()) return null;
  return remoteFetch(table,{query});
}
export async function apiInsert(table,body){return remoteFetch(table,{method:"POST",query:"select=*",body});}
export async function apiUpdate(table,id,body){return remoteFetch(table,{method:"PATCH",query:`id=eq.${encodeURIComponent(id)}`,body});}
export async function apiDelete(table,id){return remoteFetch(table,{method:"DELETE",query:`id=eq.${encodeURIComponent(id)}`});}
export async function apiRpc(fn, body){
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!base||!key) throw new Error("Supabase belum dikonfigurasi");
  const res=await fetch(`${base}/rest/v1/rpc/${fn}`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
  const text=await res.text();
  if(!res.ok) throw new Error(text||`Supabase RPC error ${res.status}`);
  return text?JSON.parse(text):null;
}

export function money(n){return new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n||0));}
export function csv(rows){
  const keys=Object.keys(rows[0]||{}); const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
  return [keys.map(esc).join(","),...rows.map(r=>keys.map(k=>esc(r[k])).join(","))].join("\n");
}
