// Deals with anything relating to Microsoft authentication services

import { Browser, Page } from "puppeteer";
import * as OTPAuth from "otpauth";
import fs from "node:fs";

const EMAIL_BOX_ID: string = "#i0116";
const NEXT_BUTTON_ID: string = "#idSIButton9";
const PASSWORD_FIELD_ID: string = "#i0118";
const TWOFA_FIELD_ID: string = "#idTxtBx_SAOTCC_OTC";
const TWOFA_BUTTON_ID: string = "#idSubmit_SAOTCC_Continue";
const SAVE_LOGGED_BUTTON_ID: string = "#acceptButton";

const ensureDirSync = (dirpath: string) => {
    try {
        if (!fs.existsSync(dirpath)) {
            // Recursive creation
            fs.mkdirSync(dirpath, { recursive: true });
        }
    } catch (err) {
        console.error(`Error creating directory '${dirpath}':`, err);
    }
};

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function attemptAction(page: Page, actions: { selector: string; action: () => Promise<void> }[]): Promise<boolean> {
    const MAX_ATTEMPTS = 10; // Max number of attempts before giving up
    let attempts = 0;
    let success = false;
    let hault = false;
    while (attempts <= MAX_ATTEMPTS && !hault) {
        success = false;
        for (const { selector, action } of actions) {
            try {
                const element = await page.$(selector);
                if (!element) {
                    continue; // element no exists
                }
                await page.evaluate(e1 => {
                    if ("value" in e1) {
                        (e1 as HTMLInputElement | HTMLTextAreaElement).value = ""; // Clear value for input and textarea elements
                    }
                }, element);

                await action();
                success = true;
            } catch (error) {
                console.error(`Error with selector ${selector} on page ${page.url()}:`, error);
                attempts++;
            }
            if (actions[actions.length - 1].selector === selector) {
                hault = true;
                break;
            }
        }
        // Sleep for 2 seconds
        if (success) {
            await sleep((Math.random() * 10 + 5) * 1000);
        }
    }

    if (!success) {
        console.error("Failed to login into Microsoft, giving up...");
        return false;
    }

    return true;
}

// Retrives a 2fa code
function retrive_2fa_code(): string {
    const totp = new OTPAuth.TOTP({
        issuer: "Microsoft",
        label: "Microsoft Login",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: process.env.MICROSOFT_2FA_TOKEN,
    });
    return totp.generate({
        timestamp: Date.now(),
    });
}

// Login into microsoft
export async function login_microsoft(page: Page) {
    const actions = [
        // handle possible redirection
        {
            selector: EMAIL_BOX_ID,
            action: async () => {
                await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 }).catch(() => {});
            },
        },
        // email login
        {
            selector: EMAIL_BOX_ID,
            action: async () => {
                await page.waitForSelector(EMAIL_BOX_ID, { timeout: 10000, visible: true });
                await page.type(EMAIL_BOX_ID, process.env.GRPYHON_EMAIL as string);
            },
        },
        {
            selector: NEXT_BUTTON_ID,
            action: async () => {
                await page
                    .waitForSelector(NEXT_BUTTON_ID, { timeout: 10000, visible: true })
                    .then(button => {
                        return button?.click();
                    })
                    .then(async _ => {
                        try {
                            return await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 10000 });
                        } catch {
                            /* empty */
                        }
                    });
            },
        },
        // password login
        {
            selector: PASSWORD_FIELD_ID,
            action: async () => {
                await page.waitForSelector(PASSWORD_FIELD_ID, { timeout: 10000, visible: true });
                await page.type(PASSWORD_FIELD_ID, process.env.GRPYHON_EMAIL_PASSWORD as string);
            },
        },
        {
            selector: NEXT_BUTTON_ID,
            action: async () => {
                await page.waitForSelector(NEXT_BUTTON_ID, { timeout: 10000, visible: true });
                await page.click(NEXT_BUTTON_ID);
            },
        },
        // 2fa
        {
            selector: TWOFA_FIELD_ID,
            action: async () => {
                await page.waitForSelector(TWOFA_FIELD_ID, { timeout: 10000, visible: true });
                await page.type(TWOFA_FIELD_ID, retrive_2fa_code());
            },
        },
        {
            selector: TWOFA_BUTTON_ID,
            action: async () => {
                await page.waitForSelector(TWOFA_BUTTON_ID, { timeout: 10000, visible: true });
                await page.click(TWOFA_BUTTON_ID);
                await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 5000 }).catch(() => {});
            },
        },
        {
            selector: SAVE_LOGGED_BUTTON_ID,
            action: async () => {
                await page
                    .waitForSelector(SAVE_LOGGED_BUTTON_ID, { timeout: 10000, visible: true })
                    .then(async element => {
                        return element!.click();
                    })
                    .then(async _ => {
                        return page.waitForNavigation({ waitUntil: "networkidle0", timeout: 5000 }).catch(() => {});
                    })
                    .catch(() => {});
            },
        },
    ];

    const success = await attemptAction(page, actions);

    // Retry if fail
    if (!success) {
        console.error("Failed to login into Microsoft, retrying...");
        await login_microsoft(page);
    }
}

// Checks if current login page is a microsoft one
export function is_microsoft_login(page: Page): boolean {
    console.log(`Current url is: ${page.url()}`);
    return page.url().includes("login.microsoftonline.com") || page.url().includes("login.live.com");
}
