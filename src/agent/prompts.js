function mealPlannerPromptTemplate(userInput) {
  const preferenceLines = [];
  if (userInput.tags && userInput.tags.length) {
    preferenceLines.push(`Preferred tags: ${userInput.tags.join(', ')}`);
  }
  if (userInput.dietaryRestrictions && userInput.dietaryRestrictions.length) {
    preferenceLines.push(`Dietary restrictions: ${userInput.dietaryRestrictions.join(', ')}`);
  }
  if (userInput.excludeIngredients && userInput.excludeIngredients.length) {
    preferenceLines.push(`Exclude ingredients: ${userInput.excludeIngredients.join(', ')}`);
  }
  if (typeof userInput.maxBudget === 'number') {
    preferenceLines.push(`Maximum budget per meal: $${userInput.maxBudget}`);
  }
  if (userInput.mealType && userInput.mealType.length) {
    preferenceLines.push(`Meal type preference: ${Array.isArray(userInput.mealType) ? userInput.mealType.join(', ') : userInput.mealType}`);
  }
  preferenceLines.push(`Number of days: ${userInput.days}`);

  const mealTypeInstruction = Array.isArray(userInput.mealType)
    ? userInput.mealType.length === 1
      ? `Build a meal plan only for ${userInput.mealType[0]}.`
      : `Build a meal plan for the selected meal types: ${userInput.mealType.join(', ')}.`
    : userInput.mealType
      ? `Build a meal plan only for ${userInput.mealType}.`
      : 'Build a weekly meal plan with breakfast, lunch, and dinner for each day.';

  return `You are an AI meal planning assistant. ${preferenceLines.join(' ')} Use the available tools to select recipes, apply dietary and budget restrictions, and respect any ingredient preferences the user requests. If no recipe matches, explain that no match exists instead of inventing one. ${mealTypeInstruction} Do not invent recipes outside the provided database. Answer in English. Return the final result as valid JSON only, with keys "mealPlan" and "groceryList" and no surrounding markdown or explanation.`;
}

module.exports = {
  mealPlannerPromptTemplate,
};
