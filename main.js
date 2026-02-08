const lang = document.documentElement.lang === 'ko' ? 'ko' : 'en';

const menuDataByLang = {
    en: {
        breakfast: [
            { name: 'Oatmeal + Greek yogurt + berries', emoji: '🥣', calories: 350, tags: ['fiber-rich', 'dairy'] },
            { name: 'Whole-grain toast + avocado + egg', emoji: '🥑', calories: 400, tags: ['fiber-rich', 'egg'] },
            { name: 'Tofu scramble + veggies', emoji: '🍳', calories: 300, tags: ['plant-based', 'tofu'] },
            { name: 'Fruit + nuts + plain yogurt', emoji: '🍓', calories: 320, tags: ['plant-based', 'dairy'] },
            { name: 'Brown rice porridge + veggies', emoji: '🍚', calories: 280, tags: ['plant-based', 'fiber-rich'] },
            { name: 'Chia pudding + banana + nuts', emoji: '🥛', calories: 380, tags: ['plant-based', 'fiber-rich'] },
            { name: 'Cottage cheese + apple + cinnamon', emoji: '🍎', calories: 250, tags: ['dairy', 'low-cal'] },
            { name: 'Egg omelet + spinach + tomato', emoji: '🥚', calories: 330, tags: ['egg', 'high-protein'] },
            { name: 'Whole-grain cereal + milk + berries', emoji: '🥛', calories: 360, tags: ['fiber-rich', 'dairy'] },
            { name: 'Overnight oats + almond butter', emoji: '🥜', calories: 420, tags: ['plant-based', 'fiber-rich'] },
            { name: 'Smoothie bowl + granola', emoji: '🍌', calories: 390, tags: ['plant-based', 'fiber-rich'] },
            { name: 'Miso soup + tofu + rice', emoji: '🍲', calories: 310, tags: ['plant-based', 'tofu'] }
        ],
        lunch: [
            { name: 'Brown rice + grilled chicken + salad', emoji: '🥗', calories: 500, tags: ['chicken', 'high-protein'] },
            { name: 'Tofu steak + roasted veggies', emoji: '🥦', calories: 450, tags: ['plant-based', 'tofu'] },
            { name: 'Salmon salad + whole-grain bread', emoji: '🐟', calories: 550, tags: ['fish', 'high-protein'] },
            { name: 'Chicken poke bowl + brown rice', emoji: '🍚', calories: 480, tags: ['chicken', 'high-protein'] },
            { name: 'Bean/lentil stew + salad', emoji: '🥣', calories: 420, tags: ['plant-based', 'legume', 'fiber-rich'] },
            { name: 'Turkey wrap + mixed greens', emoji: '🌯', calories: 470, tags: ['turkey', 'high-protein'] },
            { name: 'Quinoa bowl + chickpeas + veggies', emoji: '🥗', calories: 520, tags: ['plant-based', 'legume', 'fiber-rich'] },
            { name: 'Soba noodles + veggies + tofu', emoji: '🍜', calories: 490, tags: ['plant-based', 'tofu'] },
            { name: 'Tuna salad + whole-grain crackers', emoji: '🐟', calories: 460, tags: ['fish', 'high-protein'] },
            { name: 'Bibimbap with lean protein', emoji: '🍚', calories: 530, tags: ['high-protein', 'fiber-rich'] },
            { name: 'Veggie burrito bowl', emoji: '🌯', calories: 510, tags: ['plant-based', 'fiber-rich'] },
            { name: 'Chicken soup + side salad', emoji: '🍲', calories: 440, tags: ['chicken'] }
        ],
        dinner: [
            { name: 'Baked salmon + roasted veggies', emoji: '🐟', calories: 550, tags: ['fish', 'high-protein'] },
            { name: 'Chicken + quinoa + salad', emoji: '🍗', calories: 500, tags: ['chicken', 'high-protein'] },
            { name: 'Grilled tofu + sautéed mushrooms', emoji: '🍄', calories: 450, tags: ['plant-based', 'tofu'] },
            { name: 'Bean/lentil stew + whole-grain bread', emoji: '🥖', calories: 480, tags: ['plant-based', 'legume', 'fiber-rich'] },
            { name: 'Veggie salad + boiled eggs', emoji: '🥚', calories: 380, tags: ['egg', 'low-cal'] },
            { name: 'Turkey meatballs + zucchini noodles', emoji: '🍝', calories: 520, tags: ['turkey', 'high-protein'] },
            { name: 'Shrimp stir-fry + brown rice', emoji: '🍤', calories: 530, tags: ['seafood', 'high-protein'] },
            { name: 'Baked cod + greens', emoji: '🐟', calories: 470, tags: ['fish', 'low-cal'] },
            { name: 'Chicken curry + cauliflower rice', emoji: '🍛', calories: 510, tags: ['chicken', 'high-protein'] },
            { name: 'Stuffed bell peppers', emoji: '🫑', calories: 490, tags: ['fiber-rich'] },
            { name: 'Tofu vegetable stir-fry', emoji: '🥬', calories: 460, tags: ['plant-based', 'tofu'] },
            { name: 'Grilled chicken + roasted sweet potato', emoji: '🍠', calories: 540, tags: ['chicken', 'high-protein', 'fiber-rich'] }
        ],
        labels: {
            breakfast: 'Breakfast',
            lunch: 'Lunch',
            dinner: 'Dinner',
            totalCalories: 'Total Calories',
            reasonTitle: 'Why this combo?'
        }
    },
    ko: {
        breakfast: [
            { name: '오트밀 + 그릭요거트 + 베리', emoji: '🥣', calories: 350, tags: ['fiber-rich', 'dairy'] },
            { name: '통밀 토스트 + 아보카도 + 달걀', emoji: '🥑', calories: 400, tags: ['fiber-rich', 'egg'] },
            { name: '두부 스크램블 + 채소', emoji: '🍳', calories: 300, tags: ['plant-based', 'tofu'] },
            { name: '과일 + 견과류 + 플레인 요거트', emoji: '🍓', calories: 320, tags: ['plant-based', 'dairy'] },
            { name: '현미죽 + 나물', emoji: '🍚', calories: 280, tags: ['plant-based', 'fiber-rich'] },
            { name: '치아푸딩 + 바나나 + 견과류', emoji: '🥛', calories: 380, tags: ['plant-based', 'fiber-rich'] },
            { name: '코티지 치즈 + 사과 + 시나몬', emoji: '🍎', calories: 250, tags: ['dairy', 'low-cal'] },
            { name: '달걀 오믈렛 + 시금치 + 토마토', emoji: '🥚', calories: 330, tags: ['egg', 'high-protein'] },
            { name: '통곡물 시리얼 + 우유 + 베리', emoji: '🥛', calories: 360, tags: ['fiber-rich', 'dairy'] },
            { name: '오버나이트 오트 + 아몬드버터', emoji: '🥜', calories: 420, tags: ['plant-based', 'fiber-rich'] },
            { name: '스무디 볼 + 그래놀라', emoji: '🍌', calories: 390, tags: ['plant-based', 'fiber-rich'] },
            { name: '미소국 + 두부 + 밥', emoji: '🍲', calories: 310, tags: ['plant-based', 'tofu'] }
        ],
        lunch: [
            { name: '현미/잡곡밥 + 닭가슴살 + 샐러드', emoji: '🥗', calories: 500, tags: ['chicken', 'high-protein'] },
            { name: '두부 스테이크 + 구운 채소', emoji: '🥦', calories: 450, tags: ['plant-based', 'tofu'] },
            { name: '연어 샐러드 + 통곡물빵', emoji: '🐟', calories: 550, tags: ['fish', 'high-protein'] },
            { name: '닭가슴살 포케 + 현미', emoji: '🍚', calories: 480, tags: ['chicken', 'high-protein'] },
            { name: '콩/렌틸 스튜 + 샐러드', emoji: '🥣', calories: 420, tags: ['plant-based', 'legume', 'fiber-rich'] },
            { name: '칠면조 랩 + 믹스그린', emoji: '🌯', calories: 470, tags: ['turkey', 'high-protein'] },
            { name: '퀴노아 볼 + 병아리콩 + 채소', emoji: '🥗', calories: 520, tags: ['plant-based', 'legume', 'fiber-rich'] },
            { name: '소바 + 채소 + 두부', emoji: '🍜', calories: 490, tags: ['plant-based', 'tofu'] },
            { name: '참치 샐러드 + 통곡물 크래커', emoji: '🐟', calories: 460, tags: ['fish', 'high-protein'] },
            { name: '저지방 비빔밥', emoji: '🍚', calories: 530, tags: ['high-protein', 'fiber-rich'] },
            { name: '채소 부리또 볼', emoji: '🌯', calories: 510, tags: ['plant-based', 'fiber-rich'] },
            { name: '치킨 수프 + 샐러드', emoji: '🍲', calories: 440, tags: ['chicken'] }
        ],
        dinner: [
            { name: '연어 구이 + 구운 채소', emoji: '🐟', calories: 550, tags: ['fish', 'high-protein'] },
            { name: '닭가슴살 + 퀴노아 + 샐러드', emoji: '🍗', calories: 500, tags: ['chicken', 'high-protein'] },
            { name: '두부 구이 + 버섯볶음', emoji: '🍄', calories: 450, tags: ['plant-based', 'tofu'] },
            { name: '콩/렌틸 스튜 + 통곡물빵', emoji: '🥖', calories: 480, tags: ['plant-based', 'legume', 'fiber-rich'] },
            { name: '채소 샐러드 + 삶은 달걀', emoji: '🥚', calories: 380, tags: ['egg', 'low-cal'] },
            { name: '칠면조 미트볼 + 주키니 누들', emoji: '🍝', calories: 520, tags: ['turkey', 'high-protein'] },
            { name: '새우 볶음 + 현미밥', emoji: '🍤', calories: 530, tags: ['seafood', 'high-protein'] },
            { name: '대구 구이 + 그린 샐러드', emoji: '🐟', calories: 470, tags: ['fish', 'low-cal'] },
            { name: '닭가슴살 카레 + 콜리플라워 라이스', emoji: '🍛', calories: 510, tags: ['chicken', 'high-protein'] },
            { name: '속 채운 파프리카', emoji: '🫑', calories: 490, tags: ['fiber-rich'] },
            { name: '두부 채소 볶음', emoji: '🥬', calories: 460, tags: ['plant-based', 'tofu'] },
            { name: '닭가슴살 + 고구마 구이', emoji: '🍠', calories: 540, tags: ['chicken', 'high-protein', 'fiber-rich'] }
        ],
        labels: {
            breakfast: '아침',
            lunch: '점심',
            dinner: '저녁',
            totalCalories: '총 칼로리',
            reasonTitle: '이 조합을 추천하는 이유'
        }
    }
};

