# Original specification — NutriTrack AI

This is the prompt that produced the application, unedited. It was written before any code existed
and defines the product, the personal profile, the accuracy and safety rules, the technical stack
and the build order. `PROMPT-workout-module.md` is the follow-up spec for the optional fitness module.

---

PROJECT: NUTRITRACK AI – PERSONAL AI NUTRITION & FAT-LOSS ASSISTANT

Act as a senior full-stack engineer, AI engineer, product designer and nutrition technology specialist.

I want you to design and build a fully functional, premium-quality personal nutrition tracking application called NutriTrack AI.

This is an application I will personally use every day on my iPhone.

I do NOT want just a UI prototype, wireframe or design concept. I want a working application with a database, AI integration, meal reminders, photo-based food analysis, nutrition calculations and daily performance reports.

The application must be installable on my iPhone Home Screen without downloading it from the App Store.

⸻

1. PROJECT OBJECTIVE

Build an intelligent personal nutrition management system that:

1. Reminds me when it is time to eat.
2. Asks me to photograph every meal.
3. Uses AI vision to identify the food in the photograph.
4. Estimates food quantities and nutritional values.
5. Allows me to correct the AI’s estimates.
6. Calculates my daily calories and macronutrients.
7. Tracks meal timings and food consistency.
8. Generates an AI-powered daily nutrition report.
9. Analyses my weekly progress.
10. Gives personalised recommendations for the next day.

Think of this as a combination of MyFitnessPal, an AI nutritionist and a personal diet accountability assistant.

2. MY PERSONAL PROFILE

Use the following initial profile:

* Weight: 93 kg.
* Height: 175 cm.
* Gender: Male (confirm during onboarding).
* Primary goal: Fat loss while preserving muscle.
* Current activity: No gym and no structured workouts.
* Diet: Non-vegetarian.
* Eggs: Allowed.
* Chicken: Allowed.
* Brown rice: Preferred.
* Oats: Allowed.
* Whey protein: Maximum 1 scoop daily.
* Paneer: Not allowed.
* Bread: Not allowed.

Allow me to modify all profile details whenever required.

Nutrition targets

Create configurable daily calorie and macro targets.

Do not assume 1,200 kcal is appropriate for me. Calculate estimated energy requirements from my profile, explain the assumptions and allow me to set a professionally approved target.

Allow targets for:

* Daily calories.
* Protein.
* Carbohydrates.
* Fats.
* Fibre.
* Water.

Make all targets editable.

Warn me if I enter an excessively restrictive calorie target.

3. PREMIUM IPHONE-STYLE DASHBOARD

Create a beautiful home dashboard.

The first screen should display:

* Today’s date.
* Greeting.
* Current calorie consumption.
* Daily calorie target.
* Remaining calories.
* Protein consumed.
* Carbohydrates consumed.
* Fat consumed.
* Water intake.
* Meals completed.
* Next meal reminder.

Example dashboard:

Calories: 1,350 / 1,650 kcal

Protein: 105 / 130g

Carbs: 125 / 160g

Fat: 42 / 55g

Water: 1.8 / 3 litres

Use attractive circular progress indicators and visual macro charts.

All numbers must automatically update whenever I add or modify a meal.

4. AUTOMATED MEAL REMINDERS

This is one of the most important features.

Create a complete notification and reminder system.

Initial schedule:

Time	Reminder
8:00 AM	Morning hydration
9:00 AM	Breakfast
11:30 AM	Mid-morning snack
1:30 PM	Lunch
4:30 PM	Evening snack
7:30 PM	Dinner
9:30 PM	Daily nutrition review

Requirements:

* Send notifications at scheduled times.
* Mention the specific meal.
* Tapping a notification should open the relevant meal logging screen.
* Provide Snooze for 10 or 15 minutes.
* Allow marking a meal as completed.
* Allow marking a meal as skipped.
* Allow changing all reminder timings.
* Allow enabling and disabling individual reminders.
* Repeat reminders every day.
* Track whether I followed my scheduled meals.

Notifications must actually work.

Use appropriate iOS-compatible PWA notifications and service workers. Explain iOS notification permission requirements, installation requirements and any limitations.

Do not use fake browser alerts as a substitute for notifications.

If reliable background notifications require a push notification backend, implement it.

5. MANDATORY MEAL PHOTO CAPTURE

Every meal should have its own photograph.

When I tap Add Meal, immediately show:

* Take Photo.
* Upload from Gallery.
* Log Without Photo (only if I explicitly choose this option).

Use the iPhone camera when possible.

Every meal entry should store:

* Photograph.
* Meal name.
* Date.
* Actual consumption time.
* Food items.
* Food quantities.
* Nutritional values.
* AI analysis.

Do not mark a meal as fully logged until I upload a photograph or explicitly select Log Without Photo.

6. AI PHOTO-BASED FOOD RECOGNITION

This is a core feature.

Integrate a capable AI vision model through a secure backend.

When I upload a meal photograph, the AI should:

