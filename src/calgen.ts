import ICalGenerator from "ical-generator";
import { ChinaTrainTicket } from "./types";

export default {
  generate12306Calendar,
};

function generate12306Calendar(
  tickets: Array<ChinaTrainTicket>,
  timezone?: string | null,
  serviceUrl?: string | null,
) {
  const cal = ICalGenerator({
    name: "12306 Tickets",
    url: serviceUrl,
    timezone: timezone || undefined,
  });

  tickets.forEach((ticket) => {
    cal.createEvent({
      id: `${ticket.orderNumber ?? ""}-${ticket.sequence}`,
      start: new Date(ticket.departureTime),
      summary:
        `[12306] ${ticket.startStation}-${ticket.endStation}，${ticket.trainNumber}，${ticket.seatNumber}， 检票口${ticket.gate}， 乘车人：${ticket.buyer}`,
      location: ticket.startStation,
    });
  });

  return cal.toString();
}
