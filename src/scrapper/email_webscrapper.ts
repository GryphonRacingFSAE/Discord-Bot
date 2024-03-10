// Scrape the gryphon email and log anyone who has done a payment.
// Start the email webscrapper (this is used only for the events/ready.ts)

import { Browser, Page } from "puppeteer";
import { is_microsoft_login, login_microsoft } from "@/scrapper/microsoft.js";
import { MySql2Database } from "drizzle-orm/mysql2";

const OUTLOOK_URL: string = "https://outlook.office365.com/";

// start navigation to outlook and handle login if needed
async function navigate_to_outlook(page: Page) {
    await page.goto(OUTLOOK_URL, { waitUntil: "networkidle0" });

    // if microsoft login, login via microsoft :)
    if (is_microsoft_login(page)) {
        await login_microsoft(page);
    }

    // TODO: deal with scanning emails
}

// once look is navigated too, navigate in outlook to scan for emails
async function navigate_outlook(page: Page) {}

async function scan_emails(page: Page) {
    // setup a cron task and we sleep
}

export async function on_ready(browser: Browser) {
    const page = await browser.newPage();
    await navigate_to_outlook(page);
}