1. Identify every visible food item.
2. Estimate the quantity of each item.
3. Identify cooking methods where possible.
4. Recognise visible sauces, oils and ingredients.
5. Estimate calories.
6. Estimate protein.
7. Estimate carbohydrates.
8. Estimate fat.
9. Estimate fibre where possible.

Example:

I upload a photograph containing chicken breast, brown rice, boiled eggs and cucumber.

The AI should generate:

Food	Estimated quantity
Chicken breast	150g
Brown rice	150g
Boiled eggs	2 pieces
Cucumber	50g

Then calculate the estimated nutrition for each food item and the entire meal.

Important accuracy requirements

Do not pretend that a photograph provides exact food weights or calories.

Show confidence levels and clearly label nutritional values as estimates.

If portion sizes are unclear, ask me to:

* Enter the weight in grams.
* Select a small, medium or large portion.
* Confirm an estimated quantity.

Ask about hidden cooking oil, dressings and sauces when they materially affect the calculation.

7. AI FOOD ANALYSIS AND CONFIRMATION

After analysing a photograph, show:

“Here’s what I identified in your meal.”

Display:

* Food names.
* Estimated quantities.
* Calories per item.
* Protein per item.
* Carbohydrates per item.
* Fats per item.
* Total meal calories.
* Total meal macros.

Provide editable controls.

I should be able to:

* Change food names.
* Edit quantities.
* Add missing foods.
* Delete incorrect foods.
* Change cooking methods.
* Enter cooking oil quantities.
* Add sauces and dressings.
* Correct nutritional information.

Only save the final nutritional values after I confirm the analysis.

My confirmed entries must become the source of truth for all future calculations.

8. MANUAL FOOD LOGGING

Apart from photo recognition, allow manual food logging.

Provide:

* Searchable food database.
* Indian food database.
* Common household foods.
* Recently consumed foods.
* Favourite meals.
* Custom food entries.
* Portion selection.
* Grams and millilitres.
* Individual food editing.
* Meal duplication.

Include foods such as:

* Whole eggs.
* Egg whites.
* Chicken breast.
* Chicken curry.
* Brown rice.
* White rice.
* Oats.
* Skimmed milk.
* Greek yogurt.
* Curd.
* Fruits.
* Vegetables.
* Dal.
* Roti.
* Common Indian meals.

Use reliable nutritional references or databases.

Never invent precise nutritional information.

Clearly distinguish verified database values from AI-generated estimates.

9. PERSONAL AI NUTRITION COACH

Create a separate AI Coach section.

I should be able to chat with my nutrition assistant.

Example questions:

* How many calories do I have remaining?
* What should I eat for dinner?
* Am I getting enough protein?
* Is this meal good for fat loss?
* How can I improve tomorrow’s diet?
* Can I eat chicken fried rice today?
* What should I eat if I have only 400 calories remaining?

The AI must have access to my:

* Personal profile.
* Daily calorie target.
* Macro targets.
* Meal history.
* Food preferences.
* Confirmed food logs.
* Weekly progress.

It should give answers based on my actual records rather than generic advice.

Never encourage crash dieting or unhealthy restriction.

10. END-OF-DAY AI REPORT

This is the most important analytical feature.

At 9:30 PM, generate a complete daily nutrition report.

A. Daily summary

Show:

* Total calories consumed.
* Total protein.
* Total carbohydrates.
* Total fat.
* Total fibre, where available.
* Total water intake.
* Meals completed.
* Meals missed.
* Calorie target achievement.
* Macro target achievement.

B. Macro analysis

Compare actual consumption with daily targets.

Use charts and progress indicators.

C. AI performance assessment

The AI should answer:

1. Did I stay within my calorie target?
2. Did I consume sufficient protein?
3. Were my carbs and fats balanced?
4. Which meal was my strongest?
5. Which meal could have been improved?
6. Did I follow my meal schedule?
7. Did I miss any meals?
8. Did I consume too much oil or unnecessary calories?
9. What mistakes did I make?
10. What should I improve tomorrow?

D. Meal-by-meal review

Show all meal photographs with their nutritional information.

Allow me to tap any meal and view its detailed analysis.

E. Tomorrow’s action plan

Generate three specific improvements.

Example:

* Increase protein at breakfast by adding egg whites.
* Keep lunch portions consistent.
* Improve water intake throughout the day.

The feedback should be practical, supportive and non-judgmental.

Do not shame me for missing targets.

If I have not logged a meal, do not assume I skipped it. Mark it as unlogged.

11. WEEKLY ANALYTICS

Create a dedicated analytics page.

Show:

* Average daily calories.
* Average daily protein.
* Average carbohydrates.
* Average fat.
* Weekly calorie trends.
* Weekly protein trends.
* Weight history.
* Meal consistency.
* Reminder completion percentage.
* Water intake.
* Best-performing day.
* Least consistent day.

Include clean interactive charts.

Weight tracking

Allow me to enter my weight daily.

