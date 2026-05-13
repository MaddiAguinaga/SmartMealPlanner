const assert = require('assert');
const { getRecipes, filterRecipes } = require('../src/recipe/recipeModule');
const { createWeeklyPlan } = require('../src/skills/mealPlanningSkill');
const { buildShoppingList } = require('../src/skills/groceryAggregationSkill');
const {
  extractJsonString,
  normalizeMealPlan,
  validateMealPlan,
  normalizeGroceryList,
  validateGroceryList,
} = require('../src/agent/orchestrator');

function testGetRecipesBreakfast() {
  const recipes = getRecipes({ tags: ['breakfast'] });
  assert(Array.isArray(recipes), 'getRecipes should return an array');
  assert(recipes.length > 0, 'getRecipes should return at least one breakfast recipe');
  recipes.forEach((recipe) => {
    assert(recipe.tags.includes('breakfast'), 'Each returned recipe should include the breakfast tag');
  });
}

function testFilterRecipesVegan() {
  const recipes = getRecipes();
  const filtered = filterRecipes(recipes, {
    dietaryRestrictions: ['vegan'],
    excludeIngredients: ['cheese'],
    maxBudget: 12,
  });

  assert(Array.isArray(filtered), 'filterRecipes should return an array');
  assert(filtered.length > 0, 'filterRecipes should return at least one vegan recipe when available');
  filtered.forEach((recipe) => {
    const dietary = Array.isArray(recipe.dietary) ? recipe.dietary.map((item) => item.toLowerCase()) : [];
    const ingredientNames = recipe.ingredients.map((ingredient) =>
      typeof ingredient === 'string' ? ingredient.toLowerCase() : ingredient.name.toLowerCase()
    );

    assert(dietary.includes('vegan'), 'Filtered recipe should meet vegan restriction');
    assert(!ingredientNames.includes('cheese'), 'Filtered recipe should not include excluded ingredients');
    assert(recipe.estimatedCost <= 12, 'Filtered recipe should be within budget');
  });
}

function testCreateWeeklyPlanThreeMeals() {
  const recipes = getRecipes();
  const plan = createWeeklyPlan(recipes, 3);
  assert(Array.isArray(plan), 'createWeeklyPlan should return an array');
  assert(plan.length === 3, 'createWeeklyPlan should return exactly 3 days');

  plan.forEach((entry, index) => {
    assert(entry.day === index + 1, 'Day number should match the entry position');
    assert(entry.breakfast, 'Each day should include a breakfast recipe');
    assert(entry.lunch, 'Each day should include a lunch recipe');
    assert(entry.dinner, 'Each day should include a dinner recipe');
    assert(typeof entry.breakfast.name === 'string', 'Breakfast recipe should have a name');
    assert(typeof entry.lunch.name === 'string', 'Lunch recipe should have a name');
    assert(typeof entry.dinner.name === 'string', 'Dinner recipe should have a name');
  });
}

function testBuildShoppingListForFullPlan() {
  const recipes = getRecipes();
  const plan = createWeeklyPlan(recipes, 2);
  const groceries = buildShoppingList(plan);
  assert(Array.isArray(groceries), 'buildShoppingList should return an array');
  assert(groceries.length > 0, 'Grocery list should contain at least one ingredient');
  const uniqueNames = new Set(groceries.map((item) => item.name));
  assert(uniqueNames.size === groceries.length, 'Grocery list should not contain duplicate ingredients');
  groceries.forEach((item) => {
    assert(item.name, 'Each grocery item should have a name');
    assert(item.category, 'Each grocery item should have a category');
  });
}

function testNoFalsePositiveEggLunch() {
  const lunchRecipes = getRecipes({ tags: ['egg'], keywords: ['egg'], mealType: 'lunch' });
  assert.strictEqual(lunchRecipes.length, 0, 'Egg should not match lunch recipes without egg ingredient');
}

