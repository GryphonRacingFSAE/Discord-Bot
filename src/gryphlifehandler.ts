import * as http from "http";
import * as ExcelJS from "exceljs";
import * as url from "url";
import cors from "cors";
import dotenv from "dotenv";
// import { Client, TextChannel } from 'discord.js';

dotenv.config();

const hostname: string = "127.0.0.1";
const port: number = 5000;
// Excel File Path
const filePath: string = "";
// const channelId: string = '';

interface Member {
    Name: string;
    email: string;
}

async function processExcelData(client: any, data: Member[]) {
    console.log("Data received:", data);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(1);

    if (!sheet) {
        console.error("Worksheet not found in the workbook");
        return { status: "Worksheet not found", data: [] };
    }

    let gryphLifeColNum: number | null = null;
    
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
            row.eachCell((cell, colNumber) => {
                if (cell.value === "In GryphLife") {
                    gryphLifeColNum = colNumber;
                }
            });
        }
    });

    if (gryphLifeColNum !== null) {
        for (let member of data) {
            let row = 1;
            while (sheet.getCell(`A${row}`).value !== null) {
                row += 1;
            }

            const name = member.Name;
            const email = member.email;
            if (name) {
                sheet.getCell(`A${row}`).value = name;
            }
            if (email) {
                sheet.getCell(`B${row}`).value = email;
            }

            sheet.getCell(`E${row}`).value = "yes";
        }
    } else {
        console.error("Column 'In GryphLife' not found");
    }

    await workbook.xlsx.writeFile(filePath);

    return { status: "Data received", data: data };
}

function respondToRequest(client: any, req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method === "POST" && url.parse(req.url!).pathname === "/receive_data") {
        let body = "";
        req.on("data", (chunk: Buffer) => {
            body += chunk.toString();
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
        cors()(req, res, () => {
            res.statusCode = 404;
            res.end();
        });
    }
}

export async function initiateGryphlifeListener(client: any) {
    console.log("init ran successfully");
    const server = http.createServer((req, res) => {
        respondToRequest(client, req, res);
    });

    server.listen(port, hostname, () => {
        console.log(`Server running at http://${hostname}:${port}/`);
    });

    client.once("ready", () => {
        console.log(`Logged in as ${client.user.tag}!`);
    });
}
