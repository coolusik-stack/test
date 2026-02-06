class LottoNumbers extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.numbers = [];
    }

    connectedCallback() {
        this.render();
    }

    generateNumbers() {
        const newNumbers = new Set();
        while (newNumbers.size < 6) {
            newNumbers.add(Math.floor(Math.random() * 45) + 1);
        }
        this.numbers = Array.from(newNumbers).sort((a, b) => a - b);
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .lotto-container {
                    display: flex;
                    gap: 1rem;
                    justify-content: center;
                    margin-top: 1.5rem;
                }
                .lotto-ball {
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-size: 1.2rem;
                    font-weight: bold;
                    color: #fff;
                    background-color: #3498db;
                }
            </style>
            <div class="lotto-container">
                ${this.numbers.map(num => `<div class="lotto-ball">${num}</div>`).join('')}
            </div>
        `;
    }
}

customElements.define('lotto-numbers', LottoNumbers);

document.getElementById('generate-btn').addEventListener('click', () => {
    document.querySelector('lotto-numbers').generateNumbers();
});

// Theme toggle functionality
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const body = document.body;

// Function to set the theme
const setTheme = (theme) => {
    if (theme === 'dark') {
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
    }
};

// Check for saved theme in localStorage
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    setTheme(savedTheme);
} else {
    // Check for system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setTheme('dark');
    } else {
        setTheme('light');
    }
}

// Event listener for the theme toggle button
themeToggleBtn.addEventListener('click', () => {
    if (body.classList.contains('dark-mode')) {
        setTheme('light');
    } else {
        setTheme('dark');
    }
});
