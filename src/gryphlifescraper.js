// ==UserScript==
// @name         My Script
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  A script to do something
// @author       Mani Rash Ahmadi
// @match        https://gryphlife.uoguelph.ca/actioncenter/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

//load this script in TamperMonkey

function getHrefFromHTMLString(htmlString, className) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlString, "text/html");
    var element = doc.querySelector("." + className);
    if (element && element.href) {
        return element.href;
    } else {
        return null;
    }
}

function approveMembers() {
    // Find all buttons with the specified aria-label
    const approveButtons = document.querySelectorAll("[aria-label='Approve member']");

    // Click each button
    // approveButtons.forEach(button => console.log(button));
    approveButtons.forEach(button => button.click());
}
async function fetchURLContent(url) {
    try {
        const response = await fetch(url);
        const data = await response.text();
        return data;
    } catch (error) {
        console.error("Error fetching data:", error);
        return null;
    }
}

async function getTextContentFromHref(href, className) {
    const htmlContent = await fetchURLContent(href);
    if (htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, "text/html");
        const element = doc.querySelector("." + className);
        return element ? element.textContent : null;
    }
    return null;
}

async function processMembers() {
    const members = document.getElementsByClassName("member-modal");
    const memberInfoArray = [];

    for (let member of members) {
        if (member.textContent.includes("Gryphon SAE Racing Team")) {
            continue; // Skip this iteration
        }
        const memberName = member.textContent.trim();
        const memberHref = getHrefFromHTMLString(member.outerHTML, "member-modal");

        if (memberHref) {
            var email = await getTextContentFromHref(memberHref, "email");
            email = email.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)[0];
            memberInfoArray.push({
                Name: memberName,
                email: email
            });
        } else {
            memberInfoArray.push({
                Name: memberName,
                email: null
            });
        }
    }

    GM_xmlhttpRequest({
        method: "POST",
        url: "http://127.0.0.1:5000/receive_data",
        data: JSON.stringify(memberInfoArray),
        headers: {
            "Content-Type": "application/json"
        },
        onload: function (response) {
            console.log("Server response:", response.responseText);
        }
    });

    console.log("Member Info:", memberInfoArray);
    approveMembers();
}

// Example usage
processMembers();
setTimeout(function () {
    window.location.reload();
}, 120000); // 120000 milliseconds = 120 seconds