-- Normalize smart rebooking campaigns out of tenant.settings JSON.

CREATE TYPE "RebookingCampaignType" AS ENUM ('slot_fill', 'cycle_followup');
CREATE TYPE "RebookingCampaignStatus" AS ENUM ('active', 'filled');
CREATE TYPE "RebookingRecipientStatus" AS ENUM ('sent', 'booked', 'closed');

CREATE TABLE "rebooking_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "type" "RebookingCampaignType" NOT NULL,
  "date" DATE NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "message" TEXT NOT NULL,
  "status" "RebookingCampaignStatus" NOT NULL DEFAULT 'active',
  "booked_by_client_id" UUID,
  "slot_options" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "rebooking_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rebooking_campaign_recipients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "first_name" VARCHAR(100) NOT NULL,
  "telegram_id" VARCHAR(32) NOT NULL,
  "service_id" UUID NOT NULL,
  "service_name" VARCHAR(200) NOT NULL,
  "status" "RebookingRecipientStatus" NOT NULL DEFAULT 'sent',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "rebooking_campaign_recipients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rebooking_campaigns_tenant_id_created_at_idx"
  ON "rebooking_campaigns"("tenant_id", "created_at");
CREATE INDEX "rebooking_campaigns_tenant_id_status_idx"
  ON "rebooking_campaigns"("tenant_id", "status");
CREATE INDEX "rebooking_campaigns_tenant_id_date_idx"
  ON "rebooking_campaigns"("tenant_id", "date");
CREATE INDEX "rebooking_campaign_recipients_tenant_id_status_idx"
  ON "rebooking_campaign_recipients"("tenant_id", "status");
CREATE INDEX "rebooking_campaign_recipients_tenant_id_client_id_idx"
  ON "rebooking_campaign_recipients"("tenant_id", "client_id");
CREATE UNIQUE INDEX "rebooking_campaign_recipients_campaign_id_client_id_key"
  ON "rebooking_campaign_recipients"("campaign_id", "client_id");

ALTER TABLE "rebooking_campaigns"
  ADD CONSTRAINT "rebooking_campaigns_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rebooking_campaigns"
  ADD CONSTRAINT "rebooking_campaigns_booked_by_client_id_fkey"
  FOREIGN KEY ("booked_by_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rebooking_campaign_recipients"
  ADD CONSTRAINT "rebooking_campaign_recipients_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "rebooking_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rebooking_campaign_recipients"
  ADD CONSTRAINT "rebooking_campaign_recipients_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rebooking_campaign_recipients"
  ADD CONSTRAINT "rebooking_campaign_recipients_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;