import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261104153358 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "reminder_sent_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking" drop column if exists "reminder_sent_at";`);
  }

}