function testExactIngredientEggBreakfast() {
  const breakfastRecipes = getRecipes({ tags: ['egg'], keywords: ['egg'], mealType: 'breakfast' });
  assert(breakfastRecipes.length > 0, 'There should be breakfast recipes matching egg');
  const hasEggRecipe = breakfastRecipes.some((recipe) => recipe.name === 'Spinach and Feta Omelette');
  assert(hasEggRecipe, 'Expected Spinach and Feta Omelette to match egg breakfast search');
}

function testExcludeIngredientExactMatch() {
  const breakfastRecipes = getRecipes({ mealType: 'breakfast' });
  const filtered = filterRecipes(breakfastRecipes, { excludeIngredients: ['egg'] });
  assert(filtered.length > 0, 'There should still be breakfast recipes after excluding egg ingredients');
  assert(!filtered.some((recipe) => recipe.ingredients.some((ingredient) => {
    const name = typeof ingredient === 'string' ? ingredient.toLowerCase() : ingredient.name.toLowerCase();
    return name.includes('egg');
  })), 'Filtered breakfast recipes should not include an egg ingredient');
}

function testCreateWeeklyPlanMultiMealTypes() {
  const breakfastRecipes = getRecipes({ mealType: 'breakfast' });
  const dinnerRecipes = getRecipes({ mealType: 'dinner' });
  const plan = createWeeklyPlan({ breakfast: breakfastRecipes, lunch: [], dinner: dinnerRecipes }, 2, ['breakfast', 'dinner']);
  assert(Array.isArray(plan), 'createWeeklyPlan should return an array for multi meal types');
  assert(plan.length === 2, 'createWeeklyPlan should return exactly 2 days for this test');
  plan.forEach((entry) => {
    assert(entry.breakfast, 'Each day should include a breakfast recipe');
    assert(entry.dinner, 'Each day should include a dinner recipe');
    assert(!entry.lunch, 'Lunch should not be included when only breakfast and dinner are selected');
  });
}

function testCreateWeeklyPlanSelectedMealTypesPerDay() {
  const recipes = getRecipes();
  const plan = createWeeklyPlan(recipes, 2, ['lunch', 'dinner']);
  assert(Array.isArray(plan), 'createWeeklyPlan should return an array for selected meal types');
  assert(plan.length === 2, 'createWeeklyPlan should return exactly 2 days when selecting lunch and dinner');
  plan.forEach((entry) => {
    assert(entry.lunch, 'Each day should include a lunch recipe');
    assert(entry.dinner, 'Each day should include a dinner recipe');
    assert(!entry.breakfast, 'Breakfast should not be included when only lunch and dinner are selected');
  });
}

function testNormalizeMealPlanGroupedByType() {
  const grouped = [
    {
      day: 'breakfast',
      '1': { day: 1, recipe: { id: 'r5', name: 'Oatmeal with Fruit' } },
      '2': { day: 2, recipe: { id: 'r10', name: 'Greek Yogurt Parfait' } },
    },
    {
      day: 'lunch',
      '1': { day: 1, recipe: { id: 'r3', name: 'Quinoa Salad' } },
      '2': { day: 2, recipe: { id: 'r7', name: 'Mediterranean Chickpea Salad' } },
    },
  ];

  const normalized = normalizeMealPlan(grouped);
  assert(Array.isArray(normalized), 'normalizeMealPlan should return an array for grouped meal type input');
  assert(normalized.length === 2, 'normalizeMealPlan should preserve day count');
  assert(normalized[0].breakfast, 'Day 1 should include breakfast after normalization');
  assert(normalized[0].lunch, 'Day 1 should include lunch after normalization');
  assert(normalized[1].breakfast, 'Day 2 should include breakfast after normalization');
  assert(normalized[1].lunch, 'Day 2 should include lunch after normalization');
  assert(validateMealPlan(normalized), 'Normalized meal plan should pass validation');
}

