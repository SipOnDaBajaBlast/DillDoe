const sponsorBackground = document.querySelector('.sponsor-background');
const sponsorMotion = document.querySelector('.sponsor-motion');

if (sponsorBackground && sponsorMotion) {
    sponsorMotion.addEventListener('click', () => {
        const paused = sponsorBackground.classList.toggle('is-paused');
        sponsorMotion.setAttribute('aria-pressed', String(paused));
        sponsorMotion.textContent = paused ? 'Resume ad previews' : 'Pause ad previews';
    });

    sponsorBackground.querySelectorAll('.sponsor-close').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.sponsor-window').hidden = true;
            if (!sponsorBackground.querySelector('.sponsor-window:not([hidden])')) {
                sponsorMotion.hidden = true;
            }
        });
    });
}
