-- Traqcare live API clientid (fleet) — one per TL customer, not per device.
ALTER TABLE "Customer" ADD COLUMN "traqcareClientId" TEXT;
