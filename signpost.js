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
        const tileContent = document.createElement('div');
        tileContent.classList.add('grid-stack-item-content');

        if (bookmark.children) {
            const folderTitle = document.createElement('div');
            folderTitle.classList.add('folder-title');
            folderTitle.textContent = `📁 ${bookmark.title}`;
            tileContent.appendChild(folderTitle);

            const childList = document.createElement('ul');
            childList.classList.add('folder-list');

            bookmark.children.forEach(child => {
                if (!child.url) return; // Skip sub-folders
                const item = document.createElement('li');
                const link = document.createElement('a');
                link.href = child.url;
                link.target = '_blank';
                link.textContent = `🔗 ${child.title}`;
                item.appendChild(link);
                childList.appendChild(item);
            });

            tileContent.appendChild(childList);
        } else {
            const link = document.createElement('a');
            link.classList.add('bookmark-link');
            link.href = bookmark.url;
            link.target = '_blank';
            link.textContent = `🔗 ${bookmark.title}`;
            tileContent.appendChild(link);
        }

        grid.addWidget({
            x: 0, y: 0, width: 3, height: 2,
            content: tileContent // pass DOM element directly!
        });
    }

});
