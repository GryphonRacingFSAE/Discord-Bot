// import * as http from "http";
// import * as url from "url";
// import cors from "cors";
// import dotenv from "dotenv";
// import { pushSpreadsheet, pullSpreadsheet, SpreadsheetSingleton } from './vertification';

// // import { Client, TextChannel } from 'discord.js';

// dotenv.config();

// const hostname = "127.0.0.1";
// const port = 5000;
// //Excel File Path
// const filePath = "";
// // const channelId = '';

// async function processExcelData(client, data) {
//     console.log("Data received:", data);

//     // Use the singleton to get the spreadsheet data
//     const spreadsheetSingleton = SpreadsheetSingleton.getInstance();
//     await pullSpreadsheet(spreadsheetSingleton);

//     // Iterate through the received data
//     for (let member of data) {
//         const nameToSearch = member.Name;
//         const email = member.email;
        
//         // Find the member by name in the existing spreadsheet data
//         const existingMember = spreadsheetSingleton._data.find(row => row.name === nameToSearch);

//         if (existingMember) {
//             // If the member is found, update their information
//             existingMember.email = email;
//             existingMember.in_gryphlife = "yes"; // Set the "In GryphLife" column cell to "yes"
//         } else {
//             // If the member is not found, insert the data in the first empty row
//             const newRow = {
//                 name: nameToSearch,
//                 email: email,
//                 discord_identifier: "", // You can set this value if needed
//                 payment_status: "", // You can set this value if needed
//                 in_gryphlife: "yes", // Set the "In GryphLife" column cell to "yes"
//             };
//             spreadsheetSingleton._data.push(newRow);
//         }
//     }

//     // Push the updated data back to the spreadsheet
//     await pushSpreadsheet(spreadsheetSingleton);

//     // Code block below is for testing and debugging
//     // const channel = client.channels.cache.get(channelId);
//     // if (channel) {
//     //     await channel.send('Member added');
//     // }

//     return { status: "Data received", data: data };
// }


// function respondToRequest(client, req, res) {
//     if (req.method === "POST" && url.parse(req.url).pathname === "/receive_data") {
//         let body = "";
//         req.on("data", chunk => {
//             body += chunk.toString(); // convert Buffer to string
//         });
//         req.on("end", async () => {
//             const data = JSON.parse(body);
//             if (data) {
//                 const response = await processExcelData(client, data);
//                 res.writeHead(200, { "Content-Type": "application/json" });
//                 res.end(JSON.stringify(response));
//             } else {
//                 console.log("No data received or not in expected format");
//                 res.writeHead(400, { "Content-Type": "application/json" });
//                 res.end(JSON.stringify({ status: "No data received or not in expected format" }));
//             }
//         });
//     } else {
//         cors(req, res, () => {
//             res.statusCode = 404;
//             res.end();
//         });
//     }
// }

// export async function initiateGryphlifeListener(client) {
//     console.log("init ran successfully");
//     const server = http.createServer((req, res) => {
//         respondToRequest(client, req, res);
//     });

//     server.listen(port, hostname, () => {
//         console.log("Server running at http://${hostname}:${port}/");
//     });

//     client.once("ready", () => {
//         console.log("Logged in as ${client.user.tag}!");
//     });
// }
