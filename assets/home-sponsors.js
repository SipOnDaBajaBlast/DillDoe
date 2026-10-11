const sponsorBackground = document.querySelector('.sponsor-background');

if (sponsorBackground) {
    sponsorBackground.querySelectorAll('.sponsor-close').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.sponsor-window').hidden = true;
        });
    });
}
