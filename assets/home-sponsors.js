const sponsorBackground = document.querySelector('.sponsor-background');

if (sponsorBackground) {
    sponsorBackground.querySelectorAll('.homepage-display-ad').forEach(() => {
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
            console.warn('A homepage ad could not be initialized.', error);
        }
    });
    sponsorBackground.querySelectorAll('.sponsor-close').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.sponsor-window').hidden = true;
        });
    });
}
