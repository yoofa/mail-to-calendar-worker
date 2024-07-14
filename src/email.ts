import ChinaTrain from "./china_train";

interface Env {
  // If you set another name in wrangler.toml as the value for 'binding',
  // replace "DB" with the variable name you defined.
  DB: D1Database;
  MAIL_RECEIVER: string;
  ADDR_OF_12306: string;
  PASS: string;
}

export default {
  async email(message, env, ctx) {
    // 12306 mails
    if (message.to == env.ADDR_OF_12306) {
      ChinaTrain.email(message, env, ctx);
    }
    await message.forward(env.MAIL_RECEIVER, message.headers);
  },
} satisfies ExportedHandler<Env>;
