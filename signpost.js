document.addEventListener('DOMContentLoaded', () => {
    const grid = GridStack.init({
        // no need to specify defaults yet; we'll let Gridstack use its 12×60×20 setup
        resizable: { autoHide: true, handles: 'se' }
    });
}); // End of DOMContentLoaded
