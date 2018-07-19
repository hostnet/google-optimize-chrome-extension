function doCheck(tabId) {
    chrome.tabs.get(tabId, (tab) => {
        chrome.cookies.get({url: tab.url, name: '_gaexp'}, (optimizeCookie) => {
            if (optimizeCookie) {
                chrome.pageAction.show(tabId);
            } else {
                chrome.pageAction.hide(tabId);
            }
        });
    });
}

chrome.tabs.onActivated.addListener((activeInfo) => doCheck(activeInfo.tabId));
chrome.tabs.onUpdated.addListener((tabId) => doCheck(tabId));
