// use Tampermonkey for chrome and you can allow this script to continue running
// after the page being refreshed 

// // Refresh the page every 10 seconds
// setInterval(() => {
//     location.reload();
// }, 10000);

// Get button text based on class name
function getButtonText(className) {
    const button = document.getElementsByClassName(`.${className}`);
    return button ? button.textContent : null;
}

// Fetch content from a URL
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

function getTextByClass(className) {
    // Get elements by class name
    var elements = document.getElementsByClassName(className);
    
    // Initialize an array to hold the text content of elements
    var texts = [];
    
    // Loop through all found elements
    for(var i = 0; i < elements.length; i++) {
        // Add the text content of each element to the texts array
        texts.push(elements[i].textContent || elements[i].innerText);
    }
    
    // Return the texts array
    return texts;
}

function getHrefFromHTMLString(htmlString, className) {
    // Parse the HTML string into a Document object
    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlString, 'text/html');
    
    // Find the element with the specified class name
    // var element = doc.getElementsByClassName(className)[0];
    // Alternatively, you can use querySelector:
    var element = doc.querySelector('.' + className);
    // console.log(element);
    
    // Check if the element exists and has an href attribute
    if(element && element.href) {
        return element.href;
    } else {
        return null;
    }
}



// Example usage
// console.log(getButtonText('prospectiveAction mdl-button mdl-js-button mdl-button--raised btn-default mdl-button--colored'));
console.log(getTextByClass('prospectiveAction mdl-button mdl-js-button mdl-button--raised btn-default mdl-button--colored'));
// console.log("after")
htmlcont = await fetchURLContent('https://gryphlife.uoguelph.ca/actioncenter/organization/gryphonracing/roster/users/membercard/1151837')
// .then(data => console.log(getHrefFromHTMLString(data, 'email')));;

console.log(getHrefFromHTMLString(htmlcont, 'email'));
// console.log(getHrefFromHTMLString(htmlcont, 'email')) ;  
// .then(data => console.log(data));


