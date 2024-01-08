import puppeteer from "puppeteer";

async function getHrefFromHTMLString(htmlString, className) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlString);
    const element = await page.$("." + className);
    if (element) {
        const href = await page.evaluate(el => el.href, element);
        await browser.close();
        return href;
    } else {
        await browser.close();
        return null;
    }
}

async function approveMembers(page) {
    // Find all buttons with the specified aria-label
    const approveButtons = await page.$$("[aria-label='Approve member']");

    // Click each button
    for (const button of approveButtons) {
        await button.click();
    }
}

async function fetchURLContent(url) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    const content = await page.content();
    await browser.close();
    return content;
}

async function getTextContentFromHref(href, className) {
    const htmlContent = await fetchURLContent(href);
    if (htmlContent) {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent);
        const element = await page.$("." + className);
        if (element) {
            const textContent = await page.evaluate(el => el.textContent, element);
            await browser.close();
            return textContent.trim();
        } else {
            await browser.close();
            return null;
        }
    }
    return null;
}

export async function processMembers() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto("https://gryphlife.uoguelph.ca/actioncenter/");
    const members = await page.$$(".member-modal");
    const memberInfoArray = [];

    for (const member of members) {
        const memberName = await member.evaluate(el => el.textContent.trim());
        const memberOuterHTML = await member.evaluate(el => el.outerHTML);
        const memberHref = await getHrefFromHTMLString(memberOuterHTML, "member-modal");

        if (memberHref) {
            const email = await getTextContentFromHref(memberHref, "email");
            const emailMatch = email.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            const emailValue = emailMatch ? emailMatch[0] : null;
            memberInfoArray.push({
                Name: memberName,
                email: emailValue,
            });
        } else {
            memberInfoArray.push({
                Name: memberName,
                email: null,
            });
        }
    }

    await page.setRequestInterception(true);
    page.on("request", request => {
        if (request.url() === "http://127.0.0.1:5000/receive_data") {
            request.continue({
                method: "POST",
                postData: JSON.stringify(memberInfoArray),
                headers: {
                    "Content-Type": "application/json",
                },
            });
        } else {
            request.continue();
        }
    });

    page.on("response", response => {
        if (response.url() === "http://127.0.0.1:5000/receive_data") {
            console.log("Server response:", response.text());
        }
    });

    console.log("Member Info:", memberInfoArray);
    await approveMembers(page);
    await browser.close();
}

// Example usage
processMembers();
setTimeout(function () {
    location.reload();
}, 120000); // 120000 milliseconds = 120 seconds
