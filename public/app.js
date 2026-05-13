const form = document.getElementById('meal-form');
const mealPlanContainer = document.getElementById('meal-plan');
const groceryNavContainer = document.getElementById('grocery-nav');
const groceryListContainer = document.getElementById('grocery-list');
const mealResultSection = document.getElementById('meal-result-section');
const errorMessage = document.getElementById('error-message');
const submitButton = document.getElementById('submit-button');
const submitButtonDefaultText = submitButton.textContent;
const clearFiltersButton = document.getElementById('clear-filters-button');
const loadingIndicator = document.getElementById('loading');

const groceryCategoryLabels = {
  protein: 'Proteins',
  carbs: 'Carbs',
  vegetables: 'Vegetables',
  dairy: 'Dairy',
  legumes: 'Legumes',
  fruits: 'Fruits',
  grains: 'Grains',
  herbs: 'Herbs',
  spices: 'Spices',
  oils: 'Oils',
  condiments: 'Condiments',
  seeds: 'Nuts & Seeds',
  other: 'Other',
};

const groceryCategoryOrder = [
  'protein',
  'vegetables',
  'fruits',
  'dairy',
  'legumes',
  'grains',
  'carbs',
  'seeds',
  'herbs',
  'spices',
  'oils',
  'condiments',
  'other',
];

let currentSearchPayload = null;
let currentMealPlan = [];

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorMessage.classList.add('hidden');
  mealResultSection.classList.add('hidden');
  submitButton.disabled = true;
  submitButton.textContent = 'Generating…';
  loadingIndicator.classList.remove('hidden');

  const tags = document.getElementById('tags').value;
  const dietary = document.getElementById('dietary').value;
  const exclude = document.getElementById('exclude').value;
  const selectedMealTypes = Array.from(document.querySelectorAll('input[name="meal-type"]:checked')).map((input) => input.value);
  const mealType = selectedMealTypes.length === 1
    ? selectedMealTypes[0]
    : selectedMealTypes.length > 1
      ? selectedMealTypes
      : undefined;
  const budgetInput = document.getElementById('budget').value.trim();
  const daysInput = document.getElementById('days').value.trim();

  const days = daysInput === '' ? undefined : Number(daysInput);
  const budget = budgetInput === '' ? undefined : Number(budgetInput);

  const validationError = validateForm({ daysInput, days, budgetInput, budget });
  if (validationError) {
    errorMessage.textContent = validationError;
    errorMessage.classList.remove('hidden');
    submitButton.disabled = false;
    submitButton.textContent = submitButtonDefaultText;
    loadingIndicator.classList.add('hidden');
    return;
  }

  const payload = {
    tags: tags.split(',').map((value) => value.trim()).filter(Boolean),
    dietaryRestrictions: dietary.split(',').map((value) => value.trim()).filter(Boolean),
    excludeIngredients: exclude.split(',').map((value) => value.trim()).filter(Boolean),
    mealType: mealType || undefined,
    maxBudget: typeof budget === 'number' && budget > 0 ? budget : undefined,
    days,
  };

  try {
    const response = await fetch('/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to generate plan');
    }

    currentSearchPayload = payload;
    currentMealPlan = result.mealPlan;

    renderMealPlan(result.mealPlan);
    const groceryItems = getGroceryItems(result);
    renderGroceryList(groceryItems);
    mealResultSection.classList.remove('hidden');
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.classList.remove('hidden');
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = submitButtonDefaultText;
    loadingIndicator.classList.add('hidden');
  }
});

clearFiltersButton.addEventListener('click', () => {
  form.reset();
  document.querySelectorAll('input[name="meal-type"]').forEach((input) => {
    input.checked = false;
  });
  errorMessage.classList.add('hidden');
  mealResultSection.classList.add('hidden');
});

function validateForm({ daysInput, days, budgetInput, budget }) {
  if (daysInput === '') {
    return 'Number of days is required.';
  }

  if (Number.isNaN(days)) {
    return 'The number of days must be a whole number between 1 and 7.';
  }

  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return 'The number of days must be an integer between 1 and 7.';
  }

  if (budgetInput !== '' && (Number.isNaN(budget) || budget <= 0)) {
    return 'Maximum budget must be a positive number.';
  }

  return null;
}

