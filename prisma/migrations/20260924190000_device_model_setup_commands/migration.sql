-- CreateTable
CREATE TABLE "DeviceModelSetupCommand" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceModelId" TEXT NOT NULL,

    CONSTRAINT "DeviceModelSetupCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceModelSetupCommand_deviceModelId_sortOrder_idx" ON "DeviceModelSetupCommand"("deviceModelId", "sortOrder");

-- AddForeignKey
ALTER TABLE "DeviceModelSetupCommand" ADD CONSTRAINT "DeviceModelSetupCommand_deviceModelId_fkey" FOREIGN KEY ("deviceModelId") REFERENCES "DeviceModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- H8 setup sequence used when provisioning a unit.
INSERT INTO "DeviceModelSetupCommand" ("id", "sortOrder", "name", "body", "note", "createdAt", "updatedAt", "deviceModelId")
SELECT
    gen_random_uuid()::text,
    v.sort_order,
    v.name,
    v.body,
    v.note,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    dm."id"
FROM "DeviceModel" dm
CROSS JOIN (
    VALUES
        (1, 'Check settings', 'CHECK#', 'Returns the current settings.'),
        (2, 'Set APN (1nce)', 'APN,iot.1nce.net#', '1nce. Use the next command when testing a different SIM.'),
        (3, 'Set APN (test SIM)', 'APN,{apn}#', 'Replace {apn} with the test provider''s APN before copying.'),
        (4, 'Set server', 'SERVER,1,d4.traqcare.com,5151,0#', 'Traqcare.'),
        (5, 'Power alert', 'POWERALM,ON,5,5#', 'Sets the power alert monitor.'),
        (6, 'Movement alert', 'MOVALM,O,100,1,0#', 'Sets the movement alert.'),
        (7, 'Upload timer', 'TIMER,60,60#', 'Sets the data upload interval.'),
        (8, 'Heartbeat', 'HBT,2,#', 'Sets the heartbeat interval.'),
        (9, 'Reset', 'CQ', 'Resets the device. This is not a factory reset.')
) AS v(sort_order, name, body, note)
WHERE dm."name" = 'H8'
  AND NOT EXISTS (
    SELECT 1
    FROM "DeviceModelSetupCommand" existing
    WHERE existing."deviceModelId" = dm."id"
  );
