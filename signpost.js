document.addEventListener('DOMContentLoaded', () => {
    // Initialize Gridstack on the #desktop container
    const grid = GridStack.init({
        resizable: { autoHide: true, handles: 'se' }
    });

    // Grab toolbar buttons and modals
    const btnAdd = document.getElementById('add-bookmark');
    const btnSettings = document.getElementById('open-settings');
    const modalAdd = document.getElementById('bookmark-picker');
    let modalSet = document.getElementById('modal-settings');

    // Toggle “Add bookmark” picker
    btnAdd.addEventListener('click', () => {
        modalAdd.classList.toggle('hidden');
        if (modalSet) modalSet.classList.add('hidden');
    });

    // Toggle “Settings” panel
    btnSettings.addEventListener('click', () => {
        if (!modalSet) return;
        modalSet.classList.toggle('hidden');
        modalAdd.classList.add('hidden');
    });

    // Close buttons inside modals
    document.querySelectorAll('.modal .close-btn').forEach(btn =>
        btn.addEventListener('click', () => btn.closest('.modal').classList.add('hidden'))
    );

}); // End of DOMContentLoaded
