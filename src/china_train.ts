import PostalMime from "postal-mime";
import { format } from "date-fns";

import { ChinaTrainTicket } from "./types";
import calgen from "./calgen";

// interface Ticket {
// 	buyer: string | null;
// 	departureTime: string;
// 	startStation: string;
// 	endStation: string;
// 	trainNumber: string;
// 	seatNumber: string;
// 	gate: string | null;
// }

interface Env {
  DB: D1Database;
  PASS: string;
}

export default {
  fetch: fetch,
  email: email,
};

const Train_SENDER_EMAIL = "12306@rails.com.cn";

async function fetch(request: any, env: Env, ctx: any) {
  console.log("12306 fetch");
  const url = new URL(request.url);
  const traveller = url.searchParams.get("traveller");
  const duration = url.searchParams.get("duration");
  const pass = url.searchParams.get("pass");
  const download = url.searchParams.get("download");

  console.log("pass:$(pass), traveller:${traveller}, duration:${duration}");

  // 检查密码
  if (env.PASS && pass !== env.PASS) {
    return new Response("Hello World!");
  }

  // 计算查询时间范围
  const endDate = new Date();
  let startDate;

  if (duration) {
    const match = duration.match(/^(\d+)(year|month)$/);
    if (match) {
      const [, value, unit] = match;
      startDate = new Date(endDate);
      if (unit === "year") {
        startDate.setFullYear(startDate.getFullYear() - parseInt(value));
      } else if (unit === "month") {
        startDate.setMonth(startDate.getMonth() - parseInt(value));
      }
    } else {
      return new Response("Invalid duration parameter", { status: 400 });
    }
  } else {
    // 使用默认日期
    startDate = new Date("2000-01-01");
  }

  // 查询数据库
  let query = `SELECT * FROM EventsOf12306 WHERE departureTime > ?`;
  const queryParams = [format(startDate, "yyyy-MM-dd HH:mm:ss")];

  if (traveller) {
    query += ` AND buyer = ?`;
    queryParams.push(traveller);
  }

  const { results: tickets } = await env.DB.prepare(query).bind(...queryParams)
    .all();

  if (!tickets || tickets.length === 0) {
    return new Response("No tickets found", { status: 404 });
  }

  console.log("goto genera ical");

  // 生成 iCalendar 文件
  // let icalendar = `BEGIN:VCALENDAR\nVERSION:2.0\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n`;

  // tickets.forEach((ticket) => {
  //     icalendar += `BEGIN:VEVENT\n`;
  //     icalendar += `SUMMARY: Train ${ticket.trainNumber} from ${ticket.startStation} to ${ticket.endStation}\n`;
  // 	icalendar += `DTSTART:${format(new Date(ticket.departureTime as string), 'yyyyMMddTHHmmss')}\n`;
  //     icalendar += `DESCRIPTION: Seat ${ticket.seatNumber}, Gate ${ticket.gate}\n`;
  //     icalendar += `LOCATION: ${ticket.startStation}\n`;
  //     icalendar += `END:VEVENT\n`;
  // });

  // icalendar += `END:VCALENDAR`;

  const icalendar = calgen.generate12306Calendar(
    tickets as unknown as ChinaTrainTicket[],
    "Asia/Shanghai",
  );

  console.log(`ical:${icalendar}`);

  return new Response(icalendar, {
    headers: headers_for(!!download),
  });
}

function headers_for(download?: boolean) {
  const contentType = download ? "text/calendar" : "text/plain";
  const filename = "12306_tickets.ical";

  const dispositionType = download ? "attachment" : "inline";
  return {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Content-Disposition": `${dispositionType}; filename="${filename}"`,
  };
}