const menuData = menuDataByLang[lang];
const labels = menuData.labels;

const reasonMessages = {
    en: {
        calorieIdeal: (cal) => `Total ${cal} kcal — right in the ideal daily range (1,200–1,500 kcal)`,
        calorieLow: (cal) => `A light ${cal} kcal menu — great for those watching their intake`,
        calorieHigh: (cal) => `${cal} kcal total — a hearty plan suited for active lifestyles`,
        proteinDiversity: (sources) => `Diverse protein sources (${sources.join(', ')}) for balanced nutrition`,
        plantBased: 'A plant-forward combination rich in vitamins and fiber',
        fishIncluded: 'Includes omega-3 rich fish for heart and brain health',
        fiberRich: 'High in dietary fiber to support digestion and satiety',
        lightDinner: 'A lighter dinner to support better digestion and sleep',
        highProtein: 'High-protein meals to support muscle maintenance and energy'
    },
    ko: {
        calorieIdeal: (cal) => `총 ${cal}kcal로 하루 적정 칼로리 범위(1,200~1,500kcal)에 딱 맞아요`,
        calorieLow: (cal) => `${cal}kcal의 가벼운 식단으로 칼로리 관리에 좋아요`,
        calorieHigh: (cal) => `총 ${cal}kcal로 활동량이 많은 분께 적합한 든든한 식단이에요`,
        proteinDiversity: (sources) => `다양한 단백질원(${sources.join(', ')})으로 균형 잡힌 영양 섭취가 가능해요`,
        plantBased: '식물성 위주의 조합으로 비타민과 식이섬유가 풍부해요',
        fishIncluded: '오메가-3가 풍부한 생선이 포함되어 심장과 두뇌 건강에 좋아요',
        fiberRich: '식이섬유가 풍부해서 소화와 포만감 유지에 도움이 돼요',
        lightDinner: '가벼운 저녁으로 소화와 수면의 질을 높여줘요',
        highProtein: '고단백 식단으로 근육 유지와 에너지 충전에 좋아요'
    }
};

