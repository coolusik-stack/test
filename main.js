const menuData = [
    // 한식
    { name: '김치찌개', emoji: '🍲', category: '한식' },
    { name: '된장찌개', emoji: '🍲', category: '한식' },
    { name: '비빔밥', emoji: '🍚', category: '한식' },
    { name: '불고기', emoji: '🥩', category: '한식' },
    { name: '삼겹살', emoji: '🥓', category: '한식' },
    { name: '갈비찜', emoji: '🍖', category: '한식' },
    { name: '제육볶음', emoji: '🍳', category: '한식' },
    { name: '순두부찌개', emoji: '🍲', category: '한식' },
    { name: '냉면', emoji: '🍜', category: '한식' },
    { name: '칼국수', emoji: '🍜', category: '한식' },
    { name: '떡볶이', emoji: '🍢', category: '한식' },
    { name: '김밥', emoji: '🍙', category: '한식' },
    { name: '삼계탕', emoji: '🍗', category: '한식' },
    { name: '감자탕', emoji: '🍖', category: '한식' },
    { name: '부대찌개', emoji: '🍲', category: '한식' },
    { name: '족발', emoji: '🦶', category: '한식' },
    { name: '보쌈', emoji: '🥬', category: '한식' },
    { name: '곱창', emoji: '🔥', category: '한식' },

    // 중식
    { name: '짜장면', emoji: '🍝', category: '중식' },
    { name: '짬뽕', emoji: '🍜', category: '중식' },
    { name: '탕수육', emoji: '🍖', category: '중식' },
    { name: '마파두부', emoji: '🫕', category: '중식' },
    { name: '깐풍기', emoji: '🍗', category: '중식' },
    { name: '양장피', emoji: '🥗', category: '중식' },
    { name: '볶음밥', emoji: '🍛', category: '중식' },
    { name: '마라탕', emoji: '🌶️', category: '중식' },
    { name: '훠궈', emoji: '🫕', category: '중식' },
    { name: '유린기', emoji: '🍗', category: '중식' },
    { name: '꿔바로우', emoji: '🍖', category: '중식' },

    // 일식
    { name: '초밥', emoji: '🍣', category: '일식' },
    { name: '라멘', emoji: '🍜', category: '일식' },
    { name: '돈카츠', emoji: '🍱', category: '일식' },
    { name: '우동', emoji: '🍜', category: '일식' },
    { name: '카레', emoji: '🍛', category: '일식' },
    { name: '사시미', emoji: '🐟', category: '일식' },
    { name: '규동', emoji: '🍚', category: '일식' },
    { name: '오코노미야키', emoji: '🥞', category: '일식' },
    { name: '타코야키', emoji: '🐙', category: '일식' },
    { name: '덴푸라', emoji: '🍤', category: '일식' },
    { name: '가츠동', emoji: '🍱', category: '일식' },
    { name: '소바', emoji: '🍝', category: '일식' },

    // 양식
    { name: '파스타', emoji: '🍝', category: '양식' },
    { name: '피자', emoji: '🍕', category: '양식' },
    { name: '스테이크', emoji: '🥩', category: '양식' },
    { name: '햄버거', emoji: '🍔', category: '양식' },
    { name: '리조또', emoji: '🍚', category: '양식' },
    { name: '샐러드', emoji: '🥗', category: '양식' },
    { name: '오믈렛', emoji: '🍳', category: '양식' },
    { name: '그라탕', emoji: '🧀', category: '양식' },
    { name: '치킨', emoji: '🍗', category: '양식' },
    { name: '샌드위치', emoji: '🥪', category: '양식' },
    { name: '감바스', emoji: '🦐', category: '양식' },
    { name: '뇨끼', emoji: '🥔', category: '양식' },

    // 아시안
    { name: '쌀국수', emoji: '🍜', category: '아시안' },
    { name: '팟타이', emoji: '🍝', category: '아시안' },
    { name: '똠얌꿍', emoji: '🍲', category: '아시안' },
    { name: '월남쌈', emoji: '🥬', category: '아시안' },
    { name: '반미', emoji: '🥖', category: '아시안' },
    { name: '나시고렝', emoji: '🍛', category: '아시안' },
    { name: '분짜', emoji: '🍜', category: '아시안' },
    { name: '커리', emoji: '🍛', category: '아시안' },
    { name: '양꼬치', emoji: '🍢', category: '아시안' },

    // 분식/간식
    { name: '라면', emoji: '🍜', category: '분식' },
    { name: '순대', emoji: '🌭', category: '분식' },
    { name: '튀김', emoji: '🍤', category: '분식' },
    { name: '오뎅', emoji: '🍢', category: '분식' },
    { name: '붕어빵', emoji: '🐟', category: '분식' },

    // 야식
    { name: '치맥', emoji: '🍺', category: '야식' },
    { name: '피맥', emoji: '🍕', category: '야식' },
    { name: '라볶이', emoji: '🍜', category: '야식' }
];

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
        const randomIndex = Math.floor(Math.random() * menuData.length);
        this.recommendation = menuData[randomIndex];
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
                    font-size: 5rem;
                    margin-bottom: 1rem;
                    animation: bounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) 0.3s forwards;
                    opacity: 0;
                    transform: scale(0);
                }

                .category {
                    display: inline-block;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #fff;
                    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
                    padding: 0.35rem 1rem;
                    border-radius: 20px;
                    margin-bottom: 1rem;
                    letter-spacing: 0.05em;
                }

                :host-context(body.dark-mode) .category {
                    background: linear-gradient(135deg, #fb923c 0%, #f97316 100%);
                }

                .menu-name {
                    font-size: 2.5rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, #1c1917 0%, #44403c 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin: 0;
                    animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards;
                    opacity: 0;
                    transform: translateY(20px);
                }

                :host-context(body.dark-mode) .menu-name {
                    background: linear-gradient(135deg, #fafaf9 0%, #d6d3d1 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .suggestion {
                    margin-top: 1.5rem;
                    font-size: 0.95rem;
                    color: #78716c;
                }

                :host-context(body.dark-mode) .suggestion {
                    color: #a8a29e;
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
                        font-size: 4rem;
                    }
                    .menu-name {
                        font-size: 1.8rem;
                    }
                }
            </style>
            <div class="recommendation-card">
                <div class="emoji">${this.recommendation.emoji}</div>
                <div class="category">${this.recommendation.category}</div>
                <h2 class="menu-name">${this.recommendation.name}</h2>
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
