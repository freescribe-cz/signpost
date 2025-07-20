document.addEventListener('DOMContentLoaded', () => {
    const grid = GridStack.init({
        resizable: { autoHide: true, handles: 'se' }
    });

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

    document.querySelectorAll('.modal .close-btn').forEach(btn =>
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
                // Folder node
                const folderSpan = document.createElement('span');
                folderSpan.textContent = `📁 ${node.title}`;
                folderSpan.style.cursor = 'pointer';

                const childUl = createTree(node.children);
                childUl.style.display = 'none';  // Initially collapsed

                folderSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    childUl.style.display = childUl.style.display === 'none' ? 'block' : 'none';
                });

                li.appendChild(folderSpan);
                li.appendChild(childUl);
            } else {
                // Bookmark node
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
        const tileContent = document.createElement('div');
        tileContent.classList.add('grid-stack-item-content');

        if (bookmark.children) {
            tileContent.innerHTML = `<div class="folder-title">📁 ${bookmark.title}</div>`;

            const childList = document.createElement('ul');
            childList.classList.add('folder-list');

            bookmark.children.forEach(child => {
                const item = document.createElement('li');
                item.innerHTML = `<a href="${child.url}" target="_blank">🔗 ${child.title}</a>`;
                childList.appendChild(item);
            });

            tileContent.appendChild(childList);
        } else {
            tileContent.innerHTML = `
            <a class="bookmark-link" href="${bookmark.url}" target="_blank">
              🔗 ${bookmark.title}
            </a>`;
        }

        grid.addWidget({
            x: 0, y: 0, width: 3, height: 2,
            content: tileContent.outerHTML
        });
    }

});
