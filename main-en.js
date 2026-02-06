const menuData = {
    breakfast: [
        { name: 'Oatmeal + Greek yogurt + berries', emoji: '🥣' },
        { name: 'Whole-grain toast + avocado + egg', emoji: '🥑' },
        { name: 'Tofu scramble + veggies', emoji: '🍳' },
        { name: 'Fruit + nuts + plain yogurt', emoji: '🍓' },
        { name: 'Brown rice porridge + veggies', emoji: '🍚' }
    ],
    lunch: [
        { name: 'Brown rice + grilled chicken + salad', emoji: '🥗' },
        { name: 'Tofu steak + roasted veggies', emoji: '🥦' },
        { name: 'Salmon salad + whole-grain bread', emoji: '🐟' },
        { name: 'Chicken poke bowl + brown rice', emoji: '🍚' },
        { name: 'Bean/lentil stew + salad', emoji: '🥣' }
    ],
    dinner: [
        { name: 'Baked salmon + roasted veggies', emoji: '🐟' },
        { name: 'Chicken + quinoa + salad', emoji: '🍗' },
        { name: 'Grilled tofu + sautéed mushrooms', emoji: '🍄' },
        { name: 'Bean/lentil stew + whole-grain bread', emoji: '🥖' },
        { name: 'Veggie salad + boiled eggs', emoji: '🥚' }
    ]
};

class DailyMenus extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.menus = {
            breakfast: null,
            lunch: null,
            dinner: null
        };
    }

    connectedCallback() {
        this.generateMenus();
    }

    getRandomMenu(type) {
        const list = menuData[type] || [];
        if (list.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * list.length);
        return list[randomIndex];
    }

    generateMenus() {
        this.menus = {
            breakfast: this.getRandomMenu('breakfast'),
            lunch: this.getRandomMenu('lunch'),
            dinner: this.getRandomMenu('dinner')
        };
        this.render();
    }

    renderCard(type, label, accent) {
        const item = this.menus[type];
        if (!item) return '';
        return `
            <div class="menu-card">
                <div class="menu-label" style="background: ${accent}">${label}</div>
                <div class="menu-emoji">${item.emoji}</div>
                <div class="menu-name">${item.name}</div>
            </div>
        `;
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                .menu-grid {
                    margin-top: 1.75rem;
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 1rem;
                }

                .menu-card {
                    padding: 1.5rem 1.25rem;
                    border-radius: 18px;
                    background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.75) 100%);
                    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
                    border: 1px solid rgba(15, 23, 42, 0.08);
                    text-align: center;
                    animation: rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }

                :host-context(body.dark-mode) .menu-card {
                    background: linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(15, 23, 42, 0.65) 100%);
                    border: 1px solid rgba(148, 163, 184, 0.15);
                }

                .menu-label {
                    display: inline-block;
                    color: #fff;
                    font-weight: 700;
                    font-size: 0.75rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                    padding: 0.35rem 0.9rem;
                    border-radius: 999px;
                    margin-bottom: 0.75rem;
                }

                .menu-emoji {
                    font-size: 2.5rem;
                    margin-bottom: 0.5rem;
                }

                .menu-name {
                    font-size: 1.05rem;
                    font-weight: 600;
                    color: #0f172a;
                }

                :host-context(body.dark-mode) .menu-name {
                    color: #e2e8f0;
                }

                @keyframes rise {
                    from {
                        opacity: 0;
                        transform: translateY(18px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 480px) {
                    .menu-card {
                        padding: 1.2rem 1rem;
                    }
                    .menu-emoji {
                        font-size: 2.1rem;
                    }
                    .menu-name {
                        font-size: 0.98rem;
                    }
                }
            </style>
            <div class="menu-grid">
                ${this.renderCard('breakfast', 'Breakfast', 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)')}
                ${this.renderCard('lunch', 'Lunch', 'linear-gradient(135deg, #22c55e 0%, #84cc16 100%)')}
                ${this.renderCard('dinner', 'Dinner', 'linear-gradient(135deg, #f97316 0%, #fb7185 100%)')}
            </div>
        `;
    }
}

customElements.define('daily-menus', DailyMenus);

document.getElementById('generate-btn').addEventListener('click', () => {
    document.querySelector('daily-menus').generateMenus();
});

const themeToggleBtn = document.getElementById('theme-toggle-btn');
const body = document.body;

const updateThemeIcon = (theme) => {
    themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
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

themeToggleBtn.addEventListener('click', () => {
    if (body.classList.contains('dark-mode')) {
        setTheme('light');
    } else {
        setTheme('dark');
    }
});