function renderMealPlan(mealPlan) {
  mealPlanContainer.innerHTML = '';

  mealPlan.forEach((dayPlan) => {
    const dayCard = document.createElement('article');
    dayCard.className = 'meal-card day-card';

    const dayMeta = `
      <div class="meal-meta">
        <span><strong>Day ${dayPlan.day}</strong></span>
      </div>
    `;

    if (dayPlan.breakfast || dayPlan.lunch || dayPlan.dinner) {
      const presentMeals = ['breakfast', 'lunch', 'dinner'].filter((key) => dayPlan[key]);
      const mealSections = presentMeals
        .map((key) => {
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          return renderMealSection(label, dayPlan[key], dayPlan.day, key);
        })
        .join('');

      dayCard.innerHTML = `
        ${dayMeta}
        <div class="meal-day-grid">
          ${mealSections}
        </div>
      `;
    } else if (dayPlan.recipe) {
      const mealLabel = dayPlan.mealType ? dayPlan.mealType.charAt(0).toUpperCase() + dayPlan.mealType.slice(1) : dayPlan.recipe.mealType || 'Meal';
      const mealCost = typeof dayPlan.recipe.estimatedCost === 'number'
        ? `$${dayPlan.recipe.estimatedCost.toFixed(2)} per meal`
        : 'Price unavailable';

      dayCard.innerHTML = `
        ${dayMeta}
        <div class="meal-meta">
          <span>${mealLabel}</span>
          <span>${mealCost}</span>
        </div>
        ${renderMealSection(mealLabel, dayPlan.recipe, dayPlan.day, mealLabel.toLowerCase())}
      `;
    } else {
      dayCard.innerHTML = `
        ${dayMeta}
        <div class="meal-section empty">
          <strong>No meal plan available</strong>
          <p>The meal plan did not include a valid recipe for this day.</p>
        </div>
      `;
    }

    mealPlanContainer.appendChild(dayCard);
  });
}

mealPlanContainer.addEventListener('click', async (event) => {
  const toggle = event.target.closest('.toggle-override-button');
  if (toggle) {
    const section = toggle.closest('.meal-section');
    const panel = section?.querySelector('.override-panel');
    if (panel) {
      panel.classList.toggle('hidden');
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  const apply = event.target.closest('.apply-override-button');
  if (!apply) {
    return;
  }

  const day = Number(apply.dataset.day);
  const meal = apply.dataset.meal;
  const currentRecipeId = apply.dataset.recipeId;
  const panel = apply.closest('.override-panel');

  if (!currentSearchPayload || !meal || !currentRecipeId || !panel) {
    return;
  }

  const overrideTags = panel.querySelector('input[name="override-tags"]').value;
  const overrideDietaryRestrictions = panel.querySelector('input[name="override-dietary"]').value;
  const overrideExcludeIngredients = panel.querySelector('input[name="override-exclude"]').value;

  apply.disabled = true;
  errorMessage.classList.add('hidden');

  try {
    const response = await fetch('/plan/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentSearchPayload,
        mealType: meal,
        excludeRecipeIds: [currentRecipeId],
        overrideTags,
        overrideDietaryRestrictions,
        overrideExcludeIngredients,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Unable to replace recipe');
    }

    const replacement = result.recipe;
    currentMealPlan = currentMealPlan.map((dayPlan) => {
      if (dayPlan.day !== day) {
        return dayPlan;
      }
      if (dayPlan.breakfast || dayPlan.lunch || dayPlan.dinner) {
        return {
          ...dayPlan,
          [meal]: replacement,
        };
      }
      return {
        ...dayPlan,
        recipe: replacement,
      };
    });

    renderMealPlan(currentMealPlan);
    renderGroceryList(collectIngredientsFromMealPlan(currentMealPlan));
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.classList.remove('hidden');
    errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    apply.disabled = false;
  }
});

function collectIngredientsFromMealPlan(mealPlan) {
  const ingredients = [];

  mealPlan.forEach((dayPlan) => {
    const addRecipe = (recipe) => {
      if (!recipe || !Array.isArray(recipe.ingredients)) {
        return;
      }
      recipe.ingredients.forEach((ingredient) => {
        if (typeof ingredient === 'string') {
          ingredients.push({ name: ingredient, category: 'other' });
        } else {
          ingredients.push({ name: ingredient.name, category: ingredient.category || 'other' });
        }
      });
    };

    if (dayPlan.recipe) {
      addRecipe(dayPlan.recipe);
      return;
    }

    addRecipe(dayPlan.breakfast);
    addRecipe(dayPlan.lunch);
    addRecipe(dayPlan.dinner);
  });

  return ingredients;
}

function normalizeGroceryItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((ingredient) => {
    if (typeof ingredient === 'string') {
      return { name: ingredient, category: 'other' };
    }
    if (ingredient && typeof ingredient === 'object') {
      return {
        name: ingredient.name || String(ingredient).trim(),
        category: ingredient.category || 'other',
      };
    }
    return { name: String(ingredient), category: 'other' };
  }).filter((item) => item.name);
}

function getGroceryItems(result) {
  const groceryList = Array.isArray(result.groceryList) ? result.groceryList : [];
  const normalized = normalizeGroceryItems(groceryList);
  return normalized.length > 0 ? normalized : collectIngredientsFromMealPlan(result.mealPlan || []);
}

function validateForm({ daysInput, days, budgetInput, budget }) {
  if (daysInput === '') {
    return 'Number of days is required.';
  }

  if (Number.isNaN(days)) {
    return 'The number of days must be a whole number between 1 and 7.';
  }

  if (!Number.isInteger(days) || days < 1 || days > 7) {
    return 'The number of days must be an integer between 1 and 7.';
  }

  if (budgetInput !== '' && (Number.isNaN(budget) || budget <= 0)) {
    return 'Maximum budget must be a positive number.';
  }

  return null;
}

function renderIngredientList(recipe) {
  if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    return '';
  }

  return `
    <div class="meal-ingredients">
      <strong>Ingredients</strong>
      <ul>
        ${recipe.ingredients
          .map((ingredient) => {
            const name = typeof ingredient === 'string'
              ? ingredient
              : ingredient?.name || ingredient?.ingredient || ingredient?.item || ingredient?.text || 'Unknown';
            return `<li>${name}</li>`;
          })
          .join('')}
      </ul>
    </div>
  `;
}

