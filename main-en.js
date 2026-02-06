const menuData = {
    breakfast: [
        { name: 'Oatmeal + Greek yogurt + berries', emoji: '🥣', calories: 350 },
        { name: 'Whole-grain toast + avocado + egg', emoji: '🥑', calories: 400 },
        { name: 'Tofu scramble + veggies', emoji: '🍳', calories: 300 },
        { name: 'Fruit + nuts + plain yogurt', emoji: '🍓', calories: 320 },
        { name: 'Brown rice porridge + veggies', emoji: '🍚', calories: 280 },
        { name: 'Chia pudding + banana + nuts', emoji: '🥛', calories: 380 },
        { name: 'Cottage cheese + apple + cinnamon', emoji: '🍎', calories: 250 },
        { name: 'Egg omelet + spinach + tomato', emoji: '🥚', calories: 330 },
        { name: 'Whole-grain cereal + milk + berries', emoji: '🥛', calories: 360 },
        { name: 'Overnight oats + almond butter', emoji: '🥜', calories: 420 },
        { name: 'Smoothie bowl + granola', emoji: '🍌', calories: 390 },
        { name: 'Miso soup + tofu + rice', emoji: '🍲', calories: 310 }
    ],
    lunch: [
        { name: 'Brown rice + grilled chicken + salad', emoji: '🥗', calories: 500 },
        { name: 'Tofu steak + roasted veggies', emoji: '🥦', calories: 450 },
        { name: 'Salmon salad + whole-grain bread', emoji: '🐟', calories: 550 },
        { name: 'Chicken poke bowl + brown rice', emoji: '🍚', calories: 480 },
        { name: 'Bean/lentil stew + salad', emoji: '🥣', calories: 420 },
        { name: 'Turkey wrap + mixed greens', emoji: '🌯', calories: 470 },
        { name: 'Quinoa bowl + chickpeas + veggies', emoji: '🥗', calories: 520 },
        { name: 'Soba noodles + veggies + tofu', emoji: '🍜', calories: 490 },
        { name: 'Tuna salad + whole-grain crackers', emoji: '🐟', calories: 460 },
        { name: 'Bibimbap with lean protein', emoji: '🍚', calories: 530 },
        { name: 'Veggie burrito bowl', emoji: '🌯', calories: 510 },
        { name: 'Chicken soup + side salad', emoji: '🍲', calories: 440 }
    ],
    dinner: [
        { name: 'Baked salmon + roasted veggies', emoji: '🐟', calories: 550 },
        { name: 'Chicken + quinoa + salad', emoji: '🍗', calories: 500 },
        { name: 'Grilled tofu + sautéed mushrooms', emoji: '🍄', calories: 450 },
        { name: 'Bean/lentil stew + whole-grain bread', emoji: '🥖', calories: 480 },
        { name: 'Veggie salad + boiled eggs', emoji: '🥚', calories: 380 },
        { name: 'Turkey meatballs + zucchini noodles', emoji: '🍝', calories: 520 },
        { name: 'Shrimp stir-fry + brown rice', emoji: '🍤', calories: 530 },
        { name: 'Baked cod + greens', emoji: '🐟', calories: 470 },
        { name: 'Chicken curry + cauliflower rice', emoji: '🍛', calories: 510 },
        { name: 'Stuffed bell peppers', emoji: '🫑', calories: 490 },
        { name: 'Tofu vegetable stir-fry', emoji: '🥬', calories: 460 },
        { name: 'Grilled chicken + roasted sweet potato', emoji: '🍠', calories: 540 }
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
                <div class="menu-calories">${item.calories} kcal</div>
            </div>
        `;
    }

    render() {
        let totalCalories = 0;
        const breakfastCard = this.renderCard('breakfast', 'Breakfast', 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)');
        const lunchCard = this.renderCard('lunch', 'Lunch', 'linear-gradient(135deg, #22c55e 0%, #84cc16 100%)');
        const dinnerCard = this.renderCard('dinner', 'Dinner', 'linear-gradient(135deg, #f97316 0%, #fb7185 100%)');

        if (this.menus.breakfast) totalCalories += this.menus.breakfast.calories;
        if (this.menus.lunch) totalCalories += this.menus.lunch.calories;
        if (this.menus.dinner) totalCalories += this.menus.dinner.calories;

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
                    margin-bottom: 0.4rem; /* Added margin for calories */
                }

                :host-context(body.dark-mode) .menu-name {
                    color: #e2e8f0;
                }

                .menu-calories {
                    font-size: 0.9rem;
                    color: #4a5568;
                }

                :host-context(body.dark-mode) .menu-calories {
                    color: #a0aec0;
                }

                .total-calories {
                    margin-top: 1.5rem;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #0f172a;
                    text-align: center;
                    padding: 1rem;
                    border-radius: 12px;
                    background: rgba(255, 255, 255, 0.7);
                    box-shadow: 0 5px 15px rgba(15, 23, 42, 0.1);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 0.5rem;
                }

                :host-context(body.dark-mode) .total-calories {
                    background: rgba(15, 23, 42, 0.7);
                    color: #e2e8f0;
                }
                .total-calories-icon {
                    font-size: 1.5rem;
                    color: #f97316;
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
                    .total-calories {
                        font-size: 1.1rem;
                    }
                }
            </style>
            <div class="menu-grid">
                ${breakfastCard}
                ${lunchCard}
                ${dinnerCard}
            </div>
            <div class="total-calories">
                <span class="total-calories-icon">🔥</span> Total Calories: ${totalCalories} kcal
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
