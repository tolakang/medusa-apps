import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261110071037 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "approval_settings" add column if not exists "approval_threshold" numeric null, add column if not exists "raw_approval_threshold" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "approval_settings" drop column if exists "approval_threshold", drop column if exists "raw_approval_threshold";`);
  }

}
