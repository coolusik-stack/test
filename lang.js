const LANG_STORAGE_KEY = 'preferredLang';

const setPreferredLang = (lang) => {
    if (lang) {
        localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
};

const getPreferredLang = () => localStorage.getItem(LANG_STORAGE_KEY);

const getCurrentLang = () => (document.documentElement.lang === 'ko' ? 'ko' : 'en');

const getBrowserLang = () => {
    const lang = (navigator.language || '').toLowerCase();
    return lang.startsWith('ko') ? 'ko' : 'en';
};

const getBasePath = () => {
    const path = window.location.pathname;
    if (path.endsWith('/')) return path;
    return path.substring(0, path.lastIndexOf('/') + 1);
};

const getTargetPath = (lang) => {
    const path = window.location.pathname;
    const base = getBasePath();
    if (path.includes('weekly')) {
        return `${base}${lang === 'ko' ? 'weekly.html' : 'weekly-en.html'}`;
    }
    if (path.includes('grocery')) {
        return `${base}${lang === 'ko' ? 'grocery.html' : 'grocery-en.html'}`;
    }
    return `${base}${lang === 'ko' ? 'index-ko.html' : 'index.html'}`;
};

const shouldRedirect = (targetPath) => {
    const current = window.location.pathname;
    return !current.endsWith(targetPath.split('/').pop());
};

(() => {
    const url = new URL(window.location.href);
    const queryLang = url.searchParams.get('lang');
    const savedLang = getPreferredLang();
    const preferred = queryLang || savedLang;
    const currentLang = getCurrentLang();
    const browserLang = getBrowserLang();
    const targetLang = preferred || browserLang;

    if (queryLang) {
        setPreferredLang(queryLang);
    }

    if (targetLang !== currentLang) {
        const targetPath = getTargetPath(targetLang);
        if (shouldRedirect(targetPath)) {
            window.location.replace(targetPath);
            return;
        }
    }

    const langLinks = document.querySelectorAll('.lang-option');
    langLinks.forEach((link) => {
        link.addEventListener('click', () => {
            const href = link.getAttribute('href') || '';
            const nextLang = href.includes('ko') ? 'ko' : 'en';
            setPreferredLang(nextLang);
        });
    });
})();
