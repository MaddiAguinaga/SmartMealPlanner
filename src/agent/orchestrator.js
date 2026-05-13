const client = require('./openaiClient');
const { toolDefinitions, toolMap } = require('./tools');
const { mealPlannerPromptTemplate } = require('./prompts');
const { getRecipes, filterRecipes } = require('../recipe/recipeModule');
const { buildShoppingList } = require('../skills/groceryAggregationSkill');

function buildUserContent(userInput) {
  const lines = [];
  if (userInput.tags && userInput.tags.length) {
    lines.push(`Preferred tags: ${userInput.tags.join(', ')}`);
  }
  if (userInput.dietaryRestrictions && userInput.dietaryRestrictions.length) {
    lines.push(`Dietary restrictions: ${userInput.dietaryRestrictions.join(', ')}`);
  }
  if (userInput.excludeIngredients && userInput.excludeIngredients.length) {
    lines.push(`Exclude ingredients: ${userInput.excludeIngredients.join(', ')}`);
  }
  if (userInput.mealType && userInput.mealType.length) {
    lines.push(`Meal type preference: ${Array.isArray(userInput.mealType) ? userInput.mealType.join(', ') : userInput.mealType}`);
  }
  if (typeof userInput.maxBudget === 'number') {
    lines.push(`Maximum budget per meal: $${userInput.maxBudget}`);
  }
  lines.push(`Number of days: ${userInput.days}`);
  lines.push('Answer with JSON containing mealPlan and groceryList.');
  return lines.join('\n');
}

function getAgentMessage(response) {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const choice = response.choices?.[0];
  if (choice) {
    if (choice.message) {
      return choice.message;
    }
    if (typeof choice.text === 'string') {
      return { content: choice.text };
    }
    if (typeof choice?.delta?.content === 'string') {
      return { content: choice.delta.content };
    }
    if (typeof choice?.delta?.text === 'string') {
      return { content: choice.delta.text };
    }
    if (Array.isArray(choice.content) && choice.content.length > 0) {
      const item = choice.content[0];
      if (item?.message) {
        return item.message;
      }
      if (typeof item.text === 'string') {
        return { content: item.text };
      }
      if (typeof item.content === 'string') {
        return { content: item.content };
      }
    }
  }

  const output = response.output || response.outputs;
  if (Array.isArray(output) && output.length > 0) {
    const firstOutput = output[0];
    const content = firstOutput?.content ?? firstOutput?.text ?? firstOutput;
    if (Array.isArray(content) && content.length > 0) {
      const item = content[0];
      if (item?.message) {
        return item.message;
      }
      if (typeof item.text === 'string') {
        return { content: item.text };
      }
      if (typeof item.content === 'string') {
        return { content: item.content };
      }
      if (typeof item === 'string') {
        return { content: item };
      }
    }
    if (typeof content === 'string') {
      return { content };
    }
  }

  if (typeof response.output === 'string') {
    return { content: response.output };
  }

  return null;
}

const stripCodeBlock = (text) => {
  if (typeof text !== 'string') {
    return text;
  }
  const match = text.match(/```(?:json|js|javascript)?\s*([\s\S]*?)\s*```/i);
  return match ? match[1].trim() : text;
};

const extractJsonString = (text) => {
  if (typeof text !== 'string') {
    return text;
  }
  const stripped = stripCodeBlock(text).trim();
  if (!stripped) {
    return text;
  }

  const firstJsonIndex = stripped.search(/[\{\[]/);
  if (firstJsonIndex === -1) {
    return stripped;
  }

  const openingChar = stripped[firstJsonIndex];
  const closingChar = openingChar === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstJsonIndex; index < stripped.length; index += 1) {
    const char = stripped[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === openingChar) {
      depth += 1;
    } else if (char === closingChar) {
      depth -= 1;
      if (depth === 0) {
        return stripped.slice(firstJsonIndex, index + 1);
      }
    }
  }

  const objectMatch = stripped.match(/(\{[\s\S]*\})/);
  if (objectMatch) {
    return objectMatch[1];
  }

  const arrayMatch = stripped.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    return arrayMatch[1];
  }

  return stripped;
};

const normalizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return [value.trim().toLowerCase()].filter(Boolean);
  }
  return [];
};

const cleanJsonText = (text) => {
  if (typeof text !== 'string') {
    return text;
  }
  return text
    .replace(/\u2018|\u2019|\u201C|\u201D/g, '"')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, (char) => (char === '\n' || char === '\r' || char === '\t' ? char : ' '))
    .replace(/,\s*([}\]])/g, '$1');
};

const tryParseJson = (text) => {
  const candidates = [
    text,
    extractJsonString(text),
    cleanJsonText(text),
    cleanJsonText(extractJsonString(text)),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // continue to next candidate
    }
  }
  return null;
};

const isMealPlanEntry = (entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return false;
  }
  const hasDay = typeof entry.day === 'number' || (typeof entry.day === 'string' && entry.day.trim().length > 0);
  const hasMeal = entry.recipe || entry.breakfast || entry.lunch || entry.dinner;
  return hasDay && Boolean(hasMeal);
};

const normalizeMealPlan = (mealPlan) => {
  if (Array.isArray(mealPlan)) {
    const isGroupedByMealType = mealPlan.every((item) => {
      return item && typeof item === 'object' && !Array.isArray(item)
        && Object.keys(item).some((key) => /^\d+$/.test(key))
        && typeof item.day === 'string' && !/^\d+$/.test(item.day);
    });

    if (isGroupedByMealType) {
      const daysMap = {};

      mealPlan.forEach((group) => {
        const mealType = String(group.day).toLowerCase();
        Object.keys(group).forEach((key) => {
          if (!/^\d+$/.test(key)) {
            return;
          }
          const entry = group[key];
          if (!entry || typeof entry !== 'object') {
            return;
          }
          const dayNumber = Number(entry.day) || Number(key) + 1;
          if (Number.isNaN(dayNumber)) {
            return;
          }
          if (!daysMap[dayNumber]) {
            daysMap[dayNumber] = { day: dayNumber };
          }
          daysMap[dayNumber][mealType] = entry.recipe || entry;
        });
      });

      return Object.values(daysMap).sort((a, b) => a.day - b.day);
    }

    return mealPlan;
  }

  if (mealPlan && typeof mealPlan === 'object') {
    const mealTypeKeys = Object.keys(mealPlan).filter((key) => Array.isArray(mealPlan[key]));
    const isGroupedByMealTypeObject = mealTypeKeys.length > 0 && mealTypeKeys.every((key) =>
      mealPlan[key].every((item) => item && typeof item === 'object' && 'day' in item)
    );

    const hasDayAndMealFields = typeof mealPlan.day !== 'undefined' &&
      ['recipe', 'breakfast', 'lunch', 'dinner'].some((key) => key in mealPlan);

    if (hasDayAndMealFields) {
      return [mealPlan];
    }

    if (isGroupedByMealTypeObject) {
      const daysMap = {};

      mealTypeKeys.forEach((mealType) => {
        mealPlan[mealType].forEach((entry) => {
          const dayNumber = Number(entry.day) || Number(String(entry.day).match(/\d+/)?.[0]);
          if (Number.isNaN(dayNumber)) {
            return;
          }
          if (!daysMap[dayNumber]) {
            daysMap[dayNumber] = { day: dayNumber };
          }
          daysMap[dayNumber][mealType.toLowerCase()] = entry.recipe || entry;
        });
      });

      return Object.values(daysMap).sort((a, b) => a.day - b.day);
    }

    return Object.entries(mealPlan)
      .map(([key, value]) => {
        const parsedDay = String(key).match(/\d+/)?.[0];
        return {
          day: parsedDay ? Number(parsedDay) : key,
          ...value,
        };
      })
      .sort((a, b) => {
        const dayA = typeof a.day === 'number' ? a.day : Number(String(a.day).match(/\d+/)?.[0] ?? a.day);
        const dayB = typeof b.day === 'number' ? b.day : Number(String(b.day).match(/\d+/)?.[0] ?? b.day);
        return Number(dayA) - Number(dayB) || String(a.day).localeCompare(String(b.day));
      });
  }
  return [];
};

