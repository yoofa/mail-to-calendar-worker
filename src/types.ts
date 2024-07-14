/* General workers types */
export interface Env {
  // If you set another name in wrangler.toml as the value for 'binding',
  // replace "DB" with the variable name you defined.
  DB: D1Database;
  MAIL_RECEIVER: string;
  ADDR_OF_12306: string;
  PASS: string;
}

export interface ChinaTrainTicket {
  orderId: string | null;
  index: number | null;
  buyer: string | null;
  departureTime: string;
  arrivalTime: string;
  startStation: string;
  endStation: string;
  trainNumber: string;
  seatNumber: string;
  gate: string | null;
}
