function createWeeklyPlan(recipeGroups, days, selectedMealType) {
  if (!recipeGroups || !days || days <= 0) {
    return [];
  }

  const normalize = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
  const selectedMealTypes = Array.isArray(selectedMealType)
    ? selectedMealType.map((value) => normalize(value)).filter(Boolean)
    : selectedMealType
      ? [normalize(selectedMealType)]
      : [];

  const buildMissingMessage = (missingTypes) => {
    const formatted = missingTypes.map((value) => value.toLowerCase()).join(' and ');
    return `No ${formatted} recipes matched the requested criteria. Try broadening your filters or increasing your budget.`;
  };

  const ensureMealTypesAvailable = (meals, requiredTypes) => {
    const missingTypes = requiredTypes.filter((mealType) => !Array.isArray(meals[mealType]) || meals[mealType].length === 0);
    if (missingTypes.length > 0) {
      throw new Error(buildMissingMessage(missingTypes));
    }
  };

  if (Array.isArray(recipeGroups)) {
    const recipes = recipeGroups;
    if (recipes.length === 0) {
      return [];
    }

    if (selectedMealTypes.length === 1) {
      const filteredRecipes = recipes.filter((recipe) => normalize(recipe.mealType) === selectedMealTypes[0]);
      if (filteredRecipes.length === 0) {
        throw new Error(buildMissingMessage(selectedMealTypes));
      }
      return Array.from({ length: days }, (_, idx) => ({
        day: idx + 1,
        mealType: selectedMealTypes[0],
        recipe: filteredRecipes[idx % filteredRecipes.length],
      }));
    }

    if (selectedMealTypes.length > 1) {
      const recipesByType = selectedMealTypes.reduce((acc, mealType) => {
        const list = recipes.filter((recipe) => normalize(recipe.mealType) === mealType);
        acc[mealType] = list;
        return acc;
      }, {});

      ensureMealTypesAvailable(recipesByType, selectedMealTypes);

      return Array.from({ length: days }, (_, idx) => {
        const dayPlan = { day: idx + 1 };
        selectedMealTypes.forEach((mealType) => {
          const list = recipesByType[mealType];
          dayPlan[mealType] = list[idx % list.length];
        });
        return dayPlan;
      });
    }

    const breakfastRecipes = recipes.filter((recipe) => normalize(recipe.mealType) === 'breakfast');
    const lunchRecipes = recipes.filter((recipe) => normalize(recipe.mealType) === 'lunch');
    const dinnerRecipes = recipes.filter((recipe) => normalize(recipe.mealType) === 'dinner');

    ensureMealTypesAvailable({ breakfast: breakfastRecipes, lunch: lunchRecipes, dinner: dinnerRecipes }, ['breakfast', 'lunch', 'dinner']);

    return Array.from({ length: days }, (_, idx) => ({
      day: idx + 1,
      breakfast: breakfastRecipes[idx % breakfastRecipes.length],
      lunch: lunchRecipes[idx % lunchRecipes.length],
      dinner: dinnerRecipes[idx % dinnerRecipes.length],
    }));
  }

  const breakfastRecipes = Array.isArray(recipeGroups.breakfast) ? recipeGroups.breakfast : [];
  const lunchRecipes = Array.isArray(recipeGroups.lunch) ? recipeGroups.lunch : [];
  const dinnerRecipes = Array.isArray(recipeGroups.dinner) ? recipeGroups.dinner : [];

  if (selectedMealTypes.length === 1) {
    const ordered = {
      breakfast: breakfastRecipes,
      lunch: lunchRecipes,
      dinner: dinnerRecipes,
    };
    const selectedRecipes = ordered[selectedMealTypes[0]] || [];
    if (!selectedRecipes.length) {
      throw new Error(buildMissingMessage(selectedMealTypes));
    }
    return Array.from({ length: days }, (_, idx) => ({
      day: idx + 1,
      mealType: selectedMealTypes[0],
      recipe: selectedRecipes[idx % selectedRecipes.length],
    }));
  }

  if (selectedMealTypes.length > 1) {
    const ordered = {
      breakfast: breakfastRecipes,
      lunch: lunchRecipes,
      dinner: dinnerRecipes,
    };

    ensureMealTypesAvailable(ordered, selectedMealTypes);

    return Array.from({ length: days }, (_, idx) => {
      const dayPlan = { day: idx + 1 };
      selectedMealTypes.forEach((mealType) => {
        const recipes = ordered[mealType];
        dayPlan[mealType] = recipes[idx % recipes.length];
      });
      return dayPlan;
    });
  }

  ensureMealTypesAvailable({ breakfast: breakfastRecipes, lunch: lunchRecipes, dinner: dinnerRecipes }, ['breakfast', 'lunch', 'dinner']);

  return Array.from({ length: days }, (_, idx) => ({
    day: idx + 1,
    breakfast: breakfastRecipes[idx % breakfastRecipes.length],
    lunch: lunchRecipes[idx % lunchRecipes.length],
    dinner: dinnerRecipes[idx % dinnerRecipes.length],
  }));
}

module.exports = {
  createWeeklyPlan,
};
