const DESKTOP_BACKGROUND_IMAGE_CACHE_KEY = 'signpost.desktopBackgroundImage';

function applyDesktopBackgroundImage(desktopBackgroundImage) {
    [document.documentElement, document.body].forEach(target => {
        if (!target) return;
        target.style.backgroundImage = `url(${desktopBackgroundImage})`;
        target.style.backgroundSize = 'cover';
        target.style.backgroundPosition = 'center';
        target.style.backgroundRepeat = 'no-repeat';
    });
}

function clearDesktopBackgroundImage() {
    [document.documentElement, document.body].forEach(target => {
        if (!target) return;
        target.style.backgroundImage = '';
    });
}

function cacheDesktopBackgroundImage(desktopBackgroundImage) {
    try {
        localStorage.setItem(DESKTOP_BACKGROUND_IMAGE_CACHE_KEY, desktopBackgroundImage);
    } catch (err) {
        console.warn('Could not cache desktop background image for fast startup.', err);
    }
}

function removeCachedDesktopBackgroundImage() {
    try {
        localStorage.removeItem(DESKTOP_BACKGROUND_IMAGE_CACHE_KEY);
    } catch (err) {
        console.warn('Could not clear cached desktop background image.', err);
    }
}

// Start background loading before DOMContentLoaded so the new tab paints with it sooner.
(() => {
    try {
        const cachedBackgroundImage = localStorage.getItem(DESKTOP_BACKGROUND_IMAGE_CACHE_KEY);
        if (cachedBackgroundImage) {
            applyDesktopBackgroundImage(cachedBackgroundImage);
        }
    } catch (err) {
        console.warn('Could not read cached desktop background image.', err);
    }

    chrome.storage.local.get('desktopBackgroundImage', (data) => {
        if (!data.desktopBackgroundImage) return;
        applyDesktopBackgroundImage(data.desktopBackgroundImage);
        cacheDesktopBackgroundImage(data.desktopBackgroundImage);
    });
})();

