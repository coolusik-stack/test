const menuData = {
    korean: {
        name: '한식',
        emoji: '🍚',
        items: ['김치찌개', '된장찌개', '비빔밥', '불고기', '삼겹살', '갈비찜', '제육볶음', '순두부찌개', '냉면', '칼국수', '떡볶이', '김밥', '삼계탕', '감자탕', '부대찌개']
    },
    chinese: {
        name: '중식',
        emoji: '🥡',
        items: ['짜장면', '짬뽕', '탕수육', '마파두부', '깐풍기', '양장피', '볶음밥', '마라탕', '훠궈', '유린기', '꿔바로우', '짜장밥', '울면']
    },
    japanese: {
        name: '일식',
        emoji: '🍣',
        items: ['초밥', '라멘', '돈카츠', '우동', '카레', '사시미', '규동', '오코노미야키', '타코야키', '덴푸라', '가츠동', '소바']
    },
    western: {
        name: '양식',
        emoji: '🍝',
        items: ['파스타', '피자', '스테이크', '햄버거', '리조또', '샐러드', '오믈렛', '그라탕', '치킨', '바베큐', '샌드위치']
    },
    asian: {
        name: '아시안',
        emoji: '🍜',
        items: ['쌀국수', '팟타이', '똠얌꿍', '월남쌈', '반미', '카오팟', '나시고렝', '분짜', '커리']
    }
};

class MenuRecommendation extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.recommendation = null;
    }

    connectedCallback() {
        this.generateRecommendation();
    }

    generateRecommendation() {
        const categories = Object.keys(menuData);
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const category = menuData[randomCategory];
        const randomMenu = category.items[Math.floor(Math.random() * category.items.length)];

        this.recommendation = {
            category: category.name,
            emoji: category.emoji,
            menu: randomMenu
        };

        this.render();
    }

    render() {
        if (!this.recommendation) return;

        this.shadowRoot.innerHTML = `
            <style>
                .recommendation-card {
                    margin-top: 2rem;
                    padding: 2rem;
                    background: linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.6) 100%);
                    border-radius: 20px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }

                :host-context(body.dark-mode) .recommendation-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(30, 41, 59, 0.6) 100%);
                    border: 1px solid rgba(148, 163, 184, 0.2);
                }

                .emoji {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                    animation: bounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.3s forwards;
                    opacity: 0;
                    transform: scale(0);
                }

                .category {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    margin-bottom: 0.5rem;
                }

                :host-context(body.dark-mode) .category {
                    color: #94a3b8;
                }

                .menu-name {
                    font-size: 2.5rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin: 0;
                    animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
                    opacity: 0;
                    transform: translateY(20px);
                }

                :host-context(body.dark-mode) .menu-name {
                    background: linear-gradient(135deg, #fb923c 0%, #fdba74 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .suggestion {
                    margin-top: 1.5rem;
                    font-size: 0.95rem;
                    color: #64748b;
                }

                :host-context(body.dark-mode) .suggestion {
                    color: #94a3b8;
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes bounce {
                    from {
                        opacity: 0;
                        transform: scale(0);
                    }
                    50% {
                        transform: scale(1.2);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @media (max-width: 480px) {
                    .recommendation-card {
                        padding: 1.5rem;
                    }
                    .emoji {
                        font-size: 3rem;
                    }
                    .menu-name {
                        font-size: 1.8rem;
                    }
                }
            </style>
            <div class="recommendation-card">
                <div class="emoji">${this.recommendation.emoji}</div>
                <p class="category">${this.recommendation.category}</p>
                <h2 class="menu-name">${this.recommendation.menu}</h2>
                <p class="suggestion">오늘 저녁은 이거 어때요?</p>
            </div>
        `;
    }
}

customElements.define('menu-recommendation', MenuRecommendation);

document.getElementById('generate-btn').addEventListener('click', () => {
    document.querySelector('menu-recommendation').generateRecommendation();
});

// Theme toggle functionality
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
