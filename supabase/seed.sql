insert into business_units (code, name, unit_type) values ('YG', 'Yanit Group', 'group');
insert into business_units (code, name, unit_type, parent_id)
select x.code, x.name, 'store', b.id from (values ('YA','Yanit Agro'),('BR','Bos Ragi'),('YB','Yanit Barokah'),('ZZ','Zam Zam Herbal')) as x(code,name) cross join business_units b where b.code = 'YG';
insert into units (code,name) values ('PCS','Pcs'),('BTL','Botol'),('PACK','Pack'),('KG','Kilogram');
insert into sales_channels (code,name,channel_type) values ('SHOPEE','Shopee','online'),('TIKTOK','TikTok Shop','online'),('TOKOPEDIA','Tokopedia','online'),('OFFLINE','Offline Store','offline'),('WHATSAPP','WhatsApp','offline');
insert into payment_methods (name) values ('Tunai'),('Transfer Bank'),('QRIS');
insert into expense_categories (name) values ('Transport'),('Listrik'),('Internet / WiFi'),('ATK'),('Sewa'),('Gaji'),('Utilities'),('Packaging'),('Marketing'),('Maintenance'),('Operasional'),('Lainnya');
