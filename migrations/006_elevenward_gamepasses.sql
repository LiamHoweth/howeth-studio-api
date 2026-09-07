ALTER TABLE elevenward.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_entitlement_id_check;

ALTER TABLE elevenward.entitlements
  ADD CONSTRAINT entitlements_entitlement_id_check
  CHECK (entitlement_id IN (
    'extra_career_slots',
    'supporter_pack',
    'vip_starter_pack',
    'double_development',
    'double_money',
    'all_access'
  ));
