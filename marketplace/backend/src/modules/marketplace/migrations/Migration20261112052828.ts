import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261112052828 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor_commission" add column if not exists "refund_review" text check ("refund_review" in ('none', 'to_review', 'settled')) not null default 'none';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor_commission" drop column if exists "refund_review";`);
  }

}
