document.addEventListener('DOMContentLoaded', () => {
    const grid = GridStack.init();

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
                    expandBtn.textContent = isHidden ? '[-] ' : '[+] ';
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
                li.textContent = `🔗 ${node.title}`;
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
        let tileHTML;

        if (bookmark.children) {
            let childListHTML = '';
            bookmark.children.forEach(child => {
                if (!child.url) return; // Skip subfolders for now
                childListHTML += `
              <li>
                <a href="${child.url}" title="${child.title}" >🔗</a>
              </li>`;
            });

            tileHTML = `
              <div class="folder-title">📁 ${bookmark.title}</div>
              <ul class="folder-list">
                ${childListHTML}
              </ul>`;
        } else {
            tileHTML = `
              <a class="bookmark-link" href="${bookmark.url}" target="_blank">
                🔗 ${bookmark.title}
              </a>
            `;
        }

        // Corrected: the returned value is directly the DOM element
        const newTileEl = grid.addWidget({
            w: 2, h: 2,
            content: tileHTML
        });

        makeTileInteractive(newTileEl);
    }

    // Attach click listeners explicitly after tile insertion
    function makeTileInteractive(tileEl) {
        tileEl.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent grid drag event interference
                const url = link.getAttribute('href');
                window.open(url, '_blank');
            });
        });
    }

});
