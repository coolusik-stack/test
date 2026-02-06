class LottoNumbers extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.sets = [];
        this.setCount = 5;
    }

    connectedCallback() {
        this.generateNumbers();
    }

    getBallClass(num) {
        if (num <= 10) return 'ball-1-10';
        if (num <= 20) return 'ball-11-20';
        if (num <= 30) return 'ball-21-30';
        if (num <= 40) return 'ball-31-40';
        return 'ball-41-45';
    }

    generateNumberSet() {
        const newNumbers = new Set();
        while (newNumbers.size < 6) {
            newNumbers.add(Math.floor(Math.random() * 45) + 1);
        }
        return Array.from(newNumbers).sort((a, b) => a - b);
    }

    generateNumbers() {
        this.sets = Array.from({ length: this.setCount }, () => this.generateNumberSet());
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .sets {
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                    margin-top: 1.5rem;
                }
                .set-card {
                    background: rgba(255, 255, 255, 0.6);
                    border-radius: 18px;
                    padding: 1rem 1.25rem;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
                    border: 1px solid rgba(148, 163, 184, 0.2);
                }
                :host-context(.dark-mode) .set-card {
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(148, 163, 184, 0.1);
                }
                .set-label {
                    font-weight: 700;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                    font-size: 0.75rem;
                    color: #64748b;
                    margin-bottom: 0.75rem;
                    text-align: left;
                }
                :host-context(.dark-mode) .set-label {
                    color: #94a3b8;
                }
                .lotto-container {
                    display: flex;
                    gap: 0.75rem;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                .lotto-ball {
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #fff;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2), inset 0 -3px 6px rgba(0, 0, 0, 0.1);
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
                    animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
                    opacity: 0;
                }
                .lotto-ball:hover {
                    animation: pulse 1s ease-in-out infinite;
                    cursor: default;
                }
                .ball-1-10 { background: linear-gradient(145deg, #fbbf24 0%, #f59e0b 100%); }
                .ball-11-20 { background: linear-gradient(145deg, #3b82f6 0%, #2563eb 100%); }
                .ball-21-30 { background: linear-gradient(145deg, #ef4444 0%, #dc2626 100%); }
                .ball-31-40 { background: linear-gradient(145deg, #6b7280 0%, #4b5563 100%); }
                .ball-41-45 { background: linear-gradient(145deg, #22c55e 0%, #16a34a 100%); }

                @keyframes bounceIn {
                    0% {
                        opacity: 0;
                        transform: scale(0.3) translateY(20px);
                    }
                    50% {
                        transform: scale(1.05) translateY(-5px);
                    }
                    70% {
                        transform: scale(0.95) translateY(2px);
                    }
                    100% {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }

                @keyframes pulse {
                    0%, 100% {
                        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
                    }
                    50% {
                        box-shadow: 0 4px 25px rgba(0, 0, 0, 0.3);
                    }
                }

                @media (max-width: 480px) {
                    .set-card {
                        padding: 0.85rem 0.9rem;
                    }
                    .lotto-ball {
                        width: 46px;
                        height: 46px;
                        font-size: 1.1rem;
                    }
                }
            </style>
            <div class="sets">
                ${this.sets.map((setNumbers, setIndex) => `
                    <div class="set-card">
                        <div class="set-label">Set ${setIndex + 1}</div>
                        <div class="lotto-container">
                            ${setNumbers.map((num, index) => `
                                <div class="lotto-ball ${this.getBallClass(num)}" style="animation-delay: ${index * 0.08}s">${num}</div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
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

// Function to update the theme icon
const updateThemeIcon = (theme) => {
    themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
};

// Function to set the theme
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
