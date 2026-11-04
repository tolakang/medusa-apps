import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261005110738 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "telegram_order_chat" drop constraint if exists "telegram_order_chat_order_id_chat_id_unique";`);
    // Rows saved twice before the unique index existed (repeat taps on Start)
    // would make the index fail: keep the oldest row per order and chat and
    // soft-delete the rest (the index ignores deleted rows).
    this.addSql(`update "telegram_order_chat" t set "deleted_at" = now() where t."deleted_at" is null and exists (select 1 from "telegram_order_chat" o where o."order_id" = t."order_id" and o."chat_id" = t."chat_id" and o."deleted_at" is null and (o."created_at", o."id") < (t."created_at", t."id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_telegram_order_chat_order_id_chat_id_unique" ON "telegram_order_chat" ("order_id", "chat_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_telegram_order_chat_order_id_chat_id_unique";`);
  }

}
