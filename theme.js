const themeToggleBtn = document.getElementById('theme-toggle-btn');
const body = document.body;

const updateThemeIcon = (theme) => {
    if (themeToggleBtn) {
        themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
};

const setTheme = (theme) => {
    if (theme === 'dark') {
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
    updateThemeIcon(theme);
};

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    setTheme(savedTheme);
} else {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        if (body.classList.contains('dark-mode')) {
            setTheme('light');
        } else {
            setTheme('dark');
        }
    });
}
