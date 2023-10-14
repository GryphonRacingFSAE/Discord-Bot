// ==UserScript==
// @name         My Script
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  A script to do something
// @author       You
// @match        https://gryphlife.uoguelph.ca/actioncenter/*
// @grant        none
// ==/UserScript==
setInterval(() => {
    location.reload();
}, 10000);

function getHrefFromHTMLString(htmlString, className) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlString, 'text/html');
    var element = doc.querySelector('.' + className);
    if(element && element.href) {
        return element.href;
    } else {
        return null;
    }
}

async function fetchURLContent(url) {
    try {
        const response = await fetch(url);
        const data = await response.text();
        return data;
    } catch (error) {
        console.error('Error fetching data:', error);
        return null;
    }
}

async function getTextContentFromHref(href, className) {
    const htmlContent = await fetchURLContent(href);
    if(htmlContent) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const element = doc.querySelector('.' + className);
        return element ? element.textContent : null;
    }
    return null;
}

async function processMembers() {
    const members = document.getElementsByClassName('member-modal');
    const memberInfo = {};

    for(let member of members) {
        if (member.textContent.includes("Gryphon SAE Racing Team")) {
            continue; // Skip this iteration
        }
        const memberName = member.textContent.trim();
        const memberHref = getHrefFromHTMLString(member.outerHTML, 'member-modal');

        if(memberHref) {
            var email = await getTextContentFromHref(memberHref, 'email');
            email = email.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)[0]
            memberInfo[memberName] = email;
        } else {
            memberInfo[memberName] = null;
        }
    }
    fetch('http://localhost:5000/receive_data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(memberInfo)
    })
    .then(response => response.text())
    .then(data => {
        console.log('Server Response:', data);
    })
    .catch((error) => {
        console.error('Error:', error);
    });

    console.log('Member Info:', memberInfo);
}

// Example usage
processMembers();
