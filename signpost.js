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

    function colorToRgba(color, alpha) {
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
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        const rgb = color.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgb) {
            return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
        }

        return color;
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
        content.dataset.baseBackgroundColor = color;
        content.style.backgroundColor = colorToRgba(color, getTileAlpha());
    }

    function applyTileTransparencyToAllTiles() {
        grid.getGridItems().forEach(item => {
            applyTileBackground(item, item.gridstackNode?.backgroundColor);
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

    function applyResizeHandleSetting() {
        grid.opts.alwaysShowResizeHandle = globalSettings.alwaysShowResizeHandle;
        grid.getGridItems().forEach(item => grid.prepareDragDrop(item, true));
    }

    // Set how content is applied to widgets
    GridStack.renderCB = function (el, w) {
        el.innerHTML = w.content || '';
        applyTileBackground(el, w.backgroundColor);
        if (w.textColor) {
            const content = el.querySelector('.tile');
            if (content) content.style.color = w.textColor;
        }
    };
    const gridOptions = {
        column: 18,
        float: true,
        margin: 6,
        minRow: 5,
        alwaysShowResizeHandle: false
    }
    const grid = GridStack.init(gridOptions);
    let suppressLayoutSave = false;
    // Save layout on changes
    grid.on('change', saveLayout);

    // Load layout on startup from LOCAL, show first-run setup if empty
    chrome.storage.local.get({ tiles: [], setupComplete: false }, (loc) => {
        let { tiles, setupComplete } = loc;

        if (tiles && tiles.length > 0) {
            renderTiles(tiles);
        } else {
            handleEmpty(setupComplete);
        }
    });

    function getBookmarkSubTree(id) {
        return new Promise(resolve => {
            chrome.bookmarks.getSubTree(String(id), (results) => {
                resolve(results && results[0] ? results[0] : null);
            });
        });
    }

    async function renderTiles(tiles) {
        suppressLayoutSave = true;
        grid.batchUpdate();

        try {
            const bookmarks = await Promise.all(tiles.map(async (tile) => ({
                bookmark: await getBookmarkSubTree(tile.id),
                tile
            })));

            bookmarks.forEach(({ bookmark, tile }) => {
                if (bookmark) addTileToGrid(bookmark, tile);
            });
        } finally {
            grid.batchUpdate(false);
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
        showBubbleMessage('Start with an empty grid');
    });

    const defaultSettings = {
        openInNewTab: false,
        confirmBeforeRemove: false,
        tileSize: 140,
        desktopBackgroundColor: '#ffffff',
        defaultTileBackgroundColor: FALLBACK_TILE_BACKGROUND_COLOR,
        desktopBackgroundImage: null,
        tileBackgroundTransparency: 50,
        alwaysShowResizeHandle: false
    };

    let globalSettings = { ...defaultSettings };

    const openInNewTabCheckbox = document.getElementById('setting-new-tab');
    const confirmBeforeRemoveCheckbox = document.getElementById('setting-confirm-remove');
    const alwaysShowResizeHandleCheckbox = document.getElementById('setting-always-show-resize-handle');
    const backgroundColorInput = document.getElementById('setting-background-color');
    const defaultTileBackgroundColorInput = document.getElementById('setting-default-tile-background-color');
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
        backgroundColorInput.value = globalSettings.desktopBackgroundColor;
        defaultTileBackgroundColorInput.value = getDefaultTileBackgroundColor();
        tileTransparencySlider.value = globalSettings.tileBackgroundTransparency;
        updateTileTransparencyValue();
        document.body.style.backgroundColor = globalSettings.desktopBackgroundColor;
        applyResizeHandleSetting();
        applyTileTransparencyToAllTiles();
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
        removeCachedDesktopBackgroundImage();
        chrome.storage.local.remove('desktopBackgroundImage');
    });
    resetSettingsBtn.addEventListener('click', () => {
        Object.assign(globalSettings, defaultSettings);
        // Apply UI changes
        openInNewTabCheckbox.checked = globalSettings.openInNewTab;
        confirmBeforeRemoveCheckbox.checked = globalSettings.confirmBeforeRemove;
        alwaysShowResizeHandleCheckbox.checked = globalSettings.alwaysShowResizeHandle;
        backgroundColorInput.value = globalSettings.desktopBackgroundColor;
        defaultTileBackgroundColorInput.value = getDefaultTileBackgroundColor();
        tileTransparencySlider.value = globalSettings.tileBackgroundTransparency;
        updateTileTransparencyValue();
        document.body.style.backgroundColor = globalSettings.desktopBackgroundColor;
        applyResizeHandleSetting();
        applyTileTransparencyToAllTiles();
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
                textColor: node.textColor || node.el?.querySelector('.folder-title')?.style.color || ''
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

    function addTileToGrid(bookmark, pos) {
        // Check the widget isn't in the grid yet
        const existingNode = findGridNodeById(bookmark.id);
        if (existingNode) {
            showBubbleMessage("Widget already present!");
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
            const w = 2, h = 2;
            const gridWidth = grid.getColumn();
            let x = 0, y = 0;
            let found = false;

            outer: for (y = 0; y < 100; y++) { // max 100 rows
                for (x = 0; x <= gridWidth - w; x++) {
                    if (grid.isAreaEmpty(x, y, w, h)) {
                        found = true;
                        break outer;
                    }
                }
            }
            pos = { x, y, w, h };
        }

        // Compose tile HTML content
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
        <img class="favicon" src="${escapeHTML(faviconURL)}"/>
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
            tileHeaderTitleText = `📁 ${escapeHTML(bookmark.title)}`;
            tileBodyHTML = `
              <div class="tile-body folder-content">
                ${childListHTML}
              </div>
              `;
        } else { // LINKS
            const faviconURL = getFavicon(bookmark.url, 32);
            tileHeaderTitleText = "";
            tileBodyHTML = `
              <div class="tile-body center">
                <a class="bookmark-link" href="${escapeHTML(bookmark.url)}" title="${escapeHTML(bookmark.title)}" target="${openTarget}">
                    <img class="favicon-large" src="${escapeHTML(faviconURL)}"/>
                    <div class="bookmark-title">${escapeHTML(bookmark.title)}</div>
                </a>
              </div>
              `;
        }
        const textColorItem = !bookmark.url
            ? `<div class="tile-menu-item set-text-color">Set text color</div>`
            : '';
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
            <div class="tile">
            ${tileHeaderHTML}
            ${tileBodyHTML}
            </div>
        `;

        const widget = grid.addWidget({
            x: pos.x, y: pos.y, w: pos.w, h: pos.h,
            content: tileHTML,
            id: `${bookmark.id}`,
            backgroundColor: pos?.backgroundColor || '',
            textColor: pos?.textColor || ''
        });

        if (!widget) return;

        requestAnimationFrame(() => {
            applyTileBackground(widget, pos?.backgroundColor);
            if (!bookmark.url && pos?.textColor) {
                const title = widget.querySelector('.folder-title');
                if (title) title.style.color = pos.textColor;
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
            if (!globalSettings.confirmBeforeRemove || confirm("Remove this widget?")) {
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
            });
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
                openColorPicker((color) => {
                    const title = tileEl.querySelector('.folder-title');
                    if (title) {
                        title.style.color = color;
                    }
                    const node = getGridNode(tileEl);
                    if (node) node.textColor = color;
                    saveLayout();
                });
            });
        }

        // Add click listeners to child folders
        tileEl.querySelectorAll('.bookmark-folder').forEach(folderEl => {
            folderEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = folderEl.getAttribute('data-id');
                const node = getGridNode(tileEl);
                let x = 0, y = 0;
                if (node) {
                    const gridWidth = grid.getColumn();
                    const proposedX = node.x + node.w;

                    if (proposedX + 1 <= gridWidth && grid.isAreaEmpty(proposedX, node.y, 1, 1)) {
                        x = proposedX;
                        y = node.y;
                    } else {
                        x = node.x;
                        y = node.y + node.h;
                    }
                }
                const widgetPos = { x, y, w: 1, h: 1 };
                chrome.bookmarks.getSubTree(folderId, (results) => {
                    if (results && results[0]) {
                        addTileToGrid(results[0], widgetPos);
                    }
                });
            });
        });

    }

    function openColorPicker(onChange) {
        const picker = document.createElement('input');
        picker.type = 'color';
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
