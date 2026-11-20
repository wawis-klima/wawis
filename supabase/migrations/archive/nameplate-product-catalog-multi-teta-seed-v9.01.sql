-- WAWIS 9.01 — brakujące modele Teta Mirror i agregaty Multi Rotenso
-- Wymaga wcześniejszego uruchomienia nameplate-product-catalog-v8.92.sql.
-- Skrypt idempotentny — można uruchomić ponownie.

begin;

insert into public.nameplate_product_catalog (
  ean, manufacturer, family, model_code, model_name, capacity_kw,
  unit_type, revision, source_type, source_reference, verified
)
values
  ('5905567601200', 'Rotenso', 'Teta Mirror', 'TM35Xi R16', 'Teta Mirror 3,5 kW (TM35Xi R16)', 3.5, 'indoor', 'R16', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('2411950928074', 'Rotenso', 'Teta Mirror', 'TM35Xi R16', 'Teta Mirror 3,5 kW (TM35Xi R16)', 3.5, 'indoor', 'R16', 'confirmed_scan', 'Etykieta logistyczna urządzenia — alias potwierdzony z kodem modelu TM35Xi R16', true),
  ('5905567601620', 'Rotenso', 'Hiro S-Line', 'H40Xm2 R15', 'Hiro S-Line 4,1 kW (H40Xm2 R15)', 4.1, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567601637', 'Rotenso', 'Hiro S-Line', 'H50Xm2 R15', 'Hiro S-Line 5,3 kW (H50Xm2 R15)', 5.3, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567606069', 'Rotenso', 'Hiro S-Line', 'H50Xm3 R15', 'Hiro S-Line 5,3 kW (H50Xm3 R15)', 5.3, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567601644', 'Rotenso', 'Hiro S-Line', 'H60Xm3 R15', 'Hiro S-Line 6,2 kW (H60Xm3 R15)', 6.2, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567601651', 'Rotenso', 'Hiro S-Line', 'H70Xm3 R15', 'Hiro S-Line 7,9 kW (H70Xm3 R15)', 7.9, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567601668', 'Rotenso', 'Hiro S-Line', 'H80Xm4 R15', 'Hiro S-Line 8,2 kW (H80Xm4 R15)', 8.2, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567601675', 'Rotenso', 'Hiro S-Line', 'H100Xm4 R16', 'Hiro S-Line 10,5 kW (H100Xm4 R16)', 10.5, 'outdoor', 'R16', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567601682', 'Rotenso', 'Hiro S-Line', 'H120Xm5 R15', 'Hiro S-Line 12,1 kW (H120Xm5 R15)', 12.1, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567606540', 'Rotenso', 'Hiro N-Line', 'HN40Xm2 R15', 'Hiro N-Line 4,1 kW (HN40Xm2 R15)', 4.1, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567606557', 'Rotenso', 'Hiro N-Line', 'HN50Xm2 R15', 'Hiro N-Line 5,1 kW (HN50Xm2 R15)', 5.1, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567606564', 'Rotenso', 'Hiro N-Line', 'HN70Xm3 R15', 'Hiro N-Line 7,9 kW (HN70Xm3 R15)', 7.9, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567606571', 'Rotenso', 'Hiro N-Line', 'HN90Xm4 R15', 'Hiro N-Line 9,3 kW (HN90Xm4 R15)', 9.3, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567606588', 'Rotenso', 'Hiro N-Line', 'HN120Xm5 R15', 'Hiro N-Line 12,2 kW (HN120Xm5 R15)', 12.2, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567606076', 'Rotenso', 'Hiro HP-Line', 'HHP50Xm2 R15', 'Hiro HP-Line 5,3 kW (HHP50Xm2 R15)', 5.3, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true),
  ('5905567606113', 'Rotenso', 'Hiro HP-Line', 'HHP70Xm3 R15', 'Hiro HP-Line 7,9 kW (HHP70Xm3 R15)', 7.9, 'outdoor', 'R15', 'manufacturer', 'Thermosilesia — oficjalna karta produktu', true)
on conflict (ean) do update set
  manufacturer = excluded.manufacturer,
  family = excluded.family,
  model_code = excluded.model_code,
  model_name = excluded.model_name,
  capacity_kw = excluded.capacity_kw,
  unit_type = excluded.unit_type,
  revision = excluded.revision,
  source_type = excluded.source_type,
  source_reference = excluded.source_reference,
  verified = excluded.verified,
  updated_at = now();

commit;
