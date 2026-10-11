const mainWindow = document.getElementById('aeroWindow');
const mainTitlebar = document.getElementById('windowTitlebar');

if (mainWindow && mainTitlebar) {
    let translation = {x: 0, y: 0};
    let drag = null;

    function moveWindow(x, y) {
        const rect = mainWindow.getBoundingClientRect();
        const baseX = rect.left - translation.x;
        const baseY = rect.top - translation.y;
        const maxX = Math.max(12, window.innerWidth - rect.width - 12);
        const maxY = Math.max(12, window.innerHeight - rect.height - 12);
        translation = {
            x: Math.max(12, Math.min(baseX + x, maxX)) - baseX,
            y: Math.max(12, Math.min(baseY + y, maxY)) - baseY,
        };
        mainWindow.style.transform = `translate(${translation.x}px, ${translation.y}px)`;
    }

    mainTitlebar.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target.closest('.window-controls')) return;
        drag = {id: event.pointerId, x: event.clientX, y: event.clientY, startX: translation.x, startY: translation.y};
        mainTitlebar.setPointerCapture(event.pointerId);
        mainWindow.classList.add('is-dragging');
    });
    mainTitlebar.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        moveWindow(drag.startX + event.clientX - drag.x, drag.startY + event.clientY - drag.y);
    });
    function stopWindowDrag() {
        drag = null;
        mainWindow.classList.remove('is-dragging');
    }
    mainTitlebar.addEventListener('pointerup', stopWindowDrag);
    mainTitlebar.addEventListener('pointercancel', stopWindowDrag);
    mainTitlebar.addEventListener('lostpointercapture', stopWindowDrag);
    mainTitlebar.addEventListener('keydown', event => {
        const directions = {ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20]};
        if (event.key === 'Home') {
            event.preventDefault();
            translation = {x: 0, y: 0};
            mainWindow.style.transform = '';
        } else if (directions[event.key]) {
            event.preventDefault();
            const [x, y] = directions[event.key];
            moveWindow(translation.x + x, translation.y + y);
        }
    });
    window.addEventListener('resize', () => {
        stopWindowDrag();
        translation = {x: 0, y: 0};
        mainWindow.style.transform = '';
    });
}
