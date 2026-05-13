const express = require('express');
const { getRecipes, filterRecipes } = require('../recipe/recipeModule');
const { createWeeklyPlan } = require('../skills/mealPlanningSkill');
const { buildShoppingList } = require('../skills/groceryAggregationSkill');
const { runMealPlannerAgent } = require('../agent/orchestrator');

const router = express.Router();

const normalizeArray = (input) => {
  if (Array.isArray(input)) {
    return input.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(',').map((value) => value.trim()).filter(Boolean);
  }
  return [];
};

const findRecipeByIdOrName = (recipes, recipe) => {
  if (!recipe || typeof recipe !== 'object') {
    return null;
  }

  if (recipe.id) {
    const exactMatch = recipes.find((item) => String(item.id).toLowerCase() === String(recipe.id).toLowerCase());
    if (exactMatch) {
      return exactMatch;
    }
  }

  if (recipe.name) {
    const normalizedTarget = String(recipe.name).trim().toLowerCase();
    const exactMatch = recipes.find((item) => String(item.name).trim().toLowerCase() === normalizedTarget);
    if (exactMatch) {
      return exactMatch;
    }
    return recipes.find((item) => String(item.name).trim().toLowerCase().includes(normalizedTarget));
  }

  return null;
};

const enrichRecipe = (recipe, recipes) => {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
    return recipe;
  }
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
    return recipe;
  }

  const matched = findRecipeByIdOrName(recipes, recipe);
  return matched || recipe;
};

const enrichMealPlanRecipes = (mealPlan, recipes) => {
  if (!Array.isArray(mealPlan)) {
    return mealPlan;
  }

  return mealPlan.map((dayPlan) => {
    if (!dayPlan || typeof dayPlan !== 'object') {
      return dayPlan;
    }

    const enriched = { ...dayPlan };

    if (dayPlan.recipe) {
      enriched.recipe = enrichRecipe(dayPlan.recipe, recipes);
    }
    if (dayPlan.breakfast) {
      enriched.breakfast = enrichRecipe(dayPlan.breakfast, recipes);
    }
    if (dayPlan.lunch) {
      enriched.lunch = enrichRecipe(dayPlan.lunch, recipes);
    }
    if (dayPlan.dinner) {
      enriched.dinner = enrichRecipe(dayPlan.dinner, recipes);
    }

    return enriched;
  });
};

const buildFilters = (mealCriteria, normalizedDietaryRestrictions, normalizedExcludeIngredients, normalizedMaxBudget) => {
  const dietary = [...normalizedDietaryRestrictions, ...(mealCriteria.dietaryRestrictions || [])];
  const excluded = [...normalizedExcludeIngredients, ...(mealCriteria.excludeIngredients || [])];

  return {
    dietaryRestrictions: dietary,
    excludeIngredients: excluded,
    maxBudget: normalizedMaxBudget,
  };
};

const buildReplacementFilters = (mealCriteria, normalizedDietaryRestrictions, normalizedExcludeIngredients, normalizedMaxBudget) => {
  const hasOverrideCriteria = (
    Array.isArray(mealCriteria.tags) && mealCriteria.tags.length > 0
  ) || (
    Array.isArray(mealCriteria.dietaryRestrictions) && mealCriteria.dietaryRestrictions.length > 0
  ) || (
    Array.isArray(mealCriteria.excludeIngredients) && mealCriteria.excludeIngredients.length > 0
  );

  if (hasOverrideCriteria) {
    return {
      dietaryRestrictions: mealCriteria.dietaryRestrictions || [],
      excludeIngredients: mealCriteria.excludeIngredients || [],
      maxBudget: normalizedMaxBudget,
    };
  }

  return buildFilters(mealCriteria, normalizedDietaryRestrictions, normalizedExcludeIngredients, normalizedMaxBudget);
};

