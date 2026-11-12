import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112002427 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor_payout" drop constraint if exists "vendor_payout_vendor_id_period_currency_code_unique";`);
    this.addSql(`alter table if exists "vendor_admin" drop constraint if exists "vendor_admin_email_unique";`);
    this.addSql(`alter table if exists "vendor" drop constraint if exists "vendor_handle_unique";`);
    this.addSql(`create table if not exists "vendor" ("id" text not null, "handle" text not null, "name" text not null, "email" text not null, "logo" text null, "status" text check ("status" in ('pending', 'active', 'suspended')) not null default 'pending', "commission_rate" real null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_pkey" primary key ("id"), constraint vendor_handle_format check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*\$'), constraint vendor_commission_rate_percent check (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_deleted_at" ON "vendor" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_handle_unique" ON "vendor" ("handle") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_admin" ("id" text not null, "email" text not null, "first_name" text null, "last_name" text null, "vendor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_admin_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_admin_vendor_id" ON "vendor_admin" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_admin_deleted_at" ON "vendor_admin" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_admin_email_unique" ON "vendor_admin" ("email") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_payout" ("id" text not null, "amount" numeric not null, "currency_code" text not null, "period" text not null, "status" text check ("status" in ('pending', 'paid', 'cancelled')) not null default 'pending', "paid_at" timestamptz null, "reference" text null, "vendor_id" text not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_payout_pkey" primary key ("id"), constraint vendor_payout_amount_not_negative check (amount >= 0), constraint vendor_payout_period_format check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])\$'));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_payout_vendor_id" ON "vendor_payout" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_payout_deleted_at" ON "vendor_payout" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_payout_vendor_id_period_currency_code_unique" ON "vendor_payout" ("vendor_id", "period", "currency_code") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "vendor_admin" add constraint "vendor_admin_vendor_id_foreign" foreign key ("vendor_id") references "vendor" ("id") on update cascade;`);

    this.addSql(`alter table if exists "vendor_payout" add constraint "vendor_payout_vendor_id_foreign" foreign key ("vendor_id") references "vendor" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor_admin" drop constraint if exists "vendor_admin_vendor_id_foreign";`);

    this.addSql(`alter table if exists "vendor_payout" drop constraint if exists "vendor_payout_vendor_id_foreign";`);

    this.addSql(`drop table if exists "vendor" cascade;`);

    this.addSql(`drop table if exists "vendor_admin" cascade;`);

    this.addSql(`drop table if exists "vendor_payout" cascade;`);
  }

}