function formatCost(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Price unavailable';
  }
  return `$${value.toFixed(2)}`;
}

function renderMealSection(label, recipe, day, mealKey) {
  if (!recipe) {
    return `<div class="meal-section empty"><strong>${label}</strong><p>No meal available</p></div>`;
  }

  return `
    <div class="meal-section ${mealKey}">
      <strong>${label}</strong>
      <div class="meal-name">${recipe.name}</div>
      <div class="meal-desc">${recipe.description}</div>
      <div class="meal-meta small">
        <span>${recipe.mealType || 'Meal'}</span>
        <span>${formatCost(recipe.estimatedCost)}</span>
      </div>
      ${renderIngredientList(recipe)}
      <button type="button" class="toggle-override-button" data-day="${day}" data-meal="${mealKey}">Customize</button>
      <div class="override-panel hidden" data-day="${day}" data-meal="${mealKey}">
        <label>
          Tags or requests
          <input name="override-tags" type="text" placeholder="e.g. vegetarian, spicy" />
        </label>
        <label>
          Dietary restrictions
          <input name="override-dietary" type="text" placeholder="e.g. gluten-free, vegan" />
        </label>
        <label>
          Exclude ingredients
          <input name="override-exclude" type="text" placeholder="e.g. eggs, dairy" />
        </label>
        <button type="button" class="apply-override-button" data-day="${day}" data-meal="${mealKey}" data-recipe-id="${recipe.id}">Apply override</button>
      </div>
    </div>
  `;
}

const groceryCategories = [
  {
    name: 'Vegetables',
    keywords: ['pepper', 'peppers', 'cucumber', 'tomato', 'lettuce', 'spinach', 'zucchini', 'broccoli', 'carrot', 'onion', 'garlic', 'eggplant', 'cabbage', 'cauliflower', 'kale', 'asparagus', 'pumpkin'],
  },
  {
    name: 'Fruits',
    keywords: ['banana', 'strawberry', 'strawberries', 'apple', 'pear', 'orange', 'lemon', 'lime', 'blueberry', 'mango', 'peach', 'kiwi', 'grape', 'grapefruit', 'cherry', 'watermelon', 'melon', 'papaya'],
  },
  {
    name: 'Proteins',
    keywords: ['egg', 'eggs', 'chicken', 'turkey', 'beef', 'salmon', 'tuna', 'tofu', 'tempeh', 'ham', 'pork', 'fish', 'shrimp', 'prawns', 'seafood', 'rib', 'loin', 'fillet', 'steak', 'meatballs', 'meatball'],
  },
  {
    name: 'Dairy & Alternatives',
    keywords: ['milk', 'yogurt', 'yogurt', 'cheese', 'parmesan', 'feta', 'cream', 'butter', 'ricotta', 'mozzarella', 'kefir', 'oat drink', 'soy drink', 'almond milk', 'oat milk', 'soy milk', 'almond milk', 'plant milk'],
    phrases: ['almond milk', 'oat milk', 'soy milk', 'soy drink', 'almond drink'],
  },
  {
    name: 'Nuts & Seeds',
    keywords: ['almond', 'almonds', 'nut', 'nuts', 'pistachio', 'hazelnut', 'peanut', 'peanuts', 'sesame', 'chia', 'flax', 'sunflower', 'pumpkin seeds'],
  },
  {
    name: 'Legumes',
    keywords: ['lentil', 'lentils', 'chickpea', 'chickpeas', 'bean', 'beans', 'pea', 'peas', 'soy', 'soybean', 'kidney beans'],
  },
  {
    name: 'Grains & Carbs',
    keywords: ['rice', 'pasta', 'bread', 'tortilla', 'quinoa', 'oats', 'cereal', 'potato', 'potatoes', 'pancake', 'spaghetti', 'noodles', 'dough', 'tortilla', 'corn', 'couscous', 'barley', 'wheat', 'maize'],
  },
  {
    name: 'Herbs & Spices',
    keywords: ['oil', 'olive oil', 'salt', 'pepper', 'sauce', 'soy sauce', 'vinegar', 'oregano', 'basil', 'cilantro', 'parsley', 'thyme', 'rosemary', 'cumin', 'curry', 'chili', 'chile', 'paprika'],
  },
];