document.addEventListener('DOMContentLoaded', () => {

    const FALLBACK_TILE_BACKGROUND_COLOR = '#dbdbdb';
    const DEFAULT_LINK_TEXT_COLOR = '#0000ee';
    const DEFAULT_DESKTOP_TEXT_SIZE = 14;
    const MIN_DESKTOP_TEXT_SIZE = 8;
    const MAX_DESKTOP_TEXT_SIZE = 24;
    const DEFAULT_GRID_COLUMNS = 18;
    const MIN_GRID_COLUMNS = 6;
    const MAX_GRID_COLUMNS = 36;

    try {
        const cachedBackgroundImage = localStorage.getItem(DESKTOP_BACKGROUND_IMAGE_CACHE_KEY);
        if (cachedBackgroundImage) {
            applyDesktopBackgroundImage(cachedBackgroundImage);
        }
    } catch (err) {
        console.warn('Could not read cached desktop background image.', err);
    }

    function getTileAlpha() {
        return 1 - (Number(globalSettings.tileBackgroundTransparency) || 0) / 100;
    }

    function getDefaultTileBackgroundColor() {
        return globalSettings.defaultTileBackgroundColor || FALLBACK_TILE_BACKGROUND_COLOR;
    }

    function getDefaultLinkTextColor() {
        return globalSettings.defaultLinkTextColor || DEFAULT_LINK_TEXT_COLOR;
    }

    function colorToRgba(color, alpha) {
        if (!color) color = getDefaultTileBackgroundColor();

        const rgbComponents = colorToRgbComponents(color);
        if (rgbComponents) {
            return `rgba(${rgbComponents.r}, ${rgbComponents.g}, ${rgbComponents.b}, ${alpha})`;
        }

        return color;
    }

    function colorToRgbComponents(color) {
        if (!color) color = getDefaultTileBackgroundColor();

        const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (hex) {
            let value = hex[1];
            if (value.length === 3) {
                value = value.split('').map(char => char + char).join('');
            }
            const intValue = parseInt(value, 16);
            const r = (intValue >> 16) & 255;
            const g = (intValue >> 8) & 255;
            const b = intValue & 255;
            return { r, g, b };
        }

        const rgb = color.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgb) {
            return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
        }

        return null;
    }

    function normalizeColorPickerValue(color) {
        const match = String(color || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!match) return '';

        let value = match[1];
        if (value.length === 3) {
            value = value.split('').map(char => char + char).join('');
        }

        return `#${value.toLowerCase()}`;
    }

    function mixChannel(value, target, amount) {
        return Math.round(value + (target - value) * amount);
    }

    function getScrollbarColors(color) {
        const rgb = colorToRgbComponents(color);
        if (!rgb) {
            return { thumb: '', track: '' };
        }

        const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
        const target = luminance > 0.55 ? 0 : 255;
        const amount = 0.28;
        const r = mixChannel(rgb.r, target, amount);
        const g = mixChannel(rgb.g, target, amount);
        const b = mixChannel(rgb.b, target, amount);

        return {
            thumb: `rgba(${r}, ${g}, ${b}, 0.32)`,
            track: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`
        };
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);
    }

    function applyTileBackground(tileEl, baseColor) {
        const content = tileEl?.querySelector('.tile');
        if (!content) return;

        const color = baseColor || getDefaultTileBackgroundColor();
        const tileBackground = colorToRgba(color, getTileAlpha());
        const header = content.querySelector('.tile-header');
        const scrollbarColors = getScrollbarColors(color);
        content.dataset.baseBackgroundColor = color;
        content.style.backgroundColor = tileBackground;
        content.style.setProperty('--tile-scrollbar-thumb', scrollbarColors.thumb);
        content.style.setProperty('--tile-scrollbar-track', scrollbarColors.track);
        if (header) {
            header.style.backgroundColor = content.classList.contains('folder-tile') ? tileBackground : '';
        }
    }

    function applyTileTransparencyToAllTiles() {
        grid.getGridItems().forEach(item => {
            applyTileBackground(item, item.gridstackNode?.backgroundColor);
        });
    }

    function applyFolderTitleColor(tileEl, color) {
        if (!color) return;

        const title = tileEl?.querySelector('.folder-title');
        if (title) title.style.color = color;
    }

    function applyBookmarkLinkTextColor(tileEl, color) {
        const tile = tileEl?.querySelector('.tile');
        if (!tile || tile.classList.contains('folder-tile')) return;

        const linkTextColor = color || getDefaultLinkTextColor();
        tile.querySelectorAll('.bookmark-link, .bookmark-title').forEach(el => {
            el.style.color = linkTextColor;
        });
    }

    function applyDefaultLinkTextColorToBookmarkTiles() {
        grid.getGridItems().forEach(item => {
            const node = getGridNode(item);
            if (!node?.textColor) {
                applyBookmarkLinkTextColor(item);
            }
        });
    }

    function findGridNodeById(id) {
        return grid.getGridItems()
            .map(item => item.gridstackNode)
            .find(node => node?.id === String(id));
    }

    function getGridNode(tileEl) {
        return tileEl?.gridstackNode;
    }

    function updateTileTransparencyValue() {
        if (tileTransparencyValue) {
            tileTransparencyValue.textContent = `${globalSettings.tileBackgroundTransparency}%`;
        }
    }

    function normalizeDesktopTextSize(value) {
        const textSize = Number.parseInt(value, 10);
        if (!Number.isFinite(textSize)) return DEFAULT_DESKTOP_TEXT_SIZE;
        return Math.min(MAX_DESKTOP_TEXT_SIZE, Math.max(MIN_DESKTOP_TEXT_SIZE, textSize));
    }

    function updateDesktopTextSizeValue() {
        const textSize = normalizeDesktopTextSize(globalSettings.desktopTextSize);
        if (desktopTextSizeSlider) desktopTextSizeSlider.value = textSize;
        if (desktopTextSizeValue) desktopTextSizeValue.textContent = textSize;
    }

    function applyDesktopTextSizeSetting() {
        const textSize = normalizeDesktopTextSize(globalSettings.desktopTextSize);
        globalSettings.desktopTextSize = textSize;
        updateDesktopTextSizeValue();
        document.body.style.fontSize = `${textSize}px`;
    }

    function normalizeGridColumns(value) {
        const columns = Number.parseInt(value, 10);
        if (!Number.isFinite(columns)) return DEFAULT_GRID_COLUMNS;
        return Math.min(MAX_GRID_COLUMNS, Math.max(MIN_GRID_COLUMNS, columns));
    }

    function updateGridColumnsValue() {
        const columns = normalizeGridColumns(globalSettings.gridColumns);
        if (gridColumnsSlider) gridColumnsSlider.value = columns;
        if (gridColumnsValue) gridColumnsValue.textContent = columns;
    }

    function applyGridColumnSetting({ saveTiles = false } = {}) {
        const columns = normalizeGridColumns(globalSettings.gridColumns);
        globalSettings.gridColumns = columns;
        updateGridColumnsValue();

        if (grid.getColumn() === columns) return;

        grid.column(columns, 'move');
        if (typeof grid.onResize === 'function') grid.onResize();
        if (saveTiles) saveLayout();
    }

    function applyResizeHandleSetting() {
        grid.opts.alwaysShowResizeHandle = globalSettings.alwaysShowResizeHandle;
        grid.getGridItems().forEach(item => grid.prepareDragDrop(item, true));
    }

    function applyMenuIconSetting() {
        document.body.classList.toggle('always-show-menu-icon', globalSettings.alwaysShowMenuIcon);
    }

    // Set how content is applied to widgets
    GridStack.renderCB = function (el, w) {
        el.innerHTML = w.content || '';
        applyTileBackground(el, w.backgroundColor);
        if (el.querySelector('.folder-tile')) {
            applyFolderTitleColor(el, w.textColor);
        } else {
            applyBookmarkLinkTextColor(el, w.textColor);
        }
    };
    const gridOptions = {
        column: DEFAULT_GRID_COLUMNS,
        float: true,
        margin: 6,
        minRow: 5,
        cellHeight: 'auto',
        alwaysShowResizeHandle: false
    }
    const grid = GridStack.init(gridOptions);
    let suppressLayoutSave = false;
    let initialLayoutLoaded = false;
    // Save layout on changes
    grid.on('change', saveLayout);

    function getBookmarkNode(id) {
        return new Promise(resolve => {
            chrome.bookmarks.get(String(id), (results) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                    return;
                }
                resolve(results && results[0] ? results[0] : null);
            });
        });
    }

    function getBookmarkChildren(id) {
        return new Promise(resolve => {
            chrome.bookmarks.getChildren(String(id), (children) => {
                if (chrome.runtime.lastError) {
                    resolve([]);
                    return;
                }
                resolve(children || []);
            });
        });
    }

    async function getBookmarkForTile(id) {
        const bookmark = await getBookmarkNode(id);
        if (!bookmark) return null;

        if (!bookmark.url) {
            bookmark.children = await getBookmarkChildren(bookmark.id);
        }

        return bookmark;
    }

    function createBookmarkSnapshot(bookmark) {
        const isFolder = !bookmark.url;
        return {
            id: String(bookmark.id),
            title: bookmark.title || '',
            url: bookmark.url || '',
            isFolder,
            children: isFolder ? (bookmark.children || []).map(child => ({
                id: String(child.id),
                title: child.title || '',
                url: child.url || '',
                isFolder: !child.url
            })) : []
        };
    }

    function getBookmarkFromTileSnapshot(tile) {
        const snapshot = tile?.bookmarkSnapshot;
        if (!snapshot) return null;

        const id = snapshot.id || tile.id;
        if (!id) return null;

        const isFolder = Boolean(snapshot.isFolder);
        return {
            id: String(id),
            title: snapshot.title || (isFolder ? 'Untitled folder' : 'Untitled bookmark'),
            url: isFolder ? undefined : snapshot.url,
            children: isFolder ? (snapshot.children || []).map(child => ({
                id: String(child.id),
                title: child.title || (child.isFolder ? 'Untitled folder' : 'Untitled bookmark'),
                url: child.isFolder ? undefined : child.url
            })) : []
        };
    }

    function updateTileInGrid(tileEl, bookmark, pos) {
        const node = getGridNode(tileEl);
        const tileHTML = buildTileHTML(bookmark);
        const content = tileEl.querySelector('.grid-stack-item-content') || tileEl;
        content.innerHTML = tileHTML;

        if (node) {
            node.content = tileHTML;
            node.bookmarkSnapshot = createBookmarkSnapshot(bookmark);
        }

        applyTileBackground(tileEl, node?.backgroundColor || pos?.backgroundColor);
        if (!bookmark.url) {
            applyFolderTitleColor(tileEl, node?.textColor || pos?.textColor);
        } else {
            applyBookmarkLinkTextColor(tileEl, node?.textColor || pos?.textColor);
        }

        addWidgetListeners(!bookmark.url, tileEl);
    }

    async function refreshTileFromBookmarks(tile) {
        const bookmark = await getBookmarkForTile(tile.id);
        const existingNode = findGridNodeById(tile.id);
        if (!bookmark) {
            if (existingNode?.el) grid.removeWidget(existingNode.el);
            return;
        }

        if (existingNode?.el) {
            updateTileInGrid(existingNode.el, bookmark, tile);
        } else {
            addTileToGrid(bookmark, tile);
        }
    }

    function loadInitialLayout() {
        if (initialLayoutLoaded) return;
        initialLayoutLoaded = true;

        chrome.storage.local.get({ tiles: [], setupComplete: false }, (loc) => {
            let { tiles, setupComplete } = loc;

            if (tiles && tiles.length > 0) {
                renderTiles(tiles);
            } else {
                handleEmpty(setupComplete);
            }
        });
    }

    async function renderTiles(tiles) {
        const tileList = Array.isArray(tiles) ? tiles : [];
        suppressLayoutSave = true;

        try {
            grid.batchUpdate();
            try {
                tileList.forEach(tile => {
                    const cachedBookmark = getBookmarkFromTileSnapshot(tile);
                    if (cachedBookmark) addTileToGrid(cachedBookmark, tile);
                });
            } finally {
                grid.batchUpdate(false);
            }

            await Promise.all(tileList.map(refreshTileFromBookmarks));
        } finally {
            suppressLayoutSave = false;
            saveLayout();
        }
    }

    // --- Initial Setup Modal ---
    const setupModal = document.getElementById('setup-prompt');
    const btnLoadFromBar = document.getElementById('load-bookmarks');
    const btnStartEmpty = document.getElementById('start-empty');

    function handleEmpty(setupComplete) {
        if (!setupComplete) {
            openModal(setupModal);
        } else {
            // reset flag if user somehow has setupComplete but no tiles
            chrome.storage.local.set({ setupComplete: false });
            openModal(setupModal);
        }
    }

    btnLoadFromBar?.addEventListener('click', async () => {
        // Import top-level items from the Bookmarks Bar
        chrome.bookmarks.getSubTree('1', (results) => {
            const bar = results && results[0];
            if (!bar) {
                alert('Could not access Bookmarks Bar.');
                return;
            }
            const children = bar.children || [];
            if (!children.length) {
                showBubbleMessage('Bookmarks Bar is empty');
            }

            suppressLayoutSave = true;
            grid.batchUpdate();
            try {
                children.forEach(child => addTileToGrid(child));
            } finally {
                grid.batchUpdate(false);
                suppressLayoutSave = false;
            }
            saveLayout();
            chrome.storage.local.set({ setupComplete: true });
            closeModal(setupModal);
            showBubbleMessage('Imported from Bookmarks Bar');
        });
    });

    btnStartEmpty?.addEventListener('click', () => {
        chrome.storage.local.set({ setupComplete: true });
        closeModal(setupModal);
        showBubbleMessage('Start with an empty desktop');
    });

    const defaultSettings = {
        openInNewTab: false,
        confirmBeforeRemove: false,
        tileSize: 140,
        gridColumns: DEFAULT_GRID_COLUMNS,
        desktopBackgroundColor: '#ffffff',
        desktopTextSize: DEFAULT_DESKTOP_TEXT_SIZE,
        defaultTileBackgroundColor: FALLBACK_TILE_BACKGROUND_COLOR,
        defaultLinkTextColor: DEFAULT_LINK_TEXT_COLOR,
        desktopBackgroundImage: null,
        tileBackgroundTransparency: 50,
        alwaysShowResizeHandle: false,
        alwaysShowMenuIcon: false
    };

    let globalSettings = { ...defaultSettings };

    const openInNewTabCheckbox = document.getElementById('setting-new-tab');
    const confirmBeforeRemoveCheckbox = document.getElementById('setting-confirm-remove');
    const alwaysShowResizeHandleCheckbox = document.getElementById('setting-always-show-resize-handle');
    const alwaysShowMenuIconCheckbox = document.getElementById('setting-always-show-menu-icon');
    const backgroundColorInput = document.getElementById('setting-background-color');
    const defaultTileBackgroundColorInput = document.getElementById('setting-default-tile-background-color');
    const defaultLinkTextColorInput = document.getElementById('setting-default-link-text-color');
    const desktopTextSizeSlider = document.getElementById('setting-desktop-text-size');
    const desktopTextSizeValue = document.getElementById('setting-desktop-text-size-value');
    const gridColumnsSlider = document.getElementById('setting-grid-columns');
    const gridColumnsValue = document.getElementById('setting-grid-columns-value');
    const tileTransparencySlider = document.getElementById('setting-tile-transparency');
    const tileTransparencyValue = document.getElementById('setting-tile-transparency-value');
    const backgroundImageInput = document.getElementById('setting-background-image');
    const clearBackgroundBtn = document.getElementById('clear-background');
    const resetSettingsBtn = document.getElementById('reset-settings');

    // Load and apply settings
    chrome.storage.local.get('globalSettings', (data) => {
        Object.assign(globalSettings, data.globalSettings || {});
        openInNewTabCheckbox.checked = globalSettings.openInNewTab;
        confirmBeforeRemoveCheckbox.checked = globalSettings.confirmBeforeRemove;
        alwaysShowResizeHandleCheckbox.checked = globalSettings.alwaysShowResizeHandle;
        alwaysShowMenuIconCheckbox.checked = globalSettings.alwaysShowMenuIcon;
        backgroundColorInput.value = globalSettings.desktopBackgroundColor;
        defaultTileBackgroundColorInput.value = getDefaultTileBackgroundColor();
        defaultLinkTextColorInput.value = getDefaultLinkTextColor();
        applyDesktopTextSizeSetting();
        globalSettings.gridColumns = normalizeGridColumns(globalSettings.gridColumns);
        updateGridColumnsValue();
        tileTransparencySlider.value = globalSettings.tileBackgroundTransparency;
        updateTileTransparencyValue();
        document.body.style.backgroundColor = globalSettings.desktopBackgroundColor;
        applyGridColumnSetting();
        applyResizeHandleSetting();
        applyMenuIconSetting();
        applyTileTransparencyToAllTiles();
        loadInitialLayout();
    });
    // Save updated settings on change
    openInNewTabCheckbox.addEventListener('change', () => {
        globalSettings.openInNewTab = openInNewTabCheckbox.checked;
        chrome.storage.local.set({ globalSettings });
    });
    confirmBeforeRemoveCheckbox.addEventListener('change', () => {
        globalSettings.confirmBeforeRemove = confirmBeforeRemoveCheckbox.checked;
        chrome.storage.local.set({ globalSettings });
    });
    alwaysShowResizeHandleCheckbox.addEventListener('change', () => {
        globalSettings.alwaysShowResizeHandle = alwaysShowResizeHandleCheckbox.checked;
        applyResizeHandleSetting();
        chrome.storage.local.set({ globalSettings });
    });
    alwaysShowMenuIconCheckbox.addEventListener('change', () => {
        globalSettings.alwaysShowMenuIcon = alwaysShowMenuIconCheckbox.checked;
        applyMenuIconSetting();
        chrome.storage.local.set({ globalSettings });
    });
    backgroundColorInput.addEventListener('input', () => {
        globalSettings.desktopBackgroundColor = backgroundColorInput.value;
        document.body.style.backgroundColor = backgroundColorInput.value;
        chrome.storage.local.set({ globalSettings });
    });
    defaultTileBackgroundColorInput.addEventListener('input', () => {
        globalSettings.defaultTileBackgroundColor = defaultTileBackgroundColorInput.value;
        applyTileTransparencyToAllTiles();
        chrome.storage.local.set({ globalSettings });
    });
    defaultLinkTextColorInput.addEventListener('input', () => {
        globalSettings.defaultLinkTextColor = defaultLinkTextColorInput.value;
        applyDefaultLinkTextColorToBookmarkTiles();
        chrome.storage.local.set({ globalSettings });
    });
    desktopTextSizeSlider.addEventListener('input', () => {
        globalSettings.desktopTextSize = normalizeDesktopTextSize(desktopTextSizeSlider.value);
        applyDesktopTextSizeSetting();
        chrome.storage.local.set({ globalSettings });
    });
    gridColumnsSlider.addEventListener('input', () => {
        globalSettings.gridColumns = normalizeGridColumns(gridColumnsSlider.value);
        applyGridColumnSetting({ saveTiles: true });
        chrome.storage.local.set({ globalSettings });
    });
    tileTransparencySlider.addEventListener('input', () => {
        globalSettings.tileBackgroundTransparency = Number(tileTransparencySlider.value);
        updateTileTransparencyValue();
        applyTileTransparencyToAllTiles();
        chrome.storage.local.set({ globalSettings });
    });
    backgroundImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || file.size > 2.5 * 1024 * 1024) {
            alert("Image too large (max 2.5 MB)");
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const desktopBackgroundImage = reader.result;
            applyDesktopBackgroundImage(desktopBackgroundImage);
            cacheDesktopBackgroundImage(desktopBackgroundImage);
            chrome.storage.local.set({ desktopBackgroundImage: desktopBackgroundImage });
        };
        reader.readAsDataURL(file);
    });
    clearBackgroundBtn.addEventListener('click', () => {
        clearDesktopBackgroundImage();
        backgroundImageInput.value = ''; // ← clears the input field
        globalSettings.desktopBackgroundColor = defaultSettings.desktopBackgroundColor;
        backgroundColorInput.value = globalSettings.desktopBackgroundColor;
        document.body.style.backgroundColor = globalSettings.desktopBackgroundColor;
        removeCachedDesktopBackgroundImage();
        chrome.storage.local.remove('desktopBackgroundImage');
        chrome.storage.local.set({ globalSettings });
    });
    resetSettingsBtn.addEventListener('click', () => {
        Object.assign(globalSettings, defaultSettings);
        // Apply UI changes
        openInNewTabCheckbox.checked = globalSettings.openInNewTab;
        confirmBeforeRemoveCheckbox.checked = globalSettings.confirmBeforeRemove;
        alwaysShowResizeHandleCheckbox.checked = globalSettings.alwaysShowResizeHandle;
        alwaysShowMenuIconCheckbox.checked = globalSettings.alwaysShowMenuIcon;
        backgroundColorInput.value = globalSettings.desktopBackgroundColor;
        defaultTileBackgroundColorInput.value = getDefaultTileBackgroundColor();
        defaultLinkTextColorInput.value = getDefaultLinkTextColor();
        applyDesktopTextSizeSetting();
        updateGridColumnsValue();
        tileTransparencySlider.value = globalSettings.tileBackgroundTransparency;
        updateTileTransparencyValue();
        document.body.style.backgroundColor = globalSettings.desktopBackgroundColor;
        applyGridColumnSetting({ saveTiles: true });
        applyResizeHandleSetting();
        applyMenuIconSetting();
        applyTileTransparencyToAllTiles();
        applyDefaultLinkTextColorToBookmarkTiles();
        backgroundImageInput.value = '';
        clearDesktopBackgroundImage();
        removeCachedDesktopBackgroundImage();
        // Clear local image
        chrome.storage.local.remove('desktopBackgroundImage');
        // Save new defaults
        chrome.storage.local.set({ globalSettings });
    });

    // Set up buttons and modals
    const btnAdd = document.getElementById('btn-add');
    const btnSettings = document.getElementById('btn-settings');
    const modalAdd = document.getElementById('bookmark-picker');
    const modalSet = document.getElementById('settings-panel');
    const bookmarkSearch = document.getElementById('bookmark-search');
    const bookmarkCount = document.getElementById('bookmark-count');
    const bookmarkEmpty = document.getElementById('bookmark-empty');

    btnAdd.addEventListener('click', () => {
        if (!modalAdd) return;
        const isVisible = !modalAdd.classList.contains('hidden');
        if (isVisible) {
            closeModal(modalAdd);
        } else {
            closeModal(modalSet);
            openModal(modalAdd);
            if (bookmarkSearch) bookmarkSearch.value = '';
            loadBookmarks();
            requestAnimationFrame(() => bookmarkSearch?.focus());
        }
    });

    btnSettings.addEventListener('click', () => {
        if (!modalSet) return;
        const isVisible = !modalSet.classList.contains('hidden');
        if (isVisible) {
            closeModal(modalSet);
        } else {
            closeModal(modalAdd);
            openModal(modalSet);
        }
    });

    document.querySelectorAll('.modal .btn-close').forEach(btn =>
        btn.addEventListener('click', () => closeModal(btn.closest('.modal')))
    );

    document.querySelector('#settings-panel .btn-close')?.addEventListener('click', () => {
        modalSet.classList.remove('visible');
        closeModal(modalSet);
    });

    bookmarkSearch?.addEventListener('input', () => applyBookmarkFilter(bookmarkSearch.value));

    function openModal(modal) {
        if (!modal) return;
        modal.classList.remove('hidden');
        document.body.classList.add('modal-open');
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.add('hidden');
        if (document.querySelectorAll('.modal:not(.hidden)').length === 0) {
            document.body.classList.remove('modal-open');
        }
    }

    // Saving layout
    function saveLayout() {
        if (suppressLayoutSave || grid.isIgnoreChangeCB()) return;

        const layout = grid.getGridItems().map(item => {
            const node = item.gridstackNode;
            return {
                x: node.x,
                y: node.y,
                w: node.w,
                h: node.h,
                id: node.id,
                backgroundColor: node.backgroundColor || '',
                textColor: node.textColor || node.el?.querySelector('.folder-title')?.style.color || '',
                bookmarkSnapshot: node.bookmarkSnapshot || null
            };
        });
        chrome.storage.local.set({ tiles: layout });
    }

    function loadBookmarks() {
        chrome.bookmarks.getTree(([root]) => {
            const container = document.getElementById('bookmark-tree');
            const sourceNodes = root.children || [];
            const totals = countBookmarkNodes(sourceNodes);

            container.innerHTML = '';
            bookmarkCount.textContent = `${totals.bookmarks} bookmarks and ${totals.folders} folders available.`;
            bookmarkCount.dataset.defaultText = bookmarkCount.textContent;
            container.appendChild(createTree(sourceNodes));
            applyBookmarkFilter(bookmarkSearch?.value || '');
        });
    }

    function countBookmarkNodes(nodes) {
        return nodes.reduce((totals, node) => {
            if (node.children) {
                totals.folders += 1;
                const childTotals = countBookmarkNodes(node.children);
                totals.bookmarks += childTotals.bookmarks;
                totals.folders += childTotals.folders;
            } else {
                totals.bookmarks += 1;
            }

            return totals;
        }, { bookmarks: 0, folders: 0 });
    }

    function showBubbleMessage(text, duration = 2000) {
        const bubble = document.getElementById('bubble-message');
        bubble.textContent = text;
        bubble.classList.remove('hidden');
        setTimeout(() => {
            bubble.classList.add('hidden');
        }, duration);
    }

    function getFavicon(url, size = 32) {
        const u = new URL(chrome.runtime.getURL('/_favicon/'));
        u.searchParams.set('pageUrl', url);
        u.searchParams.set('size', String(size));
        return u.toString();
    }

    function createTree(nodes) {
        const ul = document.createElement('ul');
        ul.className = 'bookmark-tree-list';

        nodes.forEach(node => {
            const li = document.createElement('li');
            const isFolder = Boolean(node.children);
            const title = node.title || (isFolder ? 'Untitled folder' : 'Untitled bookmark');
            li.className = 'bookmark-tree-item';
            li.dataset.title = title.toLowerCase();
            li.dataset.url = (node.url || '').toLowerCase();
            li.dataset.kind = isFolder ? 'folder' : 'bookmark';

            const row = document.createElement('div');
            row.className = 'bookmark-row';

            const expandBtn = document.createElement('button');
            expandBtn.type = 'button';
            expandBtn.className = 'bookmark-expand';
            expandBtn.disabled = true;

            if (isFolder) {
                const children = node.children || [];
                expandBtn.disabled = children.length === 0;
                expandBtn.title = `Expand ${title}`;
                expandBtn.setAttribute('aria-label', `Expand ${title}`);

                const folderIcon = document.createElement('span');
                folderIcon.className = 'bookmark-folder-icon';
                folderIcon.setAttribute('aria-hidden', 'true');
                folderIcon.textContent = '📁';

                const folderButton = document.createElement('button');
                folderButton.type = 'button';
                folderButton.className = 'bookmark-select folder-select';
                folderButton.title = `Add folder: ${title}`;

                const titleSpan = document.createElement('span');
                titleSpan.className = 'bookmark-label';
                titleSpan.textContent = title;

                const metaSpan = document.createElement('span');
                metaSpan.className = 'bookmark-meta';
                metaSpan.textContent = `${children.length} item${children.length === 1 ? '' : 's'}`;

                folderButton.appendChild(titleSpan);
                folderButton.appendChild(metaSpan);

                const childUl = createTree(children);
                childUl.classList.add('collapsed');

                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isExpanded = !childUl.classList.contains('collapsed');
                    setBookmarkFolderExpanded(expandBtn, childUl, !isExpanded, title);
                });

                folderButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addBookmarkFromPicker(node);
                });

                li.appendChild(expandBtn);
                row.appendChild(folderIcon);
                row.appendChild(folderButton);
                li.appendChild(row);
                li.appendChild(childUl);
            } else {
                const faviconURL = getFavicon(node.url, 16);

                const icon = document.createElement('img');
                icon.className = 'favicon-tree';
                icon.src = faviconURL;
                icon.alt = '';

                const bookmarkButton = document.createElement('button');
                bookmarkButton.type = 'button';
                bookmarkButton.className = 'bookmark-select bookmark-link-select';
                bookmarkButton.title = `Add bookmark: ${title}`;

                const titleSpan = document.createElement('span');
                titleSpan.className = 'bookmark-label';
                titleSpan.textContent = title;

                const urlSpan = document.createElement('span');
                urlSpan.className = 'bookmark-meta';
                urlSpan.textContent = node.url || '';

                bookmarkButton.appendChild(titleSpan);
                bookmarkButton.appendChild(urlSpan);

                bookmarkButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addBookmarkFromPicker(node);
                });

                li.appendChild(expandBtn);
                row.appendChild(icon);
                row.appendChild(bookmarkButton);
                li.appendChild(row);
            }

            ul.appendChild(li);
        });

        return ul;
    }

    function setBookmarkFolderExpanded(expandBtn, childUl, expanded, title) {
        childUl.classList.toggle('collapsed', !expanded);
        const action = expanded ? 'Collapse' : 'Expand';
        expandBtn.classList.toggle('expanded', expanded);
        expandBtn.title = `${action} ${title}`;
        expandBtn.setAttribute('aria-label', `${action} ${title}`);
    }

    function addBookmarkFromPicker(node) {
        addTileToGrid(node);
        closeModal(modalAdd);
    }

    function applyBookmarkFilter(query) {
        const container = document.getElementById('bookmark-tree');
        if (!container) return;

        const normalizedQuery = query.trim().toLowerCase();
        const items = Array.from(container.querySelectorAll('.bookmark-tree-item'));

        items.forEach(item => {
            item.classList.remove('search-hidden', 'search-match');
        });

        if (!normalizedQuery) {
            bookmarkEmpty?.classList.add('hidden');
            if (bookmarkCount?.dataset.defaultText) {
                bookmarkCount.textContent = bookmarkCount.dataset.defaultText;
            }
            return;
        }

        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            const ownMatch = item.dataset.title.includes(normalizedQuery) ||
                item.dataset.url.includes(normalizedQuery);
            const childMatches = Array.from(
                item.querySelectorAll(':scope > .bookmark-tree-list > .bookmark-tree-item:not(.search-hidden)')
            );
            const hasMatch = ownMatch || childMatches.length > 0;

            item.classList.toggle('search-hidden', !hasMatch);
            item.classList.toggle('search-match', ownMatch);

            if (hasMatch && item.dataset.kind === 'folder') {
                const expandBtn = item.querySelector(':scope > .bookmark-expand');
                const childUl = item.querySelector(':scope > .bookmark-tree-list');
                const title = item.querySelector(':scope > .bookmark-row .bookmark-label')?.textContent || 'folder';
                if (expandBtn && childUl) {
                    setBookmarkFolderExpanded(expandBtn, childUl, true, title);
                }
            }
        }

        const matchCount = container.querySelectorAll('.bookmark-tree-item.search-match').length;
        bookmarkEmpty?.classList.toggle('hidden', matchCount > 0);
        if (bookmarkCount) {
            bookmarkCount.textContent = `${matchCount} matching item${matchCount === 1 ? '' : 's'}.`;
        }
    }

    function getDefaultTileSize(bookmark) {
        return bookmark?.url ? { w: 1, h: 1 } : { w: 2, h: 2 };
    }

    function canPlaceTileAt(x, y, size) {
        return x >= 0 &&
            y >= 0 &&
            x + size.w <= grid.getColumn() &&
            grid.isAreaEmpty(x, y, size.w, size.h);
    }

    function findFirstEmptyTilePosition(size) {
        const gridWidth = grid.getColumn();
        const lastPossibleX = gridWidth - size.w;
        const maxRowsToSearch = Math.max(100, grid.getRow() + 100);

        for (let y = 0; y < maxRowsToSearch; y++) {
            for (let x = 0; x <= lastPossibleX; x++) {
                if (grid.isAreaEmpty(x, y, size.w, size.h)) {
                    return { x, y, w: size.w, h: size.h };
                }
            }
        }

        return { x: 0, y: grid.getRow(), w: size.w, h: size.h };
    }

    function findChildFolderTilePosition(parentNode, bookmark) {
        const size = getDefaultTileSize(bookmark);
        if (!parentNode) return findFirstEmptyTilePosition(size);

        const gridWidth = grid.getColumn();
        const rightX = parentNode.x + parentNode.w;
        if (canPlaceTileAt(rightX, parentNode.y, size)) {
            return { x: rightX, y: parentNode.y, w: size.w, h: size.h };
        }

        const belowX = Math.min(parentNode.x, Math.max(0, gridWidth - size.w));
        const belowY = parentNode.y + parentNode.h;
        if (canPlaceTileAt(belowX, belowY, size)) {
            return { x: belowX, y: belowY, w: size.w, h: size.h };
        }

        return findFirstEmptyTilePosition(size);
    }

    function buildTileHTML(bookmark) {
        let tileHeaderHTML;
        let tileBodyHTML;
        let tileHeaderTitleText;
        const openTarget = globalSettings.openInNewTab ? '_blank' : '_self';

        if (!bookmark.url) { // FOLDERS
            let childListHTML = '';
            const children = bookmark.children || [];
            children.forEach(child => {
                let contentHTML = '';
                if (child.url) {
                    // Bookmark link
                    const faviconURL = getFavicon(child.url, 16);
                    contentHTML = `
    <a class="bookmark-link" href="${escapeHTML(child.url)}" title="${escapeHTML(child.title)}" target="${openTarget}">
        <img class="favicon" src="${escapeHTML(faviconURL)}" loading="lazy" decoding="async"/>
    </a>
    `;
                } else {
                    // Folder
                    contentHTML = `
    <span class="bookmark-link bookmark-folder" title="${escapeHTML(child.title)}" data-id="${escapeHTML(child.id)}">📁</span>
    `;
                }
                childListHTML += `
    <div class="bookmark-item">
      ${contentHTML}
    </div>
  `;
            });
            tileHeaderTitleText = escapeHTML(bookmark.title);
            tileBodyHTML = `
              <div class="tile-body folder-content">
                ${childListHTML}
              </div>
              `;
        } else { // LINKS
            const faviconURL = getFavicon(bookmark.url, 64);
            tileHeaderTitleText = "";
            tileBodyHTML = `
              <div class="tile-body center">
                <a class="bookmark-link" href="${escapeHTML(bookmark.url)}" title="${escapeHTML(bookmark.title)}" target="${openTarget}">
                    <img class="favicon-large" src="${escapeHTML(faviconURL)}" decoding="async"/>
                    <div class="bookmark-title">${escapeHTML(bookmark.title)}</div>
                </a>
              </div>
              `;
        }
        const textColorItem = bookmark.url
            ? `<div class="tile-menu-item set-link-text-color">Set link text color</div>`
            : `<div class="tile-menu-item set-text-color">Set title color</div>`;
        tileHeaderHTML = `
            <div class="tile-header">
                <div class="folder-title">${tileHeaderTitleText}</div>
                <div class="tile-menu-icon">⁝
                    <div class="tile-menu hidden">
                        <div class="tile-menu-item remove-tile">Remove</div>
                        <div class="tile-menu-item set-bg-color">Set background color</div>
                        <div class="tile-menu-item reset-bg-color">Reset background</div>
                        ${textColorItem}
                    </div>
                </div>
            </div>
            `;
        const tileHTML = `
            <div class="tile${bookmark.url ? '' : ' folder-tile'}">
            ${tileHeaderHTML}
            ${tileBodyHTML}
            </div>
        `;
        return tileHTML;
    }

    function addTileToGrid(bookmark, pos) {
        // Check the widget isn't in the grid yet
        const existingNode = findGridNodeById(bookmark.id);
        if (existingNode) {
            showBubbleMessage("Tile already present!");
            const tileEl = existingNode.el;
            if (tileEl) {
                tileEl.classList.add('widget-flash');
                tileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => tileEl.classList.remove('widget-flash'), 1000);
            }

            return;
        }

        // Calculate position for new widgets
        if (!pos) {
            pos = findFirstEmptyTilePosition(getDefaultTileSize(bookmark));
        }

        // Compose tile HTML content
        const tileHTML = buildTileHTML(bookmark);

        const widget = grid.addWidget({
            x: pos.x, y: pos.y, w: pos.w, h: pos.h,
            content: tileHTML,
            id: `${bookmark.id}`,
            backgroundColor: pos?.backgroundColor || '',
            textColor: pos?.textColor || '',
            bookmarkSnapshot: createBookmarkSnapshot(bookmark)
        });

        if (!widget) return;

        requestAnimationFrame(() => {
            applyTileBackground(widget, pos?.backgroundColor);
            if (!bookmark.url) {
                applyFolderTitleColor(widget, pos?.textColor);
            } else {
                applyBookmarkLinkTextColor(widget, pos?.textColor);
            }
        });

        addWidgetListeners(!bookmark.url, widget);

        saveLayout(); // Save every time a new tile is added
    }

    function addWidgetListeners(isFolder, tileEl) {
        // Toggle menu on icon click
        const icon = tileEl.querySelector('.tile-menu-icon');
        const menu = tileEl.querySelector('.tile-menu');

        icon?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu) {
                menu.classList.toggle('hidden');

                if (!menu.classList.contains('hidden')) {
                    // Position menu relative to icon
                    const iconRect = icon.getBoundingClientRect();
                    const menuRect = menu.getBoundingClientRect();
                    const overflowRight = iconRect.left + menuRect.width > window.innerWidth;

                    menu.classList.remove('flip-left');
                    if (overflowRight) {
                        menu.classList.add('flip-left');
                    }

                    // Close on outside click
                    document.addEventListener('click', function outsideClick(ev) {
                        if (!menu.contains(ev.target) && ev.target !== icon) {
                            menu.classList.add('hidden');
                            document.removeEventListener('click', outsideClick);
                        }
                    });
                }
            }
        });

        // Remove widget on menu click
        tileEl.querySelector('.remove-tile')?.addEventListener('click', () => {
            if (!globalSettings.confirmBeforeRemove || confirm("Remove this tile?")) {
                grid.removeWidget(tileEl);
                saveLayout();
            }
        });
        // Set widget background color
        tileEl.querySelector('.set-bg-color')?.addEventListener('click', (e) => {
            e.stopPropagation();
            tileEl.querySelector('.tile-menu')?.classList.add('hidden');

            openColorPicker((color) => {
                applyTileBackground(tileEl, color);
                const node = getGridNode(tileEl);
                if (node) node.backgroundColor = color;

                saveLayout();
            }, getGridNode(tileEl)?.backgroundColor || getDefaultTileBackgroundColor());
        });
        // Reset background color
        tileEl.querySelector('.reset-bg-color')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const node = getGridNode(tileEl);
            if (node) {
                delete node.backgroundColor;
            }
            applyTileBackground(tileEl);
            saveLayout();
            tileEl.querySelector('.tile-menu')?.classList.add('hidden');
        });

        if (isFolder) {
            // Set text color
            tileEl.querySelector('.set-text-color')?.addEventListener('click', (e) => {
                e.stopPropagation();
                tileEl.querySelector('.tile-menu')?.classList.add('hidden');
                const node = getGridNode(tileEl);
                openColorPicker((color) => {
                    applyFolderTitleColor(tileEl, color);
                    if (node) node.textColor = color;
                    saveLayout();
                }, node?.textColor || tileEl.querySelector('.folder-title')?.style.color || '#000000');
            });
        } else {
            tileEl.querySelector('.set-link-text-color')?.addEventListener('click', (e) => {
                e.stopPropagation();
                tileEl.querySelector('.tile-menu')?.classList.add('hidden');
                const node = getGridNode(tileEl);
                openColorPicker((color) => {
                    applyBookmarkLinkTextColor(tileEl, color);
                    if (node) node.textColor = color;
                    saveLayout();
                }, node?.textColor || getDefaultLinkTextColor());
            });
        }

        // Add click listeners to child folders
        tileEl.querySelectorAll('.bookmark-folder').forEach(folderEl => {
            folderEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = folderEl.getAttribute('data-id');
                const node = getGridNode(tileEl);

                chrome.bookmarks.getSubTree(folderId, (results) => {
                    if (results && results[0]) {
                        const widgetPos = findChildFolderTilePosition(node, results[0]);
                        addTileToGrid(results[0], widgetPos);
                    }
                });
            });
        });

    }

    function openColorPicker(onChange, initialColor) {
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = normalizeColorPickerValue(initialColor) || '#000000';
        picker.style.position = 'absolute';
        picker.style.left = '-9999px';

        picker.addEventListener('input', () => {
            onChange(picker.value);
        });

        // Remove if user clicks away
        const cleanup = () => {
            document.body.removeChild(picker);
            document.removeEventListener('click', handleClickOutside);
        };

        const handleClickOutside = (e) => {
            if (e.target !== picker) cleanup();
        };

        document.addEventListener('click', handleClickOutside);
        document.body.appendChild(picker);
        picker.click();
    }

});