Show:

* Daily weight.
* Seven-day moving average.
* Weekly change.
* Overall progress.

Do not interpret daily fluctuations as actual fat gain or fat loss.

Generate a weekly AI report explaining my progress and possible improvements.

12. FOOD PHOTO JOURNAL

Create a dedicated visual food diary.

For each day, display:

Breakfast photograph.

Lunch photograph.

Snack photograph.

Dinner photograph.

Each photo should be clickable and display:

* Food identification.
* Confirmed quantities.
* Calories.
* Macros.
* Meal timing.
* AI feedback.

Allow me to revisit previous days and edit incorrect entries.

Provide photo deletion functionality.

Store photographs securely.

13. WATER TRACKING

Create a simple water tracking interface.

Allow me to:

* Add 250ml.
* Add 500ml.
* Enter custom quantities.
* Set a daily target.
* Receive hydration reminders.

Show daily water progress on the dashboard.

14. APPLICATION DESIGN

I want a premium iPhone-inspired design.

Design direction:

* Minimalistic.
* Modern.
* White or light background.
* Soft green accents.
* Rounded cards.
* Premium typography.
* Smooth transitions.
* Attractive charts.
* Large readable numbers.
* Easy one-handed operation.

Bottom navigation:

1. Home.
2. Food Log.
3. Analytics.
4. AI Coach.
5. Profile.

Make the application feel like a professionally designed iOS application rather than a generic website.

Prioritise usability over unnecessary animations.

15. TECHNICAL STACK

Build this as an installable Progressive Web Application.

Preferred technology:

Frontend:

* React.
* TypeScript.
* Tailwind CSS.

Backend:

* Supabase.
* PostgreSQL.
* Supabase Authentication.
* Supabase Storage.

AI:

* Vision-capable AI model for food photographs.
* LLM for nutrition analysis and daily reporting.

Notifications:

* Service workers.
* Web Push notifications where supported.
* Appropriate backend scheduling and notification delivery.

Analytics:

* Chart.js or Recharts.

Requirements:

* Responsive mobile-first architecture.
* iPhone Safari compatibility.
* PWA manifest.
* Service worker.
* Add to Home Screen support.
* Persistent database.
* Secure image storage.
* Secure API key handling.
* Offline meal logging.
* Automatic synchronisation.
* Proper date and timezone handling.
* Error handling.
* Loading states.
* Database backups and security considerations.

Never expose AI API keys in frontend JavaScript.

Use Supabase Row Level Security.

16. DATABASE ARCHITECTURE

Create appropriate tables for:

1. User profiles.
2. Nutrition targets.
3. Food database.
4. Meal entries.
5. Individual meal food items.
6. Meal photographs.
7. Reminder schedules.
8. Water intake.
9. Weight history.
10. Daily AI reports.
11. Weekly AI reports.
12. User preferences.

Every record must be associated with the correct user.

Ensure database relationships and security are implemented properly.

17. IPHONE INSTALLATION

The final application must be deployable using a public HTTPS URL.

Provide instructions for:

1. Deploying the application.
2. Opening it in iPhone Safari.
3. Tapping Share.
4. Selecting Add to Home Screen.
5. Enabling notifications.
6. Using it as a standalone application.

The application should have its own icon, name and launch experience.

Do not claim that App Store installation is required.

18. DEVELOPMENT AND EXECUTION INSTRUCTIONS

I want you to actually build this application.

Do not stop after giving me a plan.

Follow these stages:

PHASE 1: Create project structure and UI.

PHASE 2: Implement authentication and Supabase database.

PHASE 3: Implement food logging and nutrition calculations.

PHASE 4: Implement camera and gallery integration.

PHASE 5: Implement AI food recognition and confirmation.

PHASE 6: Implement reminders and notifications.

PHASE 7: Implement AI nutrition coach.

PHASE 8: Implement daily reports and weekly analytics.

PHASE 9: Implement PWA installation and offline functionality.

PHASE 10: Test everything and deploy.

If you need credentials, tell me exactly what to create and where to enter them.

Do not leave essential features as fake buttons or placeholders.

If a feature cannot be supported reliably on iOS PWA, explain the limitation and implement the best working alternative.

Prioritise actual functionality over visual demonstrations.

19. FINAL EXPECTATION

I want one complete personal AI nutrition application that I can open from my iPhone Home Screen every day.

My daily workflow should be:

1. Wake up and receive a hydration reminder.
2. Receive a breakfast reminder.
3. Take a photograph of my breakfast.
4. Let AI identify my food.
5. Confirm quantities and macros.
6. Automatically update my daily dashboard.
7. Repeat the process for lunch, snacks and dinner.
8. Receive reminders throughout the day.
9. Review my total calories and macros at night.
10. Receive an AI-generated daily performance report.
11. Get three actionable recommendations for tomorrow.

The application should remember my historical records and use them to make progressively better recommendations.

Build NutriTrack AI as a real, reliable, premium-quality personal nutrition management product.