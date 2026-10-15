import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261015130059 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pos_register" drop constraint if exists "pos_register_code_unique";`);
    this.addSql(`create table if not exists "pos_register" ("id" text not null, "name" text not null, "code" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pos_register_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pos_register_code_unique" ON "pos_register" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pos_register_deleted_at" ON "pos_register" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "pos_shift" ("id" text not null, "status" text check ("status" in ('open', 'closed')) not null default 'open', "opened_by" text not null, "closed_by" text null, "opened_at" timestamptz not null, "closed_at" timestamptz null, "currency_code" text not null, "opening_cash" numeric not null, "counted_cash" numeric null, "expected_cash" numeric null, "notes" text null, "register_id" text not null, "raw_opening_cash" jsonb not null, "raw_counted_cash" jsonb null, "raw_expected_cash" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "pos_shift_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pos_shift_register_id" ON "pos_shift" ("register_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_pos_shift_deleted_at" ON "pos_shift" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pos_shift_one_open_per_register" ON "pos_shift" ("register_id") WHERE status = 'open' AND deleted_at IS NULL;`);

    this.addSql(`alter table if exists "pos_shift" add constraint "pos_shift_register_id_foreign" foreign key ("register_id") references "pos_register" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "pos_shift" drop constraint if exists "pos_shift_register_id_foreign";`);

    this.addSql(`drop table if exists "pos_register" cascade;`);

    this.addSql(`drop table if exists "pos_shift" cascade;`);
  }

}
