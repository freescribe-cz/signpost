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
            li.textContent = node.title || node.url;

            li.addEventListener('click', (e) => {
                e.stopPropagation();
                addTileToGrid(node);
                modalAdd.classList.add('hidden');
            });

            if (node.children) {
                li.prepend('📁 ');
                li.appendChild(createTree(node.children));
            } else {
                li.prepend('🔗 ');
            }
            ul.appendChild(li);
        });
        return ul;
    }

    function addTileToGrid(bookmark) {
        const content = document.createElement('div');
        content.classList.add('grid-stack-item-content');
        content.innerHTML = bookmark.children ? `📁 ${bookmark.title}` : `🔗 ${bookmark.title}`;

        const tile = {
            x: 0, y: 0, width: 2, height: 2,
            content: content.outerHTML
        };

        grid.addWidget(tile);
    }
});
