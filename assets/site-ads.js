// Only initialize on the top-level page, once per unit. Never refresh ads.
if (window.top === window.self) {
    const units = [...document.querySelectorAll('[data-site-ad]')];
    if (units.length) {
        const loader = document.createElement('script');
        loader.async = true;
        loader.crossOrigin = 'anonymous';
        loader.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6483528780801608';
        document.head.append(loader);
        const requestAd = unit => {
            if (unit.dataset.requested || !unit.getBoundingClientRect().width) return;
            unit.dataset.requested = 'true';
            try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
            catch (error) { console.warn('Ad initialization failed.', error); }
        };
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        requestAd(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            }, {rootMargin: '200px 0px'});
            units.forEach(unit => observer.observe(unit));
        } else units.forEach(requestAd);
    }
} else {
    document.querySelectorAll('.site-ad').forEach(area => { area.hidden = true; });
}
