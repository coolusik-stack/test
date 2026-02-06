const MENU_DATA = {
    en: {
        breakfast: [
            {
                name: 'Oatmeal + Greek yogurt + berries',
                ingredients: [
                    { name: 'Rolled oats', category: 'grains' },
                    { name: 'Greek yogurt', category: 'dairy' },
                    { name: 'Berries', category: 'produce' }
                ]
            },
            {
                name: 'Whole-grain toast + avocado + egg',
                ingredients: [
                    { name: 'Whole-grain bread', category: 'grains' },
                    { name: 'Avocado', category: 'produce' },
                    { name: 'Eggs', category: 'protein' }
                ]
            },
            {
                name: 'Tofu scramble + veggies',
                ingredients: [
                    { name: 'Tofu', category: 'protein' },
                    { name: 'Spinach', category: 'produce' },
                    { name: 'Bell peppers', category: 'produce' }
                ]
            },
            {
                name: 'Fruit + nuts + plain yogurt',
                ingredients: [
                    { name: 'Seasonal fruit', category: 'produce' },
                    { name: 'Mixed nuts', category: 'pantry' },
                    { name: 'Plain yogurt', category: 'dairy' }
                ]
            },
            {
                name: 'Chia pudding + banana + nuts',
                ingredients: [
                    { name: 'Chia seeds', category: 'pantry' },
                    { name: 'Bananas', category: 'produce' },
                    { name: 'Almond milk', category: 'dairy' }
                ]
            }
        ],
        lunch: [
            {
                name: 'Brown rice + grilled chicken + salad',
                ingredients: [
                    { name: 'Brown rice', category: 'grains' },
                    { name: 'Chicken breast', category: 'protein' },
                    { name: 'Mixed greens', category: 'produce' }
                ]
            },
            {
                name: 'Tofu steak + roasted veggies',
                ingredients: [
                    { name: 'Tofu', category: 'protein' },
                    { name: 'Zucchini', category: 'produce' },
                    { name: 'Carrots', category: 'produce' }
                ]
            },
            {
                name: 'Salmon salad + whole-grain bread',
                ingredients: [
                    { name: 'Salmon', category: 'protein' },
                    { name: 'Mixed greens', category: 'produce' },
                    { name: 'Whole-grain bread', category: 'grains' }
                ]
            },
            {
                name: 'Quinoa bowl + chickpeas + veggies',
                ingredients: [
                    { name: 'Quinoa', category: 'grains' },
                    { name: 'Chickpeas', category: 'protein' },
                    { name: 'Cucumbers', category: 'produce' }
                ]
            },
            {
                name: 'Chicken soup + side salad',
                ingredients: [
                    { name: 'Chicken breast', category: 'protein' },
                    { name: 'Celery', category: 'produce' },
                    { name: 'Mixed greens', category: 'produce' }
                ]
            }
        ],
        dinner: [
            {
                name: 'Baked salmon + roasted veggies',
                ingredients: [
                    { name: 'Salmon', category: 'protein' },
                    { name: 'Broccoli', category: 'produce' },
                    { name: 'Sweet potatoes', category: 'produce' }
                ]
            },
            {
                name: 'Chicken + quinoa + salad',
                ingredients: [
                    { name: 'Chicken breast', category: 'protein' },
                    { name: 'Quinoa', category: 'grains' },
                    { name: 'Mixed greens', category: 'produce' }
                ]
            },
            {
                name: 'Grilled tofu + sautéed mushrooms',
                ingredients: [
                    { name: 'Tofu', category: 'protein' },
                    { name: 'Mushrooms', category: 'produce' },
                    { name: 'Garlic', category: 'produce' }
                ]
            },
            {
                name: 'Shrimp stir-fry + brown rice',
                ingredients: [
                    { name: 'Shrimp', category: 'protein' },
                    { name: 'Brown rice', category: 'grains' },
                    { name: 'Snow peas', category: 'produce' }
                ]
            },
            {
                name: 'Stuffed bell peppers',
                ingredients: [
                    { name: 'Bell peppers', category: 'produce' },
                    { name: 'Lean turkey', category: 'protein' },
                    { name: 'Brown rice', category: 'grains' }
                ]
            }
        ]
    },
    ko: {
        breakfast: [
            {
                name: '오트밀 + 그릭요거트 + 베리',
                ingredients: [
                    { name: '오트밀', category: 'grains' },
                    { name: '그릭요거트', category: 'dairy' },
                    { name: '베리', category: 'produce' }
                ]
            },
            {
                name: '통밀 토스트 + 아보카도 + 달걀',
                ingredients: [
                    { name: '통밀빵', category: 'grains' },
                    { name: '아보카도', category: 'produce' },
                    { name: '달걀', category: 'protein' }
                ]
            },
            {
                name: '두부 스크램블 + 채소',
                ingredients: [
                    { name: '두부', category: 'protein' },
                    { name: '시금치', category: 'produce' },
                    { name: '파프리카', category: 'produce' }
                ]
            },
            {
                name: '과일 + 견과류 + 플레인 요거트',
                ingredients: [
                    { name: '제철 과일', category: 'produce' },
                    { name: '견과류', category: 'pantry' },
                    { name: '플레인 요거트', category: 'dairy' }
                ]
            },
            {
                name: '치아푸딩 + 바나나 + 견과류',
                ingredients: [
                    { name: '치아씨드', category: 'pantry' },
                    { name: '바나나', category: 'produce' },
                    { name: '아몬드밀크', category: 'dairy' }
                ]
            }
        ],
        lunch: [
            {
                name: '현미/잡곡밥 + 닭가슴살 + 샐러드',
                ingredients: [
                    { name: '현미', category: 'grains' },
                    { name: '닭가슴살', category: 'protein' },
                    { name: '믹스 채소', category: 'produce' }
                ]
            },
            {
                name: '두부 스테이크 + 구운 채소',
                ingredients: [
                    { name: '두부', category: 'protein' },
                    { name: '주키니', category: 'produce' },
                    { name: '당근', category: 'produce' }
                ]
            },
            {
                name: '연어 샐러드 + 통곡물빵',
                ingredients: [
                    { name: '연어', category: 'protein' },
                    { name: '샐러드 채소', category: 'produce' },
                    { name: '통곡물빵', category: 'grains' }
                ]
            },
            {
                name: '퀴노아 볼 + 병아리콩 + 채소',
                ingredients: [
                    { name: '퀴노아', category: 'grains' },
                    { name: '병아리콩', category: 'protein' },
                    { name: '오이', category: 'produce' }
                ]
            },
            {
                name: '치킨 수프 + 샐러드',
                ingredients: [
                    { name: '닭가슴살', category: 'protein' },
                    { name: '샐러리', category: 'produce' },
                    { name: '믹스 채소', category: 'produce' }
                ]
            }
        ],
        dinner: [
            {
                name: '연어 구이 + 구운 채소',
                ingredients: [
                    { name: '연어', category: 'protein' },
                    { name: '브로콜리', category: 'produce' },
                    { name: '고구마', category: 'produce' }
                ]
            },
            {
                name: '닭가슴살 + 퀴노아 + 샐러드',
                ingredients: [
                    { name: '닭가슴살', category: 'protein' },
                    { name: '퀴노아', category: 'grains' },
                    { name: '믹스 채소', category: 'produce' }
                ]
            },
            {
                name: '두부 구이 + 버섯볶음',
                ingredients: [
                    { name: '두부', category: 'protein' },
                    { name: '버섯', category: 'produce' },
                    { name: '마늘', category: 'produce' }
                ]
            },
            {
                name: '새우 볶음 + 현미밥',
                ingredients: [
                    { name: '새우', category: 'protein' },
                    { name: '현미', category: 'grains' },
                    { name: '완두콩', category: 'produce' }
                ]
            },
            {
                name: '속 채운 파프리카',
                ingredients: [
                    { name: '파프리카', category: 'produce' },
                    { name: '다진 칠면조', category: 'protein' },
                    { name: '현미', category: 'grains' }
                ]
            }
        ]
    }
};

const getMenuData = (lang) => {
    if (lang === 'ko') {
        return MENU_DATA.ko;
    }
    return MENU_DATA.en;
};
