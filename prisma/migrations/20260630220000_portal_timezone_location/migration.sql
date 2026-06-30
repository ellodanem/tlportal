-- Portal business timezone and location (defaults: St. Lucia).
ALTER TABLE "AppSettings" ADD COLUMN "businessTimezone" TEXT NOT NULL DEFAULT 'America/St_Lucia';
ALTER TABLE "AppSettings" ADD COLUMN "businessLocation" TEXT NOT NULL DEFAULT 'St. Lucia';
