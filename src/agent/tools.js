const { getRecipes, filterRecipes } = require('../recipe/recipeModule');
const { createWeeklyPlan } = require('../skills/mealPlanningSkill');
const { buildShoppingList } = require('../skills/groceryAggregationSkill');

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_recipes',
      description: 'Retrieve candidate recipes based on user preferences and tags.',
      parameters: {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Preferred cuisine types or tags for recipes.',
          },
          mealType: {
            type: 'string',
            description: 'Preferred meal type such as breakfast, lunch, or dinner.',
          },
          keywords: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional keywords to search recipe names and descriptions.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'filter_recipes',
      description: 'Filter a list of recipes by dietary restrictions, excluded ingredients, and budget.',
      parameters: {
        type: 'object',
        properties: {
          recipes: {
            type: 'array',
            items: { type: 'object' },
            description: 'Candidate recipes to filter.',
          },
          constraints: {
            type: 'object',
            properties: {
              dietaryRestrictions: {
                type: 'array',
                items: { type: 'string' },
              },
              excludeIngredients: {
                type: 'array',
                items: { type: 'string' },
              },
              maxBudget: {
                type: 'number',
              },
            },
            required: [],
          },
        },
        required: ['recipes', 'constraints'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'build_meal_plan',
      description: 'Build a meal plan from filtered recipes for the requested number of days.',
      parameters: {
        type: 'object',
        properties: {
          recipes: {
            type: 'array',
            items: { type: 'object' },
          },
          days: {
            type: 'number',
          },
          selectedMealType: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
            description: 'Optional meal type or list of meal types to include in the plan.',
          },
        },
        required: ['recipes', 'days'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_ingredients',
      description: 'Generate a grocery list from the final meal plan recipes.',
      parameters: {
        type: 'object',
        properties: {
          mealPlan: {
            type: 'array',
            items: { type: 'object' },
          },
        },
        required: ['mealPlan'],
      },
    },
  },
];

const toolMap = {
  get_recipes: async (options) => getRecipes(options),
  filter_recipes: async ({ recipes, constraints }) => filterRecipes(recipes, constraints),
  build_meal_plan: async ({ recipes, days, selectedMealType }) => createWeeklyPlan(recipes, days, selectedMealType),
  extract_ingredients: async ({ mealPlan }) => buildShoppingList(mealPlan),
};

module.exports = {
  toolDefinitions,
  toolMap,
};
