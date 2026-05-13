const fs = require('fs');
const path = require('path');

const RECIPES_PATH = path.join(__dirname, '..', '..', 'data', 'recipes.json');

function loadRecipes() {
  const raw = fs.readFileSync(RECIPES_PATH, 'utf8');
  return JSON.parse(raw);
}

function normalizeTerm(value) {
  return String(value).trim().toLowerCase();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return [value.trim()].filter(Boolean);
  }
  return [];
}


function isPhraseMatch(text, term) {
  const normalizedText = String(text).toLowerCase();
  const normalizedTerm = normalizeTerm(term);
  if (!normalizedTerm) {
    return false;
  }

  if (/[^a-z0-9 ]/.test(normalizedTerm)) {
    return normalizedText.includes(normalizedTerm);
  }

  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}(?:s|es|ies)?\\b`, 'i');
  return regex.test(normalizedText);
}

/**
 * Retrieve recipes from the local database based on user preferences.
 *
 * @param {Object} options
 * @param {string[]} [options.tags] - Desired recipe tags or cuisine types.
 * @param {string} [options.mealType] - Desired meal type, e.g. breakfast, lunch, dinner.
 * @param {string[]} [options.keywords] - Additional search keywords.
 * @returns {Object[]} Filtered candidate recipes.
 */
function getRecipes(options = {}) {
  const recipes = loadRecipes();
  const { tags = [], mealType, keywords = [] } = options;

  const normalizedTags = normalizeStringArray(tags);
  const normalizedKeywords = normalizeStringArray(keywords);
  const buildSearchTerms = (values) => [...new Set(values.map((value) => normalizeTerm(value)).filter(Boolean))];
  const searchTerms = buildSearchTerms([...normalizedTags, ...normalizedKeywords]);

  return recipes.filter((recipe) => {
    const normalizedTags = recipe.tags.map((tag) => tag.toLowerCase());
    const matchesMealType = mealType
      ? recipe.mealType.toLowerCase() === mealType.toLowerCase()
      : true;

    const recipeIngredients = recipe.ingredients.map((ingredient) =>
      typeof ingredient === 'string' ? ingredient.toLowerCase() : ingredient.name.toLowerCase()
    );

    const matchesSearch = searchTerms.length
      ? searchTerms.some((term) => {
          return (
            normalizedTags.includes(term) ||
            isPhraseMatch(recipe.name, term) ||
            isPhraseMatch(recipe.description, term) ||
            recipeIngredients.some((ingredientName) => isPhraseMatch(ingredientName, term))
          );
        })
      : true;

    return matchesMealType && matchesSearch;
  });
}

/**
 * Filter a set of recipes using dietary and budget constraints.
 *
 * @param {Object[]} recipes
 * @param {Object} constraints
 * @param {string[]} [constraints.dietaryRestrictions]
 * @param {string[]} [constraints.excludeIngredients]
 * @param {number} [constraints.maxBudget]
 * @returns {Object[]} Filtered recipes that satisfy the constraints.
 */
function filterRecipes(recipes, constraints = {}) {
  const {
    dietaryRestrictions = [],
    excludeIngredients = [],
    maxBudget,
  } = constraints;

  const normalizedDietaryRestrictions = normalizeStringArray(dietaryRestrictions);
  const normalizedExcludeIngredients = normalizeStringArray(excludeIngredients);
  const excluded = normalizedExcludeIngredients.map((item) => item.toLowerCase());

  return recipes.filter((recipe) => {
    const recipeIngredients = recipe.ingredients.map((ingredient) =>
      typeof ingredient === 'string' ? ingredient.toLowerCase() : ingredient.name.toLowerCase()
    );
    const recipeDietary = recipe.dietary.map((item) => item.toLowerCase());

    const violatesExcludedIngredient = excluded.some((excludedIngredient) =>
      recipeIngredients.some((recipeIngredient) =>
        isPhraseMatch(recipeIngredient, excludedIngredient) || isPhraseMatch(excludedIngredient, recipeIngredient)
      )
    );
    if (violatesExcludedIngredient) {
      return false;
    }

    const violatesDiet = normalizedDietaryRestrictions.some((restriction) => {
      const normalized = restriction.toLowerCase();
      return !recipeDietary.includes(normalized);
    });
    if (violatesDiet) {
      return false;
    }

    if (typeof maxBudget === 'number' && recipe.estimatedCost > maxBudget) {
      return false;
    }

    return true;
  });
}

module.exports = {
  getRecipes,
  filterRecipes,
};
