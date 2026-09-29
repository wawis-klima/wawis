-- v11.83 — korekta oficjalnych mocy bieżącej rewizji Rotenso Roni R18.
-- Źródło: oficjalna karta produktu Rotenso Roni (2026/2027).
-- Nie zmieniamy kodów modeli, EAN-ów, rewizji ani starszych R17.
-- Zmiana jest idempotentna i ograniczona do czterech dokładnych EAN-ów R18.

update public.nameplate_product_catalog
set
  model_name = 'Roni 3,4 kW (R35Xi R18)',
  capacity_kw = 3.4,
  updated_at = now()
where manufacturer = 'Rotenso'
  and ean = '5905567609084'
  and model_code = 'R35Xi R18';

update public.nameplate_product_catalog
set
  model_name = 'Roni 3,4 kW (R35Xo R18)',
  capacity_kw = 3.4,
  updated_at = now()
where manufacturer = 'Rotenso'
  and ean = '5905567609091'
  and model_code = 'R35Xo R18';

update public.nameplate_product_catalog
set
  model_name = 'Roni 5,1 kW (R50Xi R18)',
  capacity_kw = 5.1,
  updated_at = now()
where manufacturer = 'Rotenso'
  and ean = '5905567609107'
  and model_code = 'R50Xi R18';

update public.nameplate_product_catalog
set
  model_name = 'Roni 5,1 kW (R50Xo R18)',
  capacity_kw = 5.1,
  updated_at = now()
where manufacturer = 'Rotenso'
  and ean = '5905567609114'
  and model_code = 'R50Xo R18';
