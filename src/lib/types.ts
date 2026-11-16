export type Unit = 'g' | 'ml'
export type Source = 'usda' | 'recipe' | 'ai' | 'custom' | 'edited'
export type Slot = 'breakfast' | 'mid_morning' | 'lunch' | 'evening_snack' | 'dinner' | 'other'

export interface Base { id: string; user_id: string; updated_at: string; deleted_at?: string | null; _dirty?: number }
export interface Macros { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number }

export interface Profile extends Base {
  name: string; sex: 'male' | 'female'; age: number; height_cm: number; weight_kg: number
  activity: 'sedentary' | 'light' | 'moderate' | 'active'; goal: string; timezone: string; onboarded: boolean
}
export interface Targets extends Base, Macros { water_ml: number; professional_approved: boolean }
export interface Prefs extends Base {
  diet: string; preferred: string[]; avoid: string[]; whey_max_scoops: number; workouts_enabled: boolean; fitness_level: 'beginner' | 'intermediate'
}
export interface Food extends Base, Macros { name: string; unit: Unit; servings: [string, number][]; source: Source }
export interface FavouriteMeal extends Base { name: string; items: ItemDraft[] }
export interface Meal extends Base {
  local_date: string; slot: Slot; name: string; eaten_at: string; status: 'draft' | 'logged' | 'skipped'
  no_photo: boolean; ai_analysis: AiAnalysis | null; ai_feedback: string | null; notes: string | null
}
export interface ItemDraft extends Macros {
  name: string; quantity: number; unit: Unit; per100: Macros | null; source: Source
  food_ref: string | null; cooking_method: string | null; confidence: number | null
}
export interface MealItem extends Base, ItemDraft { meal_id: string; sort: number }
export interface MealPhoto extends Base { meal_id: string; storage_path: string }
export interface Reminder extends Base { kind: 'hydration' | 'meal' | 'review' | 'weight'; slot: Slot | null; label: string; time: string; enabled: boolean; sort: number; weekday: number | null }
export interface ReminderEvent extends Base {
  reminder_id: string; local_date: string; status: 'sent' | 'completed' | 'skipped' | 'snoozed'; snoozed_until: string | null; pushed_at: string | null
}
export interface WaterLog extends Base { local_date: string; amount_ml: number; logged_at: string }
export interface WeightLog extends Base { local_date: string; weight_kg: number }
export interface DailyReport extends Base { local_date: string; summary: any; report: DailyAi }
export interface WeeklyReport extends Base { week_start: string; summary: any; report: WeeklyAi }
export interface CoachMessage extends Base { role: 'user' | 'assistant'; content: string; created_at: string }
export interface WorkoutSet { exercise_id: string; name: string; sets: number[]; unit: 'reps' | 'sec' }
export interface Workout extends Base {
  local_date: string; started_at: string; duration_min: number; category: string; difficulty: string
  exercises: WorkoutSet[]; notes: string | null; effort: number | null; est_kcal: number; source: 'app' | 'manual'; ai_feedback: WorkoutAi | null
}

export interface AiItem {
  name: string; grams: number; unit: Unit; ref_id: string | null; cooking_method: string | null
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number
  confidence: number; portion_unclear: boolean; note?: string
}
export interface AiQuestion { question: string; kind: 'oil' | 'sauce' | 'other' }
export interface AiAnalysis { meal_name: string; items: AiItem[]; questions: AiQuestion[]; assumptions: string; overall_confidence: number; analysed_at: string }
export interface LabelAnalysis {
  product_name: string; brand: string | null; unit: Unit; printed_basis: 'per_100' | 'per_serving' | 'both'
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number; sugar_g: number | null
  serving_label: string | null; serving_grams: number | null
  confidence: number; notes: string; verdict: string
}
export interface DailyAi {
  headline: string; calorie_target: string; protein: string; carb_fat_balance: string; strongest_meal: string; meal_to_improve: string
  schedule: string; missed_meals: string; oil_and_extras: string; adjustments: string; improve_tomorrow: string; action_plan: string[]
}
export interface WeeklyAi { headline: string; progress: string; nutrition: string; consistency: string; weight_trend: string; improvements: string[] }
export interface WorkoutAi { muscles: string; balance: string; difficulty: string; improve: string; complement: string; recovery: string }
