import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260929031509 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "telegram_order_chat" ("id" text not null, "order_id" text not null, "chat_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "telegram_order_chat_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_telegram_order_chat_order_id" ON "telegram_order_chat" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_telegram_order_chat_deleted_at" ON "telegram_order_chat" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "telegram_order_chat" cascade;`);
  }

}