async function email(message: any, env: Env, ctx: any) {
  const from_mail = message.from;
  const to_mail = message.to;
  const subject = message.headers.get("subject");
  // console.info(`From: ${from_mail}`);
  // console.info(`To: ${to_mail}`);
  // console.info(`Subject: ${subject}`);

  // if (from_mail != Train_SENDER_EMAIL) {
  // 	return;
  // }

  // Parse email
  const rawEmail = await streamToArrayBuffer(message.raw, message.rawSize);
  const parser = new PostalMime();
  const parsedEmail = await parser.parse(rawEmail);
  // console.info(`mail_html: ${parsedEmail.html}`);
  // console.info(`mail_text: ${parsedEmail.text}`);
  // console.info(`mail: ${parsedEmail}`);

  // subject 网上购票系统-用户支付通知 | 网上购票系统-候补订单兑现成功通知 | 网上购票系统-用户改签通知 | 网上购票系统-用户退票通知
  if (
    subject.includes("用户支付通知") || subject.includes("候补订单兑现成功通知")
  ) {
    const { orderNumber, tickets } = buyTicket(parsedEmail.text || "");
    if (orderNumber) {
      await updateDatabase(orderNumber, tickets, env);
    }
  } else if (subject.includes("退票")) {
    const { orderNumber, tickets } = refuncTicket(parsedEmail.text || "");
    if (orderNumber) {
      await updateDatabase(orderNumber, tickets, env);
    }
  } else if (subject.includes("改签")) {
    const { orderNumber, tickets } = changeTicket(parsedEmail.text || "");
    if (orderNumber) {
      await updateDatabase(orderNumber, tickets, env);
    }
  }
}

function buyTicket(mailText: string) {
  // const mailText = `尊敬的 ABC先生：
  // 您好！
  // 您于2024年07月12日在中国铁路客户服务中心网站(12306.cn) 成功购买了1张车票，票款共计100.00元，订单号码 E123456789&nbsp;。 所购车票信息如下：

  // 1.ABC，2024年07月12日12:12开，南京南站-南京站，D1234次列车，1车1A号，二等座，成人票，票价100.0元，检票口B11，电子客票。

  // 温馨提示
  // （1）订单信息查询有效期限为30日。
  // （2）为了确保旅客人身安全和列车运行秩序，车站将在开车时间之前提前停止售票、检票，请合理安排出行时间，提前到乘车站办理换票、安检、验证并到指定场所候车，以免耽误乘车。
  // （3）购买电子客票后如需报销凭证，应在开车前或乘车日期之日起180日内，凭购票时所使用的有效身份证件原件，到车站售票窗口、自动售/取票机换取报销凭证。
  // （4）改签、变更到站、退票相关规则详见退改说明。
  // （5）禁限品和托运物品详细规定详见《铁路旅客禁止、限制携带和托运物品目录》。
  // （6）未尽事项，请详见《铁路旅客运输规程》、 《铁路旅客运输办理细则》、 《铁路旅客电子客票暂行实施办法》、 《铁路互联网售票暂行办法》等规定和车站公告。
  // 感谢您使用中国铁路客户服务中心网站12306.cn！ 本邮件由系统自动发出，请勿回复。
  // 祝旅途愉快！`;

  // 匹配订单号码
  const orderNumberMatch = mailText.match(/订单号码\s([A-Z0-9]+)/);
  const orderNumber = orderNumberMatch ? orderNumberMatch[1] : null;

  // 匹配所有车票信息行
  const ticketLinesMatch = mailText.match(
    /所购车票信息如下：([\s\S]+?)温馨提示/,
  );
  const ticketLines = ticketLinesMatch
    ? ticketLinesMatch[1].trim().split("\n")
    : [];

  // 打印匹配到的每一行车票信息
  console.log("匹配到的车票信息行:");
  ticketLines.forEach((line, index) => {
    console.log(`车票信息行 ${index + 1}: ${line.trim()}`);
  });

  // 解析每行车票信息
  const tickets: ChinaTrainTicket[] = ticketLines.map((line, index) => {
    const parts = line.split("，").map((part) => part.trim());
    const sequenceMatch = parts[0].match(/^\d+\.(.+)/);
    const sequence = sequenceMatch ? parseInt(sequenceMatch[1]) : 0;

    const buyerMatch = parts[0].match(/^\d+\.(.+)/);
    const buyer = buyerMatch ? buyerMatch[1] : null;

    let departureTime = parts[1].replace(/年|月/g, "-").replace(/日/, " ");
    departureTime = departureTime.replace("开", "").trim();
    let arrivalTime = departureTime;

    const [startStation, endStation] = parts[2].split("-");

    const trainNumber = parts[3].replace("次列车", "");

    const seatNumber = parts[4];

    const gateMatch = parts[8].match(/检票口([A-Z0-9]+)/);
    const gate = gateMatch ? gateMatch[1] : null;

    return {
      orderNumber: orderNumber,
      sequence: index + 1,
      buyer,
      departureTime,
      arrivalTime,
      startStation,
      endStation,
      trainNumber,
      seatNumber,
      gate,
    };
  });

  // 输出解析结果
  console.log(`订单号码: ${orderNumber}`);
  tickets.forEach((ticket, index) => {
    console.log(`车票: ${ticket.sequence}`);
    console.log(`订单:${ticket.orderNumber}`);
    console.log(`  购票者: ${ticket.buyer}`);
    console.log(`  发车时间: ${ticket.departureTime}`);
    console.log(`  arrival时间: ${ticket.departureTime}`);
    console.log(`  出发站: ${ticket.startStation}`);
    console.log(`  终点站: ${ticket.endStation}`);
    console.log(`  车次号: ${ticket.trainNumber}`);
    console.log(`  座位号: ${ticket.seatNumber}`);
    console.log(`  检票口: ${ticket.gate}`);
  });

  return {
    orderNumber,
    tickets,
  };
}

