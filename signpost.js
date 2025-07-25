document.addEventListener('DOMContentLoaded', () => {
    // Set how content is applied to widgets
    GridStack.renderCB = function (el, w) {
        el.innerHTML = w.content;
    };
    const grid = GridStack.init();
    // Save layout on changes
    grid.on('change', saveLayout);

    // Load layout on startup
    chrome.storage.sync.get({ tiles: [] }, ({ tiles }) => {
        tiles.forEach(tile => {
            chrome.bookmarks.getSubTree(tile.id, (results) => {
                if (results && results[0]) {
                    addTileToGrid(results[0], tile); // uses stored x/y/w/h
                }
            });
        });
        console.log("Tiles loaded: ", tiles.length, tiles);
    });

    let globalSettings = {
        openInNewTab: false,
        confirmBeforeRemove: false,
        tileSize: 140,
        desktopBackgroundColor: '#ffffff',
        desktopBackgroundImage: null
    };
    const openInNewTabCheckbox = document.getElementById('setting-new-tab');
    const confirmBeforeRemoveCheckbox = document.getElementById('setting-confirm-remove');

    // Load and apply settings
    chrome.storage.sync.get(['globalSettings'], (data) => {
        Object.assign(globalSettings, data.globalSettings || {});
        openInNewTabCheckbox.checked = globalSettings.openInNewTab;
        confirmBeforeRemoveCheckbox.checked = globalSettings.confirmBeforeRemove;
    });
    // Save updated settings on change
    openInNewTabCheckbox.addEventListener('change', () => {
        globalSettings.openInNewTab = openInNewTabCheckbox.checked;
        chrome.storage.sync.set({ globalSettings });
    });
    confirmBeforeRemoveCheckbox.addEventListener('change', () => {
        globalSettings.confirmBeforeRemove = confirmBeforeRemoveCheckbox.checked;
        chrome.storage.sync.set({ globalSettings });
    });

    // Set up buttons and modals
    const btnAdd = document.getElementById('btn-add');
    const btnSettings = document.getElementById('btn-settings');
    const modalAdd = document.getElementById('bookmark-picker');
    const modalSet = document.getElementById('settings-panel');

    btnAdd.addEventListener('click', () => {
        modalAdd.classList.toggle('hidden');
        if (modalSet) modalSet.classList.add('hidden');
        loadBookmarks();
    });

    btnSettings.addEventListener('click', () => {
        if (!modalSet) return;
        const isVisible = modalSet.classList.contains('visible');
        modalSet.classList.toggle('visible', !isVisible);
        modalSet.classList.toggle('hidden', isVisible);
        modalAdd.classList.add('hidden');
    });

    document.querySelectorAll('.modal .btn-close').forEach(btn =>
        btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'))
    );

    document.querySelector('#settings-panel .btn-close')?.addEventListener('click', () => {
        modalSet.classList.remove('visible');
        modalSet.classList.add('hidden');
    });

    // Saving layout
    function saveLayout() {
        const layout = grid.save(false); // false = don't serialize content
        chrome.storage.sync.set({ tiles: layout });
        console.log("Saving layout:", layout.length, layout);
    }

    function loadBookmarks() {
        chrome.bookmarks.getTree(([root]) => {
            const container = document.getElementById('bookmark-tree');
            container.innerHTML = '';
            container.appendChild(createTree(root.children));
        });
    }

    function showBubbleMessage(text, duration = 2000) {
        const bubble = document.getElementById('bubble-message');
        bubble.textContent = text;
        bubble.classList.remove('hidden');
        setTimeout(() => {
            bubble.classList.add('hidden');
        }, duration);
    }

    function createTree(nodes) {
        const ul = document.createElement('ul');

        nodes.forEach(node => {
            const li = document.createElement('li');

            if (node.children) {
                const expandBtn = document.createElement('span');
                expandBtn.textContent = '[+] ';
                expandBtn.style.cursor = 'pointer';
                expandBtn.style.marginRight = '4px';

                const folderSpan = document.createElement('span');
                folderSpan.textContent = `📁 ${node.title}`;
                folderSpan.style.cursor = 'pointer';
                folderSpan.style.fontWeight = 'bold';

                const childUl = createTree(node.children);
                childUl.style.display = 'none';

                expandBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isHidden = childUl.style.display === 'none';
                    childUl.style.display = isHidden ? 'block' : 'none';
                    expandBtn.textContent = isHidden ? '[−] ' : '[+] ';
                });

                folderSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addTileToGrid(node);
                    document.getElementById('bookmark-picker').classList.add('hidden');
                });

                li.appendChild(expandBtn);
                li.appendChild(folderSpan);
                li.appendChild(childUl);
            } else {
                const faviconURL = `https://www.google.com/s2/favicons?sz=32&domain=${new URL(node.url).hostname}`;
                li.innerHTML = `<img class="favicon-tree" src="${faviconURL}"/> ${node.title}`;
                li.style.cursor = 'pointer';

                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addTileToGrid(node);
                    document.getElementById('bookmark-picker').classList.add('hidden');
                });
            }

            ul.appendChild(li);
        });

        return ul;
    }

    function addTileToGrid(bookmark, pos) {
        // Check the widget isn't in the grid yet
        const existingNode = grid.engine.nodes.find(n => n.id === `${bookmark.id}`);
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
            const w = 1, h = 1;
            const gridWidth = grid.getColumn();
            let x = 0, y = 0;
            let found = false;

            outer: for (y = 0; y < 100; y++) { // max 100 rows
                for (x = 0; x <= gridWidth - w; x++) {
                    const collision = grid.engine.nodes.some(n =>
                        x < n.x + n.w &&
                        x + w > n.x &&
                        y < n.y + n.h &&
                        y + h > n.y
                    );
                    if (!collision) {
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
        let tileFooterHTML;
        let tileHeaderTitleText;
        const openTarget = globalSettings.openInNewTab ? '_blank' : '_self';

        if (!bookmark.url) { // FOLDERS
            let childListHTML = '';
            const children = bookmark.children || [];
            children.forEach(child => {
                let contentHTML = '';
                if (child.url) {
                    // Bookmark link
                    const faviconURL = `https://www.google.com/s2/favicons?sz=16&domain=${new URL(child.url).hostname}`;
                    contentHTML = `
    <a class="bookmark-link" href="${child.url}" title="${child.title}" target="${openTarget}">
        <img class="favicon" src="${faviconURL}"/>
    </a>
    `;
                } else {
                    // Folder
                    contentHTML = `
    <span class="bookmark-link bookmark-folder" title="${child.title}" data-id="${child.id}">📁</span>
    `;
                }
                childListHTML += `
    <div class="bookmark-item">
      ${contentHTML}
    </div>
  `;
            });
            tileHeaderTitleText = `📁 ${bookmark.title}`;
            tileBodyHTML = `
              <div class="tile-body folder-content">
                ${childListHTML}
              </div>
              `;
        } else { // LINKS
            const faviconURL = `https://www.google.com/s2/favicons?sz=32&domain=${new URL(bookmark.url).hostname}`;
            tileHeaderTitleText = "";
            tileBodyHTML = `
              <div class="tile-body center">
                <a class="bookmark-link" href="${bookmark.url}" target="${openTarget}">
                    <img class="favicon-large" src="${faviconURL}"/>
                    <p>${bookmark.title}</p>
                </a>
              </div>
              `;
        }
        tileHeaderHTML = `
            <div class="tile-header">
                <div class="folder-title">${tileHeaderTitleText}</div>
                <div class="tile-menu-icon">⁝</div>
                <div class="tile-menu hidden">
                  <div class="tile-menu-item remove-tile">Remove</div>
                </div>
            </div>
            `;
        const tileHTML = `
            ${tileHeaderHTML}
            ${tileBodyHTML}
        `;

        const widget = grid.addWidget({
            x: pos.x, y: pos.y, w: pos.w, h: pos.h,
            content: tileHTML,
            id: `${bookmark.id}`
        });
        console.log("Widget added, ID: ", bookmark.id);

        // After it's mounted
        /* const el = widget.el || grid.engine.nodes[grid.engine.nodes.length - 1].el;
        el.dataset.gsId = `tile-${bookmark.id}`; // GridStack reads on save()
        el.dataset.bookmarkId = bookmark.id;
        el.id = `tile-${bookmark.id}`; // set DOM id for lookup in saveLayout
        */

        addWidgetListeners();

        saveLayout(); // Save every time a new tile is added
    }

    function addWidgetListeners() {
        const tileEl = grid.engine.nodes[grid.engine.nodes.length - 1].el;

        // Toggle menu on icon click
        tileEl.querySelector('.tile-menu-icon')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const menu = tileEl.querySelector('.tile-menu');
            menu.classList.toggle('hidden');
        });

        // Remove widget on menu click
        tileEl.querySelector('.remove-tile')?.addEventListener('click', () => {
            if (!globalSettings.confirmBeforeRemove || confirm("Remove this widget?")) {
                grid.removeWidget(tileEl);
                saveLayout();
            }
        });

        // Add click listeners to child folders
        tileEl.querySelectorAll('.bookmark-folder').forEach(folderEl => {
            folderEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = folderEl.getAttribute('data-id');
                const node = grid.engine.nodes.find(n => n.el === tileEl);
                let x = 0, y = 0;
                if (node) {
                    const gridWidth = grid.getColumn();
                    const proposedX = node.x + node.w;
                    const sameRowWidgets = grid.engine.nodes.filter(n =>
                        n.y < node.y + node.h && n.y + n.h > node.y
                    );
                    const overlapRight = sameRowWidgets.some(n =>
                        n.x < proposedX + 1 && n.x + n.w > proposedX
                    );

                    if (proposedX + 1 <= gridWidth && !overlapRight) {
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

});