function classifyIngredient(ingredient) {
  const normalized = ingredient.toLowerCase();

  for (const category of groceryCategories) {
    if (category.phrases && category.phrases.some((phrase) => normalized.includes(phrase))) {
      return category.name;
    }
  }

  for (const category of groceryCategories) {
    if (category.keywords.some((keyword) => normalized.includes(keyword))) {
      return category.name;
    }
  }

  return 'Otros';
}

function buildGroceryCategories(items) {
  const categories = groceryCategories.reduce((acc, category) => {
    acc[category.name] = [];
    return acc;
  }, { Otros: [] });

  items.forEach((ingredient) => {
    const category = classifyIngredient(ingredient);
    categories[category].push(ingredient);
  });

  return categories;
}

function renderGroceryList(items) {
  groceryNavContainer.innerHTML = '';
  groceryListContainer.innerHTML = '';

  const categories = items.reduce((acc, ingredient) => {
    const categoryKey = ingredient.category || 'other';
    if (!acc[categoryKey]) {
      acc[categoryKey] = new Set();
    }
    acc[categoryKey].add(ingredient.name);
    return acc;
  }, {});

  if (Object.keys(categories).length === 0) {
    groceryListContainer.innerHTML = '<p class="empty-grocery">No ingredients found for the selected plan.</p>';
    return;
  }

  const availableCategories = Object.keys(categories).sort((a, b) => {
    const orderA = groceryCategoryOrder.indexOf(a);
    const orderB = groceryCategoryOrder.indexOf(b);
    return (orderA === -1 ? groceryCategoryOrder.length : orderA) - (orderB === -1 ? groceryCategoryOrder.length : orderB);
  });

  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = 'grocery-nav-button active';
  allButton.dataset.category = 'all';
  allButton.textContent = 'All';
  allButton.addEventListener('click', () => {
    setActiveGroceryCategory('all', categories);
  });
  groceryNavContainer.appendChild(allButton);

  availableCategories.forEach((categoryKey) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'grocery-nav-button';
    button.dataset.category = categoryKey;
    button.textContent = groceryCategoryLabels[categoryKey] || categoryKey;
    button.addEventListener('click', () => {
      setActiveGroceryCategory(categoryKey, categories);
    });
    groceryNavContainer.appendChild(button);
  });

  setActiveGroceryCategory('all', categories);
}

function setActiveGroceryCategory(activeCategory, categories) {
  const buttons = groceryNavContainer.querySelectorAll('.grocery-nav-button');
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.category === activeCategory);
  });

  groceryListContainer.innerHTML = '';

  if (activeCategory === 'all') {
    const allItems = Object.values(categories).flatMap((items) => Array.from(items));
    const categorySection = document.createElement('div');
    categorySection.className = 'grocery-category';
    categorySection.innerHTML = `
      <h3>All Ingredients</h3>
      <ul class="grocery-category-items grocery-category-items-all">
        ${allItems
          .map((ingredient) => `<li>${ingredient}</li>`)
          .join('')}
      </ul>
    `;
    groceryListContainer.appendChild(categorySection);
    return;
  }

  const categorySection = document.createElement('div');
  categorySection.className = 'grocery-category';
  categorySection.innerHTML = `
    <h3>${groceryCategoryLabels[activeCategory] || activeCategory}</h3>
    <ul class="grocery-category-items">
      ${Array.from(categories[activeCategory] || [])
        .map((ingredient) => `<li>${ingredient}</li>`)
        .join('')}
    </ul>
  `;

  groceryListContainer.appendChild(categorySection);
}