const proteinLabels = {
    en: { chicken: 'chicken', fish: 'fish', tofu: 'tofu', egg: 'egg', legume: 'legumes', turkey: 'turkey', seafood: 'seafood', dairy: 'dairy' },
    ko: { chicken: '닭고기', fish: '생선', tofu: '두부', egg: '달걀', legume: '콩류', turkey: '칠면조', seafood: '해산물', dairy: '유제품' }
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

    generateReasons() {
        const meals = [this.menus.breakfast, this.menus.lunch, this.menus.dinner].filter(Boolean);
        if (meals.length === 0) return [];

        const allTags = meals.flatMap(m => m.tags);
        const totalCalories = meals.reduce((sum, m) => sum + m.calories, 0);
        const msgs = reasonMessages[lang];
        const reasons = [];

        // 1. Calorie-based reason (always show)
        if (totalCalories >= 1200 && totalCalories <= 1500) {
            reasons.push(msgs.calorieIdeal(totalCalories.toLocaleString()));
        } else if (totalCalories < 1200) {
            reasons.push(msgs.calorieLow(totalCalories.toLocaleString()));
        } else {
            reasons.push(msgs.calorieHigh(totalCalories.toLocaleString()));
        }

        // 2. Protein diversity
        const proteinTypes = ['chicken', 'fish', 'tofu', 'egg', 'legume', 'turkey', 'seafood'];
        const foundProteins = [...new Set(allTags.filter(t => proteinTypes.includes(t)))];
        if (foundProteins.length >= 2) {
            const localLabels = proteinLabels[lang];
            const sourceNames = foundProteins.map(p => localLabels[p]);
            reasons.push(msgs.proteinDiversity(sourceNames));
        }

        // 3. Plant-based (2+ meals)
        const plantCount = meals.filter(m => m.tags.includes('plant-based')).length;
        if (plantCount >= 2 && foundProteins.length < 2) {
            reasons.push(msgs.plantBased);
        }

        // 4. Fish included
        if (allTags.includes('fish') && foundProteins.length < 2) {
            reasons.push(msgs.fishIncluded);
        }

        // 5. Fiber-rich (2+ meals)
        const fiberCount = meals.filter(m => m.tags.includes('fiber-rich')).length;
        if (fiberCount >= 2 && reasons.length < 3) {
            reasons.push(msgs.fiberRich);
        }

        // 6. Light dinner
        if (this.menus.dinner && this.menus.dinner.tags.includes('low-cal') && reasons.length < 3) {
            reasons.push(msgs.lightDinner);
        }

        // 7. High protein (2+ meals)
        const hpCount = meals.filter(m => m.tags.includes('high-protein')).length;
        if (hpCount >= 2 && reasons.length < 3) {
            reasons.push(msgs.highProtein);
        }

        // Return max 2 reasons
        return reasons.slice(0, 2);
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
        const breakfastCard = this.renderCard('breakfast', labels.breakfast, 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)');
        const lunchCard = this.renderCard('lunch', labels.lunch, 'linear-gradient(135deg, #22c55e 0%, #84cc16 100%)');
        const dinnerCard = this.renderCard('dinner', labels.dinner, 'linear-gradient(135deg, #f97316 0%, #fb7185 100%)');

        if (this.menus.breakfast) totalCalories += this.menus.breakfast.calories;
        if (this.menus.lunch) totalCalories += this.menus.lunch.calories;
        if (this.menus.dinner) totalCalories += this.menus.dinner.calories;

        const reasons = this.generateReasons();
        const reasonHTML = reasons.length > 0 ? `
            <div class="recommendation-reason">
                <div class="reason-title">💡 ${labels.reasonTitle}</div>
                <ul class="reason-list">
                    ${reasons.map(r => `<li>${r}</li>`).join('')}
                </ul>
            </div>
        ` : '';

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
                    opacity: 0;
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
                    cursor: default;
                }

                .menu-card:nth-child(1) { animation-delay: 0s; }
                .menu-card:nth-child(2) { animation-delay: 0.1s; }
                .menu-card:nth-child(3) { animation-delay: 0.2s; }

                .menu-card:hover {
                    transform: translateY(-6px);
                    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
                }

                :host-context(body.dark-mode) .menu-card {
                    background: linear-gradient(135deg, rgba(15, 23, 42, 0.85) 0%, rgba(15, 23, 42, 0.65) 100%);
                    border: 1px solid rgba(148, 163, 184, 0.15);
                }

                :host-context(body.dark-mode) .menu-card:hover {
                    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
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
                    transition: transform 0.3s ease;
                }

                .menu-card:hover .menu-emoji {
                    transform: scale(1.15);
                }

                .menu-name {
                    font-size: 1.05rem;
                    font-weight: 600;
                    color: #0f172a;
                    margin-bottom: 0.4rem;
                }

                :host-context(body.dark-mode) .menu-name {
                    color: #e2e8f0;
                }

                .menu-calories {
                    font-size: 0.85rem;
                    color: #78716c;
                    font-weight: 500;
                    padding: 0.2rem 0.6rem;
                    background: rgba(249, 115, 22, 0.08);
                    border-radius: 999px;
                    display: inline-block;
                }

                :host-context(body.dark-mode) .menu-calories {
                    color: #a0aec0;
                    background: rgba(251, 146, 60, 0.1);
                }

                .total-calories {
                    margin-top: 1.5rem;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #0f172a;
                    text-align: center;
                    padding: 1rem;
                    border-radius: 16px;
                    background: linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,237,213,0.6));
                    box-shadow: 0 5px 15px rgba(15, 23, 42, 0.1);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 0.5rem;
                    border: 1px solid rgba(249, 115, 22, 0.1);
                }

                :host-context(body.dark-mode) .total-calories {
                    background: linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(41, 37, 36, 0.7));
                    color: #e2e8f0;
                    border-color: rgba(251, 146, 60, 0.15);
                }

                .total-calories-icon {
                    font-size: 1.5rem;
                    color: #f97316;
                }

                .recommendation-reason {
                    margin-top: 1rem;
                    padding: 1rem 1.25rem;
                    border-radius: 14px;
                    background: linear-gradient(135deg, rgba(234, 245, 255, 0.9), rgba(219, 234, 254, 0.7));
                    border: 1px solid rgba(59, 130, 246, 0.15);
                    animation: rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    animation-delay: 0.3s;
                    opacity: 0;
                }

                :host-context(body.dark-mode) .recommendation-reason {
                    background: linear-gradient(135deg, rgba(30, 58, 95, 0.5), rgba(23, 37, 84, 0.4));
                    border-color: rgba(96, 165, 250, 0.2);
                }

                .reason-title {
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: #1e40af;
                    margin-bottom: 0.5rem;
                }

                :host-context(body.dark-mode) .reason-title {
                    color: #93c5fd;
                }

                .reason-list {
                    list-style: none;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.35rem;
                }

                .reason-list li {
                    font-size: 0.88rem;
                    color: #334155;
                    line-height: 1.5;
                    padding-left: 1.1rem;
                    position: relative;
                }

                .reason-list li::before {
                    content: '✓';
                    position: absolute;
                    left: 0;
                    color: #3b82f6;
                    font-weight: 700;
                }

                :host-context(body.dark-mode) .reason-list li {
                    color: #cbd5e1;
                }

                :host-context(body.dark-mode) .reason-list li::before {
                    color: #60a5fa;
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
                    .recommendation-reason {
                        padding: 0.85rem 1rem;
                    }
                }
            </style>
            <div class="menu-grid">
                ${breakfastCard}
                ${lunchCard}
                ${dinnerCard}
            </div>
            <div class="total-calories">
                <span class="total-calories-icon">🔥</span> ${labels.totalCalories}: ${totalCalories} kcal
            </div>
            ${reasonHTML}
        `;
    }
}

customElements.define('daily-menus', DailyMenus);

document.getElementById('generate-btn').addEventListener('click', () => {
    document.querySelector('daily-menus').generateMenus();
});
