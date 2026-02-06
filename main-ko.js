const menuData = {
    breakfast: [
        { name: '오트밀 + 그릭요거트 + 베리', emoji: '🥣' },
        { name: '통밀 토스트 + 아보카도 + 달걀', emoji: '🥑' },
        { name: '두부 스크램블 + 채소', emoji: '🍳' },
        { name: '과일 + 견과류 + 플레인 요거트', emoji: '🍓' },
        { name: '현미죽 + 나물', emoji: '🍚' },
        { name: '치아푸딩 + 바나나 + 견과류', emoji: '🥛' },
        { name: '코티지 치즈 + 사과 + 시나몬', emoji: '🍎' },
        { name: '달걀 오믈렛 + 시금치 + 토마토', emoji: '🥚' },
        { name: '통곡물 시리얼 + 우유 + 베리', emoji: '🥛' },
        { name: '오버나이트 오트 + 아몬드버터', emoji: '🥜' },
        { name: '스무디 볼 + 그래놀라', emoji: '🍌' },
        { name: '미소국 + 두부 + 밥', emoji: '🍲' }
    ],
    lunch: [
        { name: '현미/잡곡밥 + 닭가슴살 + 샐러드', emoji: '🥗' },
        { name: '두부 스테이크 + 구운 채소', emoji: '🥦' },
        { name: '연어 샐러드 + 통곡물빵', emoji: '🐟' },
        { name: '닭가슴살 포케 + 현미', emoji: '🍚' },
        { name: '콩/렌틸 스튜 + 샐러드', emoji: '🥣' },
        { name: '칠면조 랩 + 믹스그린', emoji: '🌯' },
        { name: '퀴노아 볼 + 병아리콩 + 채소', emoji: '🥗' },
        { name: '소바 + 채소 + 두부', emoji: '🍜' },
        { name: '참치 샐러드 + 통곡물 크래커', emoji: '🐟' },
        { name: '저지방 비빔밥', emoji: '🍚' },
        { name: '채소 부리또 볼', emoji: '🌯' },
        { name: '치킨 수프 + 샐러드', emoji: '🍲' }
    ],
    dinner: [
        { name: '연어 구이 + 구운 채소', emoji: '🐟' },
        { name: '닭가슴살 + 퀴노아 + 샐러드', emoji: '🍗' },
        { name: '두부 구이 + 버섯볶음', emoji: '🍄' },
        { name: '콩/렌틸 스튜 + 통곡물빵', emoji: '🥖' },
        { name: '채소 샐러드 + 삶은 달걀', emoji: '🥚' },
        { name: '칠면조 미트볼 + 주키니 누들', emoji: '🍝' },
        { name: '새우 볶음 + 현미밥', emoji: '🍤' },
        { name: '대구 구이 + 그린 샐러드', emoji: '🐟' },
        { name: '닭가슴살 카레 + 콜리플라워 라이스', emoji: '🍛' },
        { name: '속 채운 파프리카', emoji: '🫑' },
        { name: '두부 채소 볶음', emoji: '🥬' },
        { name: '닭가슴살 + 고구마 구이', emoji: '🍠' }
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
                ${this.renderCard('breakfast', '아침', 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)')}
                ${this.renderCard('lunch', '점심', 'linear-gradient(135deg, #22c55e 0%, #84cc16 100%)')}
                ${this.renderCard('dinner', '저녁', 'linear-gradient(135deg, #f97316 0%, #fb7185 100%)')}
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
