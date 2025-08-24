document.addEventListener('DOMContentLoaded', () => {
    // Set how content is applied to widgets
    GridStack.renderCB = function (el, w) {
        el.innerHTML = w.content;
        if (w.backgroundColor) {
            const content = el.querySelector('.tile');
            if (content) content.style.backgroundColor = w.backgroundColor;
        }
        if (w.textColor) {
            const content = el.querySelector('.tile');
            if (content) content.style.color = w.textColor;
        }
    };
    const gridOptions = {
        cellHeight: 'initial',
        column: 18,
        float: true,
        margin: 6,
        minRow: 5
    }
    const grid = GridStack.init(gridOptions);
    // Save layout on changes
    grid.on('change', saveLayout);

    // Load layout on startup + show first-run setup if empty
    chrome.storage.sync.get({ tiles: [], setupComplete: false }, ({ tiles, setupComplete }) => {
        if (tiles.length > 0) {
            tiles.forEach(tile => {
                chrome.bookmarks.getSubTree(tile.id, (results) => {
                    if (results && results[0]) {
                        addTileToGrid(results[0], tile); // uses stored x/y/w/h
                    }
                });
            });
        } else if (!setupComplete) {
            openModal(document.getElementById('setup-prompt'));
        }
    });

    // --- Initial Setup Modal ---
    const setupModal = document.getElementById('setup-prompt');
    const btnLoadFromBar = document.getElementById('load-bookmarks');
    const btnStartEmpty = document.getElementById('start-empty');

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

            // Batch add for smoother GridStack updates
            if (grid.batchUpdate) grid.batchUpdate();
            children.forEach(child => addTileToGrid(child));
            if (grid.batchUpdate) grid.batchUpdate(false);

            saveLayout();
            chrome.storage.sync.set({ setupComplete: true });
            closeModal(setupModal);
            showBubbleMessage('Imported from Bookmarks Bar');
        });
    });

    btnStartEmpty?.addEventListener('click', () => {
        chrome.storage.sync.set({ setupComplete: true });
        closeModal(setupModal);
        showBubbleMessage('Start with an empty grid');
    });

    const defaultSettings = {
        openInNewTab: false,
        confirmBeforeRemove: false,
        tileSize: 140,
        desktopBackgroundColor: '#ffffff',
        desktopBackgroundImage: null
    };

    let globalSettings = { ...defaultSettings };

    const openInNewTabCheckbox = document.getElementById('setting-new-tab');
    const confirmBeforeRemoveCheckbox = document.getElementById('setting-confirm-remove');
    const backgroundColorInput = document.getElementById('setting-background-color');
    const backgroundImageInput = document.getElementById('setting-background-image');
    const clearBackgroundBtn = document.getElementById('clear-background');
    const resetSettingsBtn = document.getElementById('reset-settings');

    // Load and apply settings
    chrome.storage.sync.get(['globalSettings'], (data) => {
        Object.assign(globalSettings, data.globalSettings || {});
        openInNewTabCheckbox.checked = globalSettings.openInNewTab;
        confirmBeforeRemoveCheckbox.checked = globalSettings.confirmBeforeRemove;
        backgroundColorInput.value = globalSettings.desktopBackgroundColor;
        document.body.style.backgroundColor = globalSettings.desktopBackgroundColor;
    });
    chrome.storage.local.get('desktopBackgroundImage', (data) => {
        if (data.desktopBackgroundImage) {
            document.body.style.backgroundImage = `url(${data.desktopBackgroundImage})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
        }
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
    backgroundColorInput.addEventListener('input', () => {
        globalSettings.desktopBackgroundColor = backgroundColorInput.value;
        document.body.style.backgroundColor = backgroundColorInput.value;
        chrome.storage.sync.set({ globalSettings });
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
            document.body.style.backgroundImage = `url(${desktopBackgroundImage})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            chrome.storage.local.set({ desktopBackgroundImage: desktopBackgroundImage });
        };
        reader.readAsDataURL(file);
    });
    clearBackgroundBtn.addEventListener('click', () => {
        document.body.style.backgroundImage = '';
        backgroundImageInput.value = ''; // ← clears the input field
        chrome.storage.local.remove('desktopBackgroundImage');
    });
    resetSettingsBtn.addEventListener('click', () => {
        Object.assign(globalSettings, defaultSettings);
        // Apply UI changes
        openInNewTabCheckbox.checked = globalSettings.openInNewTab;
        confirmBeforeRemoveCheckbox.checked = globalSettings.confirmBeforeRemove;
        backgroundColorInput.value = globalSettings.desktopBackgroundColor;
        document.body.style.backgroundColor = globalSettings.desktopBackgroundColor;
        backgroundImageInput.value = '';
        document.body.style.backgroundImage = '';
        // Clear local image
        chrome.storage.local.remove('desktopBackgroundImage');
        // Save new defaults
        chrome.storage.sync.set({ globalSettings });
    });

    // Set up buttons and modals
    const btnAdd = document.getElementById('btn-add');
    const btnSettings = document.getElementById('btn-settings');
    const modalAdd = document.getElementById('bookmark-picker');
    const modalSet = document.getElementById('settings-panel');

    btnAdd.addEventListener('click', () => {
        if (!modalAdd) return;
        const isVisible = !modalAdd.classList.contains('hidden');
        if (isVisible) {
            closeModal(modalAdd);
        } else {
            closeModal(modalSet);
            openModal(modalAdd);
            loadBookmarks();
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
        const layout = grid.engine.nodes.map(node => {
            return {
                x: node.x,
                y: node.y,
                w: node.w,
                h: node.h,
                id: node.id,
                backgroundColor: node.backgroundColor || node.el?.querySelector('.tile')?.style.backgroundColor || '',
                textColor: node.textColor || node.el?.querySelector('.folder-title')?.style.color || ''
            };
        });
        chrome.storage.sync.set({ tiles: layout });
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
                    closeModal(modalAdd);
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
                    closeModal(modalAdd);
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
            const w = 2, h = 2;
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
                <a class="bookmark-link" href="${bookmark.url}" title="${bookmark.title}" target="${openTarget}">
                    <img class="favicon-large" src="${faviconURL}"/>
                    <div class="bookmark-title">${bookmark.title}</div>
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

        requestAnimationFrame(() => {
            if (pos?.backgroundColor) {

                const content = widget.el?.querySelector('.tile');
                if (content) content.style.backgroundColor = pos.backgroundColor;

            }
            if (!bookmark.url && pos?.textColor) {
                const title = widget.el?.querySelector('.folder-title');
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
                const content = tileEl.querySelector('.tile');
                if (content) content.style.backgroundColor = color;
                const node = grid.engine.nodes.find(n => n.el === tileEl);
                if (node) node.backgroundColor = color;

                saveLayout();
            });
        });
        // Reset background color
        tileEl.querySelector('.reset-bg-color')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const content = tileEl.querySelector('.tile');
            if (content) {
                content.style.backgroundColor = '';
            }
            const node = grid.engine.nodes.find(n => n.el === tileEl);
            if (node) {
                delete node.backgroundColor;
            }
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
                    const node = grid.engine.nodes.find(n => n.el === tileEl);
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
