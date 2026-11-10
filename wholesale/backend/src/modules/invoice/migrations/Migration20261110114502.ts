import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261110114502 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "invoice" drop constraint if exists "invoice_order_id_unique";`);
    this.addSql(`create table if not exists "invoice" ("id" text not null, "display_id" serial, "order_id" text not null, "company_id" text null, "company_name" text null, "tax_id" text null, "payment_terms" text check ("payment_terms" in ('prepaid', 'net_15', 'net_30', 'net_60')) not null default 'prepaid', "issued_at" timestamptz not null, "due_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "invoice_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_deleted_at" ON "invoice" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invoice_order_id_unique" ON "invoice" ("order_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "invoice" cascade;`);
  }

}
