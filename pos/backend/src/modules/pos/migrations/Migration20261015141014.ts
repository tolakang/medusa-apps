import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261015141014 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pos_cashier" drop constraint if exists "pos_cashier_email_unique";`);
    this.addSql(`create table if not exists "pos_cashier" ("id" text not null, "name" text not null, "email" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pos_cashier_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pos_cashier_email_unique" ON "pos_cashier" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pos_cashier_deleted_at" ON "pos_cashier" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "pos_cashier" cascade;`);
  }

}
