import * as http from "http";
import * as ExcelJS from "exceljs";
import * as url from "url";
import cors from "cors";
import dotenv from "dotenv";
// import { Client, TextChannel } from 'discord.js';

dotenv.config();

const hostname = "127.0.0.1";
const port = 5000;
//Excel File Path
const filePath = "";
// const channelId = '';

async function processExcelData(client, data) {
    console.log("Data received:", data);

    // Your Excel file path


    // Load the workbook and select the first worksheet
    const workbook = new ExcelJS.default.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(1);

    // Find the column with the header "In GryphLife"
    let gryphLifeColNum = null;
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {  // Assuming the headers are in the first row
            row.eachCell((cell, colNumber) => {
                if (cell.value === "In GryphLife") {
                    gryphLifeColNum = colNumber;
                }
            });
        }
    });

    // If the "In GryphLife" column is found
    if (gryphLifeColNum !== null) {
        // Iterate through the received data
        for (let member of data) {
            // Assume names are in column A, find the first empty row in that column
            let row = 1;
            while (sheet.getCell(`A${row}`).value !== null) {
                row += 1;
            }

            // Write the name and email to the first empty cell in column A and B respectively
            const name = member.Name;
            const email = member.email;
            if (name) {
                sheet.getCell(`A${row}`).value = name;
            }
            if (email) {
                sheet.getCell(`B${row}`).value = email;
            }

            // Set the corresponding "In GryphLife" column cell to "yes"
            sheet.getCell(`E${row}`).value = "yes";
        }
    } else {
        console.error("Column 'In GryphLife' not found");
    }

    // Save the workbook
    await workbook.xlsx.writeFile(filePath);

    //code block below is for testing and debugging
    // const channel = client.channels.cache.get(channelId);
    // if (channel) {
    //     await channel.send('Member added');
    // }

    return { status: "Data received", data: data };
}

function respondToRequest(client, req, res) {
    if (req.method === "POST" && url.parse(req.url).pathname === "/receive_data") {
        let body = "";
        req.on("data", chunk => {
            body += chunk.toString(); // convert Buffer to string
        });
        req.on("end", async () => {
            const data = JSON.parse(body);
            if (data) {
                const response = await processExcelData(client, data);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(response));
            } else {
                console.log("No data received or not in expected format");
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "No data received or not in expected format" }));
            }
        });
    } else {
        cors(req, res, () => {
            res.statusCode = 404;
            res.end();
        });
    }
}

export async function initiateGryphlifeListener(client) {
    console.log("init ran successfully")
    const server = http.createServer((req, res) => {
        respondToRequest(client, req, res);
    });

    server.listen(port, hostname, () => {
        console.log("Server running at http://${hostname}:${port}/");
    });

    client.once("ready", () => {
        console.log("Logged in as ${client.user.tag}!");
    });
}
