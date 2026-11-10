import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261110053800 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "company" add column if not exists "payment_terms" text check ("payment_terms" in ('prepaid', 'net_15', 'net_30', 'net_60')) not null default 'prepaid', add column if not exists "credit_limit" numeric null, add column if not exists "tax_id" text null, add column if not exists "status" text check ("status" in ('pending', 'approved', 'suspended')) not null default 'approved', add column if not exists "raw_credit_limit" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "company" drop column if exists "payment_terms", drop column if exists "credit_limit", drop column if exists "tax_id", drop column if exists "status", drop column if exists "raw_credit_limit";`);
  }

}
