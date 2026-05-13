function buildShoppingList(mealPlan) {
  const ingredientMap = new Map();

  mealPlan.forEach((dayPlan) => {
    const addIngredients = (recipe) => {
      if (!recipe || !Array.isArray(recipe.ingredients)) {
        return;
      }
      recipe.ingredients.forEach((ingredient) => {
        if (typeof ingredient === 'string') {
          ingredientMap.set(ingredient, 'other');
        } else if (ingredient && ingredient.name) {
          ingredientMap.set(ingredient.name, ingredient.category || 'other');
        }
      });
    };

    if (dayPlan?.recipe) {
      addIngredients(dayPlan.recipe);
      return;
    }

    addIngredients(dayPlan.breakfast);
    addIngredients(dayPlan.lunch);
    addIngredients(dayPlan.dinner);
  });

  return Array.from(ingredientMap, ([name, category]) => ({ name, category })).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  buildShoppingList,
};
