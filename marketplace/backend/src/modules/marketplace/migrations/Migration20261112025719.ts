import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112025719 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor_commission" drop constraint if exists "vendor_commission_order_id_unique";`);
    this.addSql(`create table if not exists "vendor_commission" ("id" text not null, "order_id" text not null, "order_total" numeric not null, "base" numeric not null, "rate" real not null, "amount" numeric not null, "payout_amount" numeric not null, "currency_code" text not null, "status" text check ("status" in ('pending', 'approved', 'paid', 'cancelled')) not null default 'pending', "payout_id" text null, "vendor_id" text not null, "raw_order_total" jsonb not null, "raw_base" jsonb not null, "raw_amount" jsonb not null, "raw_payout_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_commission_pkey" primary key ("id"), constraint vendor_commission_rate_percent check (rate >= 0 AND rate <= 100), constraint vendor_commission_amounts_not_negative check (amount >= 0 AND base >= 0 AND order_total >= 0 AND payout_amount >= 0));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_commission_vendor_id" ON "vendor_commission" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_commission_deleted_at" ON "vendor_commission" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_commission_order_id_unique" ON "vendor_commission" ("order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "vendor_commission" add constraint "vendor_commission_vendor_id_foreign" foreign key ("vendor_id") references "vendor" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_commission" cascade;`);
  }

}
