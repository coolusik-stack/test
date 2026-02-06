const language = document.documentElement.lang === 'ko' ? 'ko' : 'en';
const labels = {
    en: {
        title: 'Grocery List',
        regenerate: 'Regenerate list',
        empty: 'No plan found. Generating a new list...'
    },
    ko: {
        title: '장보기 리스트',
        regenerate: '리스트 다시 생성',
        empty: '저장된 플랜이 없어 새로 생성합니다.'
    }
};

const categoryLabels = {
    en: {
        produce: 'Produce',
        protein: 'Protein',
        grains: 'Grains',
        dairy: 'Dairy',
        pantry: 'Pantry'
    },
    ko: {
        produce: '채소/과일',
        protein: '단백질',
        grains: '곡류',
        dairy: '유제품',
        pantry: '팬트리'
    }
};

const menuData = getMenuData(language);
const weekStorageKey = `weeklyPlan:${language}`;

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

const generateWeekPlan = () => {
    const plan = [];
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    days.forEach((day) => {
        const breakfast = pickRandom(menuData.breakfast);
        const lunch = pickRandom(menuData.lunch);
        const dinner = pickRandom(menuData.dinner);
        plan.push({ day, meals: { breakfast, lunch, dinner } });
    });
    localStorage.setItem(weekStorageKey, JSON.stringify(plan));
    return plan;
};

const getPlan = () => {
    const stored = localStorage.getItem(weekStorageKey);
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch (error) {
        return null;
    }
};

const buildList = (plan) => {
    const list = {
        produce: new Set(),
        protein: new Set(),
        grains: new Set(),
        dairy: new Set(),
        pantry: new Set()
    };

    plan.forEach((day) => {
        Object.values(day.meals).forEach((meal) => {
            meal.ingredients.forEach((ingredient) => {
                if (list[ingredient.category]) {
                    list[ingredient.category].add(ingredient.name);
                }
            });
        });
    });

    return list;
};

const renderList = (list) => {
    const container = document.getElementById('grocery-list');
    container.innerHTML = '';

    Object.keys(list).forEach((category) => {
        const items = Array.from(list[category]).sort();
        if (items.length === 0) return;

        const section = document.createElement('section');
        section.className = 'grocery-card';

        const title = document.createElement('h2');
        title.textContent = categoryLabels[language][category];
        title.className = 'grocery-title';

        const ul = document.createElement('ul');
        ul.className = 'grocery-items';

        items.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'grocery-item';
            li.innerHTML = `
                <label class="grocery-check">
                    <input type="checkbox" />
                    <span>${item}</span>
                </label>
            `;
            ul.appendChild(li);
        });

        section.appendChild(title);
        section.appendChild(ul);
        container.appendChild(section);
    });
};

const init = () => {
    const plan = getPlan() || generateWeekPlan();
    const list = buildList(plan);
    renderList(list);
};

const regenerateBtn = document.getElementById('regenerate-list');
if (regenerateBtn) {
    regenerateBtn.addEventListener('click', () => {
        const plan = generateWeekPlan();
        const list = buildList(plan);
        renderList(list);
    });
}

init();
