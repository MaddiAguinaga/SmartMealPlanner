# Smart Meal Planner

## Overview

Smart Meal Planner is a minimal AI-powered application that generates structured meal plans based on user preferences and constraints. The system demonstrates how agent-based architectures and tool calling can be used to solve a practical planning problem.

The application takes user input such as dietary preferences, restrictions, budget, and planning duration, and produces:
- A weekly meal plan
- A grocery list based on selected meals
- A simple calendar-style visualization of the plan

---

## Author

My name is Maddi. This project was created as a small course assignment to demonstrate the use of AI agents, tool calling, and skills in a practical application.

## Features

- A local recipe database stored as JSON to keep the project simple and reliable.
- A simple interface for entering meal preferences, dietary restrictions, budget, and the number of days to plan.
- An agent-based workflow that selects meals, applies filters, and builds a weekly meal plan.
- A generated grocery list that aggregates needed ingredients from the planned meals.
- A simple weekly calendar-style display to show the meal of the day for each planned day.

## Architecture

The system follows an agent-based design with modular components:

- **Agent (OpenAI Agents framework)**  
  Responsible for reasoning, decision-making, and orchestrating the workflow.

- **Tools (tool calling)**  
  Modular functions used by the agent:
  - `get_recipes()`
  - `filter_recipes()`
  - `build_meal_plan()`
  - `extract_ingredients()`

- **Skills (modular logic)**  
  Core functionalities are separated into reusable components such as filtering, planning, and aggregation.

- **Data layer**  
  A local JSON file acts as the recipe database.

- **Frontend**  
  A simple interface displays the meal plan and grocery list.

## How it works

1. The user provides preferences and constraints.
2. The agent interprets the request.
3. The agent uses tool calling to:
   - retrieve recipes
   - filter them based on constraints
   - build a structured meal plan
4. The system generates a grocery list from the selected meals.
5. The results are displayed in a weekly view.

## Course Concepts Applied

- **Agents**  
  The system is built around an AI agent that interprets user input and drives decision-making.

- **Tool Calling**  
  The agent interacts with external functions to perform structured operations.

- **OpenAI Agents Framework**  
  Used to implement and manage the agent workflow.

- **Skills**  
  Logic is decomposed into modular components that can be reused and combined.


## Project scope

The current version focuses on a local recipe dataset and an in-app weekly meal planner. External recipe scraping or calendar integration is intentionally excluded to keep the MVP small, reliable, and easy to test.

## Notes

This README is part of the project documentation and explains the selected approach and course-related concepts.