function refuncTicket(mailText: string) {
  console.log("refundTicket");
  const orderNumberMatch = mailText.match(/订单号码\s([A-Z0-9]+)&nbsp;/);
  const orderNumber = orderNumberMatch ? orderNumberMatch[1] : null;

  return {
    orderNumber,
    tickets: [],
  };
}

function changeTicket(mailText: string) {
  console.log("changeTicket");
  const orderNumberMatch = mailText.match(/订单号码\s([A-Z0-9]+)&nbsp;/);
  const orderNumber = orderNumberMatch ? orderNumberMatch[1] : null;

  return {
    orderNumber,
    tickets: [],
  };
}

async function updateDatabase(
  orderNumber: string,
  tickets: ChinaTrainTicket[],
  env: Env,
) {
  console.log(`updateDatabase ${orderNumber}`);
  // 创建表格，如果不存在
  await env.DB.prepare(`
		CREATE TABLE IF NOT EXISTS EventsOf12306 (
			orderNumber TEXT,
			sequence INTEGER,
			buyer TEXT,
			departureTime TEXT,
			arrivalTime TEXT,
			startStation TEXT,
			endStation TEXT,
			trainNumber TEXT,
			seatNumber TEXT,
			gate TEXT,
			PRIMARY KEY (orderNumber, sequence)
		)
	`).run();

  // 检查是否已有该订单号的车票，若有则删除
  const { results } = await env.DB.prepare(
    `SELECT * FROM EventsOf12306 WHERE orderNumber = ?`,
  ).bind(orderNumber).all();

  if (results && results.length > 0) {
    console.log(`delete ${orderNumber}`);
    await env.DB.prepare(
      `DELETE FROM EventsOf12306 WHERE orderNumber = ?`,
    ).bind(orderNumber).run();
  }

  console.log("try to create table");

  // // 检查是否已有该订单号的车票，若有则删除
  // const existingTickets = await env.DB.prepare(
  // 	`SELECT * FROM EventsOf12306 WHERE orderNumber = ?`
  // ).bind(orderNumber).all();

  // if (existingTickets.length > 0) {
  //     await env.DB.prepare(
  //         `DELETE FROM Tickets WHERE orderNumber = ?`
  //     ).bind(orderNumber).run();
  // }

  // 插入新的车票信息
  const insertStmt = await env.DB.prepare(`
		INSERT INTO EventsOf12306 (orderNumber, sequence, buyer, departureTime, arrivalTime, startStation, endStation, trainNumber, seatNumber, gate)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

  tickets.forEach(async (ticket, index) => {
    await insertStmt.bind(
      orderNumber,
      ticket.sequence,
      ticket.buyer,
      ticket.departureTime,
      ticket.arrivalTime,
      ticket.startStation,
      ticket.endStation,
      ticket.trainNumber,
      ticket.seatNumber,
      ticket.gate,
    ).run();
  });
}

async function streamToArrayBuffer(stream: any, streamSize: number) {
  let result = new Uint8Array(streamSize);
  let bytesRead = 0;
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result.set(value, bytesRead);
    bytesRead += value.length;
  }
  return result;
}