function testNormalizeMealPlanGroupedByTypeObject() {
  const grouped = {
    lunch: [
      { day: 1, recipe: { id: 'r3', name: 'Quinoa Salad' } },
      { day: 2, recipe: { id: 'r7', name: 'Mediterranean Chickpea Salad' } },
    ],
    dinner: [
      { day: 1, recipe: { id: 'r1', name: 'Vegetable Stir Fry' } },
      { day: 2, recipe: { id: 'r4', name: 'Pasta Primavera' } },
    ],
  };

  const normalized = normalizeMealPlan(grouped);
  assert(Array.isArray(normalized), 'normalizeMealPlan should return an array for object grouped meal type input');
  assert(normalized.length === 2, 'normalizeMealPlan should preserve day count for object grouped meal type input');
  assert(normalized[0].lunch, 'Day 1 should include lunch after normalization');
  assert(normalized[0].dinner, 'Day 1 should include dinner after normalization');
  assert(normalized[1].lunch, 'Day 2 should include lunch after normalization');
  assert(normalized[1].dinner, 'Day 2 should include dinner after normalization');
  assert(validateMealPlan(normalized), 'Normalized meal plan should pass validation for object grouped meal type input');
}

function testValidateGroceryListObjectFormat() {
  const groceryObject = {
    milk: 'dairy',
    bread: { name: 'bread', category: 'carbs' },
  };
  const normalized = normalizeGroceryList(groceryObject);
  assert(Array.isArray(normalized), 'normalizeGroceryList should return an array from object format');
  assert(normalized.length === 2, 'normalizeGroceryList should include two grocery items');
  assert(validateGroceryList(normalized), 'Normalized grocery list should pass validation');
}

function testInvalidMealPlanFailsValidation() {
  const badPlan = [
    { day: 1, breakfast: null },
    { day: 'two', lunch: { name: 'Fake Lunch' } },
  ];
  assert.strictEqual(validateMealPlan(badPlan), false, 'Invalid meal plans should fail validation');
}

function testExtractJsonStringFromMarkdown() {
  const raw = 'Here is the result:\n```json\n{"mealPlan":[{"day":1,"lunch":{"id":"r3","name":"Quinoa Salad"}}],"groceryList":[{"name":"quinoa","category":"grains"}]}\n```';
  const extracted = extractJsonString(raw);
  assert.strictEqual(extracted.startsWith('{'), true, 'extractJsonString should return a JSON string starting with an object delimiter');
  const parsed = JSON.parse(extracted);
  assert(Array.isArray(parsed.mealPlan), 'Parsed JSON should include mealPlan array');
  assert(Array.isArray(parsed.groceryList), 'Parsed JSON should include groceryList array');
}

function testExtractJsonStringFromTextWithExplanation() {
  const raw = 'Final answer: {"mealPlan":[{"day":1,"lunch":{"id":"r3","name":"Quinoa Salad"}}],"groceryList":[{"name":"quinoa","category":"grains"}]} Thanks!';
  const extracted = extractJsonString(raw);
  assert.strictEqual(extracted.startsWith('{'), true, 'extractJsonString should find JSON in explanatory text');
  const parsed = JSON.parse(extracted);
  assert.strictEqual(parsed.mealPlan[0].day, 1, 'Parsed JSON should preserve day value');
}

function runTests() {
  console.log('Running project tests...');
  testGetRecipesBreakfast();
  testFilterRecipesVegan();
  testCreateWeeklyPlanThreeMeals();
  testBuildShoppingListForFullPlan();
  testNoFalsePositiveEggLunch();
  testExactIngredientEggBreakfast();
  testExcludeIngredientExactMatch();
  testCreateWeeklyPlanMultiMealTypes();
  testCreateWeeklyPlanSelectedMealTypesPerDay();
  testNormalizeMealPlanGroupedByType();
  testNormalizeMealPlanGroupedByTypeObject();
  testValidateGroceryListObjectFormat();
  testInvalidMealPlanFailsValidation();
  testExtractJsonStringFromMarkdown();
  testExtractJsonStringFromTextWithExplanation();
  console.log('All tests passed successfully!');
}

runTests();
