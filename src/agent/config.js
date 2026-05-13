const config = {
  agentName: 'MealPlannerAgent',
  tools: [
    'get_recipes',
    'filter_recipes',
    'build_meal_plan',
    'extract_ingredients',
  ],
  defaultDays: 5,
};

module.exports = config;
