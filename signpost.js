document.addEventListener('DOMContentLoaded', () => {
    const grid = GridStack.init();
    // Set how content is applied to widgets
    GridStack.renderCB = function (el, w) {
        el.innerHTML = w.content;
    };

    const btnAdd = document.getElementById('btn-add');
    const btnSettings = document.getElementById('btn-settings');
    const modalAdd = document.getElementById('bookmark-picker');
    const modalSet = document.getElementById('modal-settings');

    btnAdd.addEventListener('click', () => {
        modalAdd.classList.toggle('hidden');
        if (modalSet) modalSet.classList.add('hidden');
        loadBookmarks();
    });

    btnSettings.addEventListener('click', () => {
        if (!modalSet) return;
        modalSet.classList.toggle('hidden');
        modalAdd.classList.add('hidden');
    });

    document.querySelectorAll('.modal .btn-close').forEach(btn =>
        btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'))
    );

    function loadBookmarks() {
        chrome.bookmarks.getTree(([root]) => {
            const container = document.getElementById('bookmark-tree');
            container.innerHTML = '';
            container.appendChild(createTree(root.children));
        });
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

    function addTileToGrid(bookmark) {
        let tileHeaderHTML;
        let tileBodyHTML;
        let tileFooterHTML;
        let tileHeaderTitleText;

        if (!bookmark.url) { // FOLDERS
            let childListHTML = '';
            if (bookmark.children) {
                bookmark.children.forEach(child => {
                    let contentHTML = '';
                    if (child.url) {
                        // Bookmark link
                        const faviconURL = `https://www.google.com/s2/favicons?sz=16&domain=${new URL(child.url).hostname}`;
                        contentHTML = `
    <a class="bookmark-link" href="${child.url}" title="${child.title}">
        <img class="favicon" src="${faviconURL}"/>
    </a>
    `;
                    } else {
                        // Folder
                        contentHTML = `
    <span class="bookmark-link bookmark-folder" title="${child.title}">📁</span>
    `;
                    }
                    childListHTML += `
    <div class="bookmark-item">
      ${contentHTML}
    </div>
  `;
                });
            }
            tileHeaderTitleText = `📁 ${bookmark.title}`;
            tileBodyHTML = `
              <div class="tile-body folder-content">
                ${childListHTML}
              </div>
              `;
        } else { // LINKS
            const hostname = new URL(bookmark.url).hostname;
            const faviconURL = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
            tileHeaderTitleText = "";
            tileBodyHTML = `
              <div class="tile-body center">
                <a class="bookmark-link" href="${bookmark.url}">
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
        tileFooterHTML = '<div class="tile-footer"><div class="tile-drag-handle">⤨</div></div>'
        const tileHTML = `
            ${tileHeaderHTML}
            ${tileBodyHTML}
        `;

        grid.addWidget({
            w: 1, h: 1, content: tileHTML
        });

        addWidgetListeners();
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
            grid.removeWidget(tileEl);
        });
    }

});
