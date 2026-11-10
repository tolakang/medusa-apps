import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261110132341 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "seller_commission" drop constraint if exists "seller_commission_order_id_unique";`);
    this.addSql(`alter table if exists "seller" drop constraint if exists "seller_domain_unique";`);
    this.addSql(`alter table if exists "seller" drop constraint if exists "seller_handle_unique";`);
    this.addSql(`create table if not exists "seller" ("id" text not null, "handle" text not null, "name" text not null, "email" text not null, "domain" text null, "status" text check ("status" in ('pending', 'active', 'suspended')) not null default 'pending', "commission_rate" real null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_pkey" primary key ("id"), constraint seller_handle_format check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*\$'), constraint seller_domain_format check (domain IS NULL OR domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\$'), constraint seller_commission_rate_percent check (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_deleted_at" ON "seller" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_handle_unique" ON "seller" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_domain_unique" ON "seller" ("domain") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "seller_commission" ("id" text not null, "order_id" text not null, "order_total" numeric not null, "rate" real not null, "amount" numeric not null, "currency_code" text not null, "status" text check ("status" in ('pending', 'approved', 'paid', 'cancelled')) not null default 'pending', "paid_at" timestamptz null, "seller_id" text not null, "raw_order_total" jsonb not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_commission_pkey" primary key ("id"), constraint seller_commission_rate_percent check (rate >= 0 AND rate <= 100), constraint seller_commission_amount_not_negative check (amount >= 0 AND order_total >= 0));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_commission_seller_id" ON "seller_commission" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_commission_deleted_at" ON "seller_commission" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_seller_commission_order_id_unique" ON "seller_commission" ("order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_commission" add constraint "seller_commission_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "seller_commission" drop constraint if exists "seller_commission_seller_id_foreign";`);

    this.addSql(`drop table if exists "seller" cascade;`);

    this.addSql(`drop table if exists "seller_commission" cascade;`);
  }

}
