/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import emailHandler from "./email";
import trans from "./china_train";

export interface Env {
  // If you set another name in wrangler.toml as the value for 'binding',
  // replace "DB" with the variable name you defined.
  DB: D1Database;
  MAIL_RECEIVER: string;
  ADDR_OF_12306: string;
  PASS: string;
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/12306")) {
      return await trans.fetch(request, env, ctx);
    }
    return new Response("Hello World!");
  },

  async email(message, env, ctx): Promise<void> {
    await emailHandler.email(message, env, ctx);
  },
} satisfies ExportedHandler<Env>;
