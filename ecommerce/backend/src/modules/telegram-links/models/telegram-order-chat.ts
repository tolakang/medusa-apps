import { model } from "@medusajs/framework/utils"

// A Telegram chat that asked for updates on an order (TASKS P1-17). Kept in
// its own module: no columns on core tables (plan §3.1). Plain order ID, no
// module link: nothing queries orders through it.
const TelegramOrderChat = model.define("telegram_order_chat", {
  id: model.id().primaryKey(),
  order_id: model.text().index(),
  // Telegram chat IDs can exceed 32 bits (Bot API), so they are kept as text.
  chat_id: model.text(),
})

export default TelegramOrderChat
