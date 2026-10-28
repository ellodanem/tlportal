-- Normalize legacy Kerry vendor variants onto the canonical Kerry A vendor.
WITH canonical AS (
  SELECT "id"
  FROM "Vendor"
  WHERE LOWER(TRIM("name")) = 'kerry a'
  ORDER BY "createdAt", "id"
  LIMIT 1
)
UPDATE "VendorBill" AS bill
SET "vendorId" = canonical."id"
FROM canonical, "Vendor" AS source
WHERE source."id" = bill."vendorId"
  AND LOWER(TRIM(source."name")) IN (
    'kerry',
    'kerry a',
    'technician - kerry',
    'technician payment - kerry'
  );

UPDATE "Vendor"
SET "isActive" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE LOWER(TRIM("name")) IN (
  'kerry',
  'technician - kerry',
  'technician payment - kerry'
);