const normalizeGroceryList = (groceryList) => {
  if (Array.isArray(groceryList)) {
    return groceryList;
  }
  if (groceryList && typeof groceryList === 'object') {
    return Object.entries(groceryList).map(([name, value]) => {
      if (typeof value === 'string') {
        return { name, category: value };
      }
      if (value && typeof value === 'object' && value.name) {
        return value;
      }
      return { name, category: 'other' };
    });
  }
  return [];
};

const validateMealPlan = (mealPlan) => {
  if (!mealPlan || (typeof mealPlan !== 'object' && !Array.isArray(mealPlan))) {
    return false;
  }
  if (Array.isArray(mealPlan)) {
    const seenDays = new Set();
    if (mealPlan.length === 0) {
      return false;
    }
    return mealPlan.every((entry) => {
      if (!isMealPlanEntry(entry)) {
        return false;
      }
      const dayKey = String(entry.day).trim();
      if (!/^[1-9]\d*$/.test(dayKey)) {
        return false;
      }
      if (seenDays.has(dayKey)) {
        return false;
      }
      seenDays.add(dayKey);
      return true;
    });
  }
  return Object.values(mealPlan).every((value) => isMealPlanEntry(value));
};

const validateGroceryList = (groceryList) => {
  if (!groceryList || (typeof groceryList !== 'object' && !Array.isArray(groceryList))) {
    return false;
  }
  const list = normalizeGroceryList(groceryList);
  if (!Array.isArray(list) || list.length === 0) {
    return false;
  }
  const seen = new Set();
  return list.every((item) => {
    if (!item || typeof item !== 'object' || !item.name || typeof item.name !== 'string') {
      return false;
    }
    const name = item.name.trim().toLowerCase();
    if (!name || seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
};

async function runMealPlannerAgent(userInput) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required for the agent integration.');
  }

  const messages = [
    {
      role: 'system',
      content: mealPlannerPromptTemplate(userInput),
    },
    {
      role: 'user',
      content: buildUserContent(userInput),
    },
  ];

  const maxRounds = 10;
  let lastResponse = null;
  const toolResults = [];

  const normalizeModel = (value) => {
    let modelName = String(value || '').trim();
    if (!modelName) {
      return 'openai/gpt-4o-mini';
    }
    if (modelName.startsWith('openrouter-')) {
      modelName = modelName.replace(/^openrouter-/, '');
    }
    if (!modelName.includes('/') && /^gpt/i.test(modelName)) {
      return `openai/${modelName}`;
    }
    return modelName;
  };

  const findRecipeByIdOrName = (recipes, recipe) => {
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
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
    if (Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 && recipe.id) {
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

  const repairMealPlanCompliance = (mealPlan, tags, dietaryRestrictions, excludeIngredients) => {
    const normalizedTags = normalizeStringArray(tags);
    const normalizedDietary = normalizeStringArray(dietaryRestrictions);
    const normalizedExcludes = normalizeStringArray(excludeIngredients);

    return mealPlan.map((dayPlan, index) => {
      if (!dayPlan || typeof dayPlan !== 'object') {
        return dayPlan;
      }
      const repaired = { ...dayPlan };
      const slots = ['breakfast', 'lunch', 'dinner', 'recipe'];

      slots.forEach((slot) => {
        const recipe = repaired[slot];
        if (!recipe || typeof recipe !== 'object') {
          return;
        }

        const recipeDiet = Array.isArray(recipe.dietary)
          ? recipe.dietary.map((item) => String(item).toLowerCase())
          : [];
        const recipeIngredients = Array.isArray(recipe.ingredients)
          ? recipe.ingredients.map((ingredient) => (typeof ingredient === 'string' ? ingredient.toLowerCase() : ingredient.name.toLowerCase()))
          : [];

        const violatesDiet = normalizedDietary.some((restriction) => !recipeDiet.includes(restriction));
        const violatesExclude = normalizedExcludes.some((excludedIngredient) =>
          recipeIngredients.some((ingredientName) =>
            ingredientName.includes(excludedIngredient) || excludedIngredient.includes(ingredientName)
          )
        );

        if (!violatesDiet && !violatesExclude) {
          return;
        }

        const mealType = recipe.mealType || slot;
        const candidates = filterRecipes(
          getRecipes({ mealType, tags: normalizedTags }),
          { dietaryRestrictions: normalizedDietary, excludeIngredients: normalizedExcludes }
        );

        if (candidates.length > 0) {
          repaired[slot] = candidates[index % candidates.length];
        }
      });

      return repaired;
    });
  };

  const repairMealPlanBudget = (mealPlan, tags, maxBudget, dietaryRestrictions, excludeIngredients) => {
    if (typeof maxBudget !== 'number' || Number.isNaN(maxBudget)) {
      return mealPlan;
    }

    const normalizedTags = normalizeStringArray(tags);
    const normalizedDietary = normalizeStringArray(dietaryRestrictions);
    const normalizedExcludes = normalizeStringArray(excludeIngredients);

    return mealPlan.map((dayPlan, index) => {
      if (!dayPlan || typeof dayPlan !== 'object') {
        return dayPlan;
      }
      const repaired = { ...dayPlan };
      const slots = ['breakfast', 'lunch', 'dinner', 'recipe'];

      slots.forEach((slot) => {
        const recipe = repaired[slot];
        if (!recipe || typeof recipe !== 'object' || typeof recipe.estimatedCost !== 'number') {
          return;
        }

        if (recipe.estimatedCost <= maxBudget) {
          return;
        }

        const mealType = recipe.mealType || slot;
        const candidates = filterRecipes(
          getRecipes({ mealType, tags: normalizedTags }),
          { dietaryRestrictions: normalizedDietary, excludeIngredients: normalizedExcludes, maxBudget }
        );

        if (candidates.length > 0) {
          repaired[slot] = candidates[index % candidates.length];
        } else {
          throw new Error(`No ${mealType} recipes matched the requested budget and filters. Try increasing your budget or broadening your filters.`);
        }
      });

      return repaired;
    });
  };

  const normalizeAgentResult = (result, userInput = {}) => {
    if (!result || typeof result !== 'object') {
      return result;
    }
    const normalized = { ...result };
    if ('mealPlan' in normalized) {
      normalized.mealPlan = normalizeMealPlan(normalized.mealPlan);
      if (!validateMealPlan(normalized.mealPlan)) {
        throw new Error('Meal plan validation failed after normalization.');
      }
      normalized.mealPlan = enrichMealPlanRecipes(normalized.mealPlan, getRecipes({}));
      if (Array.isArray(normalized.mealPlan)) {
        let repaired = normalized.mealPlan;

        if (userInput.dietaryRestrictions || userInput.excludeIngredients) {
          repaired = repairMealPlanCompliance(
            repaired,
            userInput.tags,
            userInput.dietaryRestrictions,
            userInput.excludeIngredients
          );
        }

        if (typeof userInput.maxBudget === 'number' && !Number.isNaN(userInput.maxBudget)) {
          repaired = repairMealPlanBudget(
            repaired,
            userInput.tags,
            userInput.maxBudget,
            userInput.dietaryRestrictions,
            userInput.excludeIngredients
          );
        }

        if (JSON.stringify(repaired) !== JSON.stringify(normalized.mealPlan)) {
          normalized.mealPlan = repaired;
          normalized.groceryList = buildShoppingList(normalized.mealPlan);
        }
      }
    }
    if ('groceryList' in normalized) {
      normalized.groceryList = normalizeGroceryList(normalized.groceryList);
      if (!validateGroceryList(normalized.groceryList)) {
        throw new Error('Grocery list validation failed after normalization.');
      }
    }
    return normalized;
  };

  for (let round = 0; round < maxRounds; round += 1) {
    const model = normalizeModel(process.env.OPENAI_MODEL || 'openai/gpt-4o-mini');
    const response = await client.chat.completions.create({
      model,
      messages,
      tools: toolDefinitions,
      tool_choice: 'auto',
    });

    const message = getAgentMessage(response);
    if (!message) {
      console.error('Unexpected agent response:', JSON.stringify(response, null, 2));
      throw new Error('Unexpected agent response format.');
    }

    const toolCalls = [];
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      toolCalls.push(...message.tool_calls);
    } else if (message.function_call) {
      toolCalls.push(message.function_call);
    }

    if (toolCalls.length > 0) {
      messages.push(message);

      for (const toolCall of toolCalls) {
        const toolName = toolCall.name || toolCall.function?.name;
        const rawArguments = toolCall.arguments || toolCall.function?.arguments || '{}';
        let toolArguments = {};

        try {
          toolArguments = JSON.parse(rawArguments);
        } catch (error) {
          throw new Error(`Unable to parse tool arguments for ${toolName}: ${error.message}`);
        }

        if (toolName === 'filter_recipes' && !Array.isArray(toolArguments.recipes)) {
          const previousRecipes = toolResults
            .filter((item) => item.name === 'get_recipes' && Array.isArray(item.result))
            .flatMap((item) => item.result);
          toolArguments.recipes = previousRecipes.length ? previousRecipes : (Array.isArray(lastResponse) ? lastResponse : []);
        }

        if (toolName === 'build_meal_plan' && !Array.isArray(toolArguments.recipes)) {
          const previousRecipes = toolResults
            .filter((item) => ['filter_recipes', 'get_recipes'].includes(item.name) && Array.isArray(item.result))
            .flatMap((item) => item.result);
          toolArguments.recipes = previousRecipes.length ? previousRecipes : (Array.isArray(lastResponse) ? lastResponse : []);

          if (!Array.isArray(toolArguments.recipes) || toolArguments.recipes.length === 0) {
            const selectedMealType = toolArguments.selectedMealType;
            const mealTypes = Array.isArray(selectedMealType)
              ? selectedMealType
              : selectedMealType
                ? [selectedMealType]
                : [];

            if (mealTypes.length > 0) {
              const selectedRecipes = mealTypes.flatMap((mealType) => getRecipes({ mealType }));
              if (selectedRecipes.length > 0) {
                toolArguments.recipes = selectedRecipes;
              }
            }
          }

          if (!Array.isArray(toolArguments.recipes) || toolArguments.recipes.length === 0) {
            toolArguments.recipes = getRecipes({});
          }

          const recipeMealTypes = Array.from(new Set(
            (toolArguments.recipes || [])
              .map((recipe) => (recipe && typeof recipe.mealType === 'string' ? recipe.mealType.toLowerCase() : null))
              .filter(Boolean)
          ));
          if (recipeMealTypes.length === 1) {
            toolArguments.selectedMealType = recipeMealTypes[0];
          }
        }

        if (toolName === 'extract_ingredients' && !Array.isArray(toolArguments.mealPlan)) {
          toolArguments.mealPlan = Array.isArray(lastResponse) ? lastResponse : [];
        }

        const result = await toolMap[toolName](toolArguments);
        toolResults.push({ name: toolName, result });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(result),
        });
        lastResponse = result;
      }

      continue;
    }

    if (message.content) {
      let content = message.content;
      if (Array.isArray(content)) {
        content = content.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('');
      }
      if (typeof content === 'string') {
        const parsed = tryParseJson(content.trim());
        if (parsed !== null) {
          return normalizeAgentResult(parsed, userInput);
        }
        const extracted = extractJsonString(content.trim());
        console.error('Invalid JSON content from agent:', content.trim());
        console.error('Extracted JSON candidate:', extracted);
        throw new Error('The OpenAI agent did not return valid JSON in the final response.');
      }
      if (typeof content === 'object' && content !== null) {
        return normalizeAgentResult(content);
      }
    }

    throw new Error('Unexpected agent response format.');
  }

  throw new Error('The agent did not produce a final result after using tools.');
}

module.exports = {
  runMealPlannerAgent,
  extractJsonString,
  normalizeMealPlan,
  validateMealPlan,
  normalizeGroceryList,
  validateGroceryList,
};