router.post('/', async (req, res) => {
  try {
    const {
      tags,
      dietaryRestrictions,
      excludeIngredients,
      mealType,
      maxBudget,
      days,
    } = req.body;

    if (typeof days !== 'number' || Number.isNaN(days) || !Number.isInteger(days) || days < 1 || days > 7) {
      return res.status(400).json({ error: 'The number of days must be an integer between 1 and 7.' });
    }

    const normalizedTags = normalizeArray(tags);
    const normalizedDietaryRestrictions = normalizeArray(dietaryRestrictions);
    const normalizedExcludeIngredients = normalizeArray(excludeIngredients);
    const normalizedMaxBudget = typeof maxBudget === 'number' && !Number.isNaN(maxBudget) && maxBudget > 0
      ? maxBudget
      : undefined;

    const allowedMealTypes = new Set(['breakfast', 'lunch', 'dinner']);
    const normalizedMealTypes = normalizeArray(mealType).map((value) => value.toLowerCase()).filter((value) => allowedMealTypes.has(value));
    const selectedMealType = normalizedMealTypes.length === 1 ? normalizedMealTypes[0] : normalizedMealTypes;

    if (mealType && normalizedMealTypes.length === 0) {
      return res.status(400).json({ error: 'Meal type must include breakfast, lunch, dinner, or be left blank.' });
    }

    const filters = {
      dietaryRestrictions: normalizedDietaryRestrictions,
      excludeIngredients: normalizedExcludeIngredients,
      maxBudget: normalizedMaxBudget,
    };

    const hasSearchConstraints = normalizedTags.length > 0 || normalizedDietaryRestrictions.length > 0;
    if (hasSearchConstraints) {
      const tagDietCandidateRecipes = filterRecipes(
        getRecipes({
          tags: normalizedTags,
          mealType: Array.isArray(selectedMealType) ? undefined : selectedMealType,
        }),
        filters,
      );
      if (!tagDietCandidateRecipes.length) {
        const message = normalizedTags.length > 0 && normalizedDietaryRestrictions.length > 0
          ? 'No recipes matched the requested tags, dietary restrictions, and filters. Try broadening your tags or dietary restrictions, or increasing your budget.'
          : normalizedTags.length > 0
            ? 'No recipes matched the requested tags and filters. Try broadening your tags or increasing your budget.'
            : 'No recipes matched the requested dietary restrictions and filters. Try broadening your dietary restrictions or increasing your budget.';
        return res.status(404).json({ error: message });
      }
    }

    const selectedMealTypesArray = Array.isArray(selectedMealType)
      ? selectedMealType
      : selectedMealType
        ? [selectedMealType]
        : [];

    const formatMissingMealTypes = (types) => {
      if (types.length === 1) {
        return types[0];
      }
      if (types.length === 2) {
        return `${types[0]} and ${types[1]}`;
      }
      return `${types.slice(0, -1).join(', ')}, and ${types[types.length - 1]}`;
    };

    const missingMealTypes = selectedMealTypesArray.length > 0
      ? selectedMealTypesArray.filter((mealTypeOption) => filterRecipes(getRecipes({ mealType: mealTypeOption, tags: normalizedTags }), filters).length === 0)
      : ['breakfast', 'lunch', 'dinner'].filter((mealTypeOption) => filterRecipes(getRecipes({ mealType: mealTypeOption, tags: normalizedTags }), filters).length === 0);

    if (missingMealTypes.length > 0) {
      return res.status(404).json({
        error: `No ${formatMissingMealTypes(missingMealTypes)} recipes matched the requested criteria. Try broadening your filters or increasing your budget.`,
      });
    }

    const globalFilters = {
      dietaryRestrictions: normalizedDietaryRestrictions,
      excludeIngredients: normalizedExcludeIngredients,
      maxBudget: normalizedMaxBudget,
    };

    const agentPayload = {
      tags: normalizedTags,
      dietaryRestrictions: normalizedDietaryRestrictions,
      excludeIngredients: normalizedExcludeIngredients,
      mealType: selectedMealType.length === 1 ? selectedMealType[0] : selectedMealType,
      maxBudget: normalizedMaxBudget,
      days,
    };

    const result = await runMealPlannerAgent(agentPayload);
    if (!result || !Array.isArray(result.mealPlan) || !Array.isArray(result.groceryList)) {
      return res.status(500).json({ error: 'Agent failed to produce a valid meal plan response.' });
    }

    return res.json(result);
  } catch (error) {
    console.error('Meal plan error:', error);
    return res.status(500).json({ error: error.message || 'Unable to generate the meal plan.' });
  }
});

router.post('/replace', async (req, res) => {
  try {
    const {
      tags,
      dietaryRestrictions,
      excludeIngredients,
      overrideTags,
      overrideDietaryRestrictions,
      overrideExcludeIngredients,
      mealType,
      maxBudget,
      excludeRecipeIds = [],
    } = req.body;

    const allowedMealTypes = new Set(['breakfast', 'lunch', 'dinner']);
    const normalizedMealType = typeof mealType === 'string' && mealType.trim()
      ? mealType.trim().toLowerCase()
      : undefined;

    if (!normalizedMealType || !allowedMealTypes.has(normalizedMealType)) {
      return res.status(400).json({ error: 'Meal type is required and must be breakfast, lunch, or dinner.' });
    }

    const normalizedTags = normalizeArray(tags);
    const normalizedDietaryRestrictions = normalizeArray(dietaryRestrictions);
    const normalizedExcludeIngredients = normalizeArray(excludeIngredients);
    const normalizedOverrideTags = normalizeArray(overrideTags);
    const normalizedOverrideDietary = normalizeArray(overrideDietaryRestrictions);
    const normalizedOverrideExclude = normalizeArray(overrideExcludeIngredients);
    const normalizedMaxBudget = typeof maxBudget === 'number' && !Number.isNaN(maxBudget) && maxBudget > 0
      ? maxBudget
      : undefined;

    const mealCriteria = {
      tags: normalizedOverrideTags,
      dietaryRestrictions: normalizedOverrideDietary,
      excludeIngredients: normalizedOverrideExclude,
    };

    const filters = buildReplacementFilters(mealCriteria, normalizedDietaryRestrictions, normalizedExcludeIngredients, normalizedMaxBudget);

    const candidateKeywords = [...normalizedTags, ...normalizedOverrideTags];
    const candidates = filterRecipes(getRecipes({ tags: candidateKeywords, keywords: candidateKeywords, mealType: normalizedMealType }), filters)
      .filter((recipe) => !excludeRecipeIds.includes(recipe.id));

    if (!candidates.length) {
      return res.status(404).json({ error: `No replacement recipe matched the requested criteria for ${normalizedMealType}. Try changing your per-meal preferences or broadening the filters.` });
    }

    const replacement = candidates[Math.floor(Math.random() * candidates.length)];
    return res.json({ recipe: replacement });
  } catch (error) {
    console.error('Recipe replacement error:', error);
    return res.status(500).json({ error: error.message || 'Unable to find replacement recipe.' });
  }
});

module.exports = router;
