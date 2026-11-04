import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261104130615 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "booking_resource" ("id" text not null, "name" text not null, "type" text check ("type" in ('staff', 'room', 'equipment', 'venue')) not null, "capacity" integer not null default 1, "timezone" text not null, "is_active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_resource_pkey" primary key ("id"), constraint booking_resource_capacity_positive check (capacity >= 1));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_resource_deleted_at" ON "booking_resource" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "booking" ("id" text not null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "status" text check ("status" in ('pending', 'confirmed', 'cancelled', 'expired', 'completed', 'no_show')) not null default 'pending', "hold_expires_at" timestamptz null, "customer_id" text null, "cart_id" text null, "line_item_id" text null, "notes" text null, "resource_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_pkey" primary key ("id"), constraint booking_ends_after_start check (ends_at > starts_at));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_resource_id" ON "booking" ("resource_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_deleted_at" ON "booking" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_resource_starts_at" ON "booking" ("resource_id", "starts_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_cart_id" ON "booking" ("cart_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "booking_schedule" ("id" text not null, "weekday" integer not null, "start_time" text not null, "end_time" text not null, "resource_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_schedule_pkey" primary key ("id"), constraint booking_schedule_weekday_range check (weekday BETWEEN 0 AND 6), constraint booking_schedule_time_format check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]\$' AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]\$'), constraint booking_schedule_start_before_end check (start_time < end_time));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_schedule_resource_id" ON "booking_schedule" ("resource_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_schedule_deleted_at" ON "booking_schedule" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "booking" add constraint "booking_resource_id_foreign" foreign key ("resource_id") references "booking_resource" ("id") on update cascade;`);

    this.addSql(`alter table if exists "booking_schedule" add constraint "booking_schedule_resource_id_foreign" foreign key ("resource_id") references "booking_resource" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking" drop constraint if exists "booking_resource_id_foreign";`);

    this.addSql(`alter table if exists "booking_schedule" drop constraint if exists "booking_schedule_resource_id_foreign";`);

    this.addSql(`drop table if exists "booking_resource" cascade;`);

    this.addSql(`drop table if exists "booking" cascade;`);

    this.addSql(`drop table if exists "booking_schedule" cascade;`);
  }

}
