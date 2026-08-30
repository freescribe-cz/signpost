const ACTION_MENU_ID = 'add-to-signpost';
const SIGNPOST_BOOKMARKS_FOLDER = 'Signpost Bookmarks';
const BOOKMARKS_BAR_ID = '1';
const DEFAULT_GRID_COLUMNS = 18;
const MIN_GRID_COLUMNS = 6;
const MAX_GRID_COLUMNS = 36;

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: ACTION_MENU_ID,
            title: 'Add page to Signpost',
            contexts: ['action']
        });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== ACTION_MENU_ID) return;

    addTabToSignpost(tab)
        .then(() => showTemporaryBadge('OK', tab?.id))
        .catch((err) => {
            console.warn('Could not add current tab to Signpost.', err);
            showTemporaryBadge('ERR', tab?.id);
        });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'add-current-tab-to-signpost') return false;

    addTabToSignpost(message.tab)
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));

    return true;
});

async function addTabToSignpost(tab) {
    const site = getSiteFromTab(tab);
    const bookmark = await getOrCreateBookmark(site);
    const tileResult = await addBookmarkTile(bookmark);

    return {
        bookmark,
        addedTile: tileResult.added,
        alreadyPresent: !tileResult.added
    };
}

function getSiteFromTab(tab) {
    if (!tab?.url) {
        throw new Error('No active tab URL is available.');
    }

    const url = new URL(tab.url);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only web pages can be added to Signpost.');
    }

    return {
        url: tab.url,
        title: tab.title || url.hostname
    };
}

async function getOrCreateSignpostFolder() {
    const children = await bookmarksGetChildren(BOOKMARKS_BAR_ID);
    const existingFolder = children.find((node) =>
        !node.url && node.title === SIGNPOST_BOOKMARKS_FOLDER
    );

    if (existingFolder) return existingFolder;

    return bookmarksCreate({
        parentId: BOOKMARKS_BAR_ID,
        title: SIGNPOST_BOOKMARKS_FOLDER
    });
}

async function getOrCreateBookmark(site) {
    const existingBookmarks = await bookmarksSearch({ url: site.url });
    if (existingBookmarks.length > 0) return existingBookmarks[0];

    const folder = await getOrCreateSignpostFolder();
    const folderId = folder.id;
    const children = await bookmarksGetChildren(folderId);
    const existingBookmark = children.find((node) => node.url === site.url);

    if (existingBookmark) return existingBookmark;

    return bookmarksCreate({
        parentId: folderId,
        title: site.title,
        url: site.url
    });
}

async function addBookmarkTile(bookmark) {
    const data = await storageGet({
        tiles: [],
        globalSettings: {}
    });
    const tiles = Array.isArray(data.tiles) ? data.tiles : [];
    const bookmarkId = String(bookmark.id);

    if (tiles.some((tile) => String(tile.id) === bookmarkId)) {
        return { added: false };
    }

    const columns = normalizeGridColumns(data.globalSettings?.gridColumns);
    const position = findFirstEmptyTilePosition({ w: 1, h: 1 }, tiles, columns);
    const tile = {
        ...position,
        id: bookmarkId,
        backgroundColor: '',
        textColor: ''
    };

    await storageSet({
        tiles: [...tiles, tile],
        setupComplete: true
    });

    return { added: true };
}

function normalizeGridColumns(value) {
    const columns = Number.parseInt(value, 10);
    if (!Number.isFinite(columns)) return DEFAULT_GRID_COLUMNS;
    return Math.min(MAX_GRID_COLUMNS, Math.max(MIN_GRID_COLUMNS, columns));
}

function findFirstEmptyTilePosition(size, tiles, gridWidth) {
    const lastPossibleX = gridWidth - size.w;
    const maxRowsToSearch = Math.max(100, getGridRow(tiles) + 100);

    for (let y = 0; y < maxRowsToSearch; y++) {
        for (let x = 0; x <= lastPossibleX; x++) {
            if (isAreaEmpty(x, y, size, tiles)) {
                return { x, y, w: size.w, h: size.h };
            }
        }
    }

    return { x: 0, y: getGridRow(tiles), w: size.w, h: size.h };
}

function getGridRow(tiles) {
    return tiles.reduce((row, tile) => {
        const y = Number(tile.y) || 0;
        const h = Number(tile.h) || 1;
        return Math.max(row, y + h);
    }, 0);
}

function isAreaEmpty(x, y, size, tiles) {
    return !tiles.some((tile) => areasIntersect(
        { x, y, w: size.w, h: size.h },
        {
            x: Number(tile.x) || 0,
            y: Number(tile.y) || 0,
            w: Number(tile.w) || 1,
            h: Number(tile.h) || 1
        }
    ));
}

function areasIntersect(a, b) {
    return a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y;
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

function bookmarksGetChildren(id) {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(id, (children) => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(children || []);
        });
    });
}

function bookmarksCreate(bookmark) {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.create(bookmark, (created) => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(created);
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

function storageSet(data) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(data, () => {
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve();
        });
    });
}

function showTemporaryBadge(text, tabId) {
    if (!tabId) return;

    chrome.action.setBadgeText({ text, tabId });
    setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId });
    }, 1500);
}
