const filterButtons = document.querySelectorAll('[data-filter]');
const dayCards = document.querySelectorAll('[data-day]');

const setActiveFilter = (value) => {
    filterButtons.forEach((btn) => {
        const isActive = btn.dataset.filter === value;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    dayCards.forEach((card) => {
        const showAll = value === 'all';
        const matches = card.dataset.day === value;
        card.style.display = showAll || matches ? 'block' : 'none';
    });
};

if (filterButtons.length > 0) {
    filterButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            setActiveFilter(btn.dataset.filter);
        });
    });
    setActiveFilter('all');
}

const language = document.documentElement.lang === 'ko' ? 'ko' : 'en';
const menuData = getMenuData(language);
const weekStorageKey = `weeklyPlan:${language}`;

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

const generateWeekPlan = () => {
    const plan = [];
    dayCards.forEach((card) => {
        const day = card.dataset.day;
        const breakfast = pickRandom(menuData.breakfast);
        const lunch = pickRandom(menuData.lunch);
        const dinner = pickRandom(menuData.dinner);
        const meals = { breakfast, lunch, dinner };

        card.querySelectorAll('[data-meal]').forEach((el) => {
            const type = el.dataset.meal;
            if (meals[type]) {
                el.textContent = meals[type].name;
            }
        });

        plan.push({ day, meals });
    });

    localStorage.setItem(weekStorageKey, JSON.stringify(plan));
};

const regenerateBtn = document.getElementById('regenerate-week');
if (regenerateBtn) {
    regenerateBtn.addEventListener('click', () => {
        generateWeekPlan();
    });
}

generateWeekPlan();
