import { model } from "@medusajs/framework/utils"

// A Telegram chat that asked for updates on an order (TASKS P1-17). Kept in
// its own module: no columns on core tables (plan §3.1). Plain order ID, no
// module link: nothing queries orders through it.
// One row per order and chat: a second, simultaneous /start for the same
// order can't add a duplicate (unique index; DML EntityIndex `unique`).
const TelegramOrderChat = model
  .define("telegram_order_chat", {
    id: model.id().primaryKey(),
    order_id: model.text().index(),
    // Telegram chat IDs can exceed 32 bits (Bot API), so they are kept as text.
    chat_id: model.text(),
  })
  .indexes([{ on: ["order_id", "chat_id"], unique: true }])

export default TelegramOrderChat
