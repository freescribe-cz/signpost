const addMenuItem = document.getElementById('add-current-site');
const rateMenuItem = document.getElementById('rate-extension');
const REVIEWS_URL = 'https://chromewebstore.google.com/detail/signpost-visual-bookmarks/gjcofdjpkgbcaecncclpfofkigeggnif/reviews';
const ADD_LABEL = 'Add page to Signpost';
const BOOKMARKED_LABEL = 'Already bookmarked';

let activeTab = null;
let isAdding = false;

init();

async function init() {
    try {
        activeTab = await getActiveTab();
        validateTab(activeTab);
        if (await hasDesktopBookmark(activeTab.url)) {
            setAddMenuItemState({ disabled: true, label: BOOKMARKED_LABEL });
        }
    } catch (err) {
        setAddMenuItemState({ disabled: true, label: ADD_LABEL });
    }
}

addMenuItem.addEventListener('click', addCurrentSite);
addMenuItem.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    addCurrentSite();
});
rateMenuItem.addEventListener('click', openReviewsPage);
rateMenuItem.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openReviewsPage();
});

async function addCurrentSite() {
    if (isAdding || addMenuItem.getAttribute('aria-disabled') === 'true') return;

    isAdding = true;
    setAddMenuItemState({ disabled: true });

    try {
        const response = await sendMessage({
            type: 'add-current-tab-to-signpost',
            tab: {
                url: activeTab.url,
                title: activeTab.title
            }
        });

        if (!response?.ok) {
            throw new Error(response?.error || 'Could not add this page.');
        }

        setAddMenuItemState({ disabled: true, label: BOOKMARKED_LABEL });
    } catch (err) {
        console.warn('Could not add current tab to Signpost.', err);
        isAdding = false;
        setAddMenuItemState({ disabled: false, label: ADD_LABEL });
    }
}

function setAddMenuItemState({ disabled, label }) {
    if (label) addMenuItem.textContent = label;
    addMenuItem.setAttribute('aria-disabled', String(disabled));
    addMenuItem.tabIndex = disabled ? -1 : 0;
}

function openReviewsPage() {
    chrome.tabs.create({ url: REVIEWS_URL });
}

function getActiveTab() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(tab);
        });
    });
}

function sendMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(response);
        });
    });
}

async function hasDesktopBookmark(url) {
    const [bookmarks, data] = await Promise.all([
        bookmarksSearch({ url }),
        storageGet({ tiles: [] })
    ]);
    const bookmark = bookmarks[0];
    if (!bookmark) return false;

    const tiles = Array.isArray(data.tiles) ? data.tiles : [];

    return tiles.some((tile) => String(tile.id) === String(bookmark.id));
}

function bookmarksSearch(query) {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.search(query, (results) => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(results || []);
        });
    });
}

function storageGet(defaults) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(defaults, (data) => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(data);
        });
    });
}

function validateTab(tab) {
    if (!tab?.url) {
        throw new Error('No active tab URL is available.');
    }

    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only web pages can be added.');
    }
}
