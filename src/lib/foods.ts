import type { ItemDraft, Macros, Source, Unit } from './types'
import { scale } from './nutrition'

/**
 * Built-in reference foods. Values are per 100 g (or 100 ml).
 *  - src 'usda': rounded standard-reference figures from USDA FoodData Central for the plain food.
 *  - src 'recipe': mixed dishes. No single correct value exists because recipes differ; these are
 *    typical home-style figures and are labelled "Typical recipe" in the app.
 * AI estimates and your own custom foods are stored and labelled separately.
 */
export interface RefFood extends Macros { id: string; name: string; cat: string; unit: Unit; source: Source; servings: [string, number][]; keys?: string }

type Row = [id: string, name: string, cat: string, kcal: number, p: number, c: number, f: number, fb: number, src: 'usda' | 'recipe', servings: [string, number][], keys?: string, unit?: Unit]
const R: Row[] = [
  // Eggs & poultry
  ['egg_whole', 'Whole egg, boiled', 'Protein', 155, 12.6, 1.1, 10.6, 0, 'usda', [['1 large egg', 50]], 'eggs anda'],
  ['egg_white', 'Egg white', 'Protein', 52, 10.9, 0.7, 0.2, 0, 'usda', [['1 egg white', 33]], 'whites'],
  ['omelette', 'Omelette, plain', 'Protein', 154, 10.6, 0.6, 11.7, 0, 'usda', [['2-egg omelette', 120]], 'omelet'],
  ['chicken_breast', 'Chicken breast, cooked, skinless', 'Protein', 165, 31, 0, 3.6, 0, 'usda', [['Small piece', 100], ['Medium piece', 150]], 'grilled chicken boiled chicken'],
  ['chicken_thigh', 'Chicken thigh, cooked, skinless', 'Protein', 179, 24.8, 0, 8.2, 0, 'usda', [['1 thigh', 85]], 'leg'],
  ['fish_white', 'White fish (tilapia), cooked', 'Protein', 128, 26.2, 0, 2.7, 0, 'usda', [['1 fillet', 120]], 'fish fillet'],
  ['prawns', 'Prawns / shrimp, cooked', 'Protein', 99, 24, 0.2, 0.3, 0, 'usda', [['Small bowl', 100]], 'shrimp jhinga'],
  ['whey', 'Whey protein powder (typical)', 'Protein', 400, 80, 10, 5, 0, 'recipe', [['1 scoop', 30]], 'protein shake scoop'],
  ['tofu', 'Tofu, regular', 'Protein', 76, 8.1, 1.9, 4.8, 0.3, 'usda', [['Half block', 125]]],
  ['soya_chunks', 'Soya chunks, dry (typical)', 'Protein', 345, 52, 33, 0.5, 13, 'recipe', [['Small handful', 30]], 'soy nutrela'],
  ['paneer', 'Paneer', 'Protein', 265, 18.3, 1.2, 20.8, 0, 'recipe', [['Small cube portion', 50]], 'cottage cheese'],
  // Grains
  ['brown_rice', 'Brown rice, cooked', 'Grains', 123, 2.7, 25.6, 1, 1.6, 'usda', [['Small bowl', 100], ['Medium bowl', 150], ['Large bowl', 200]]],
  ['white_rice', 'White rice, cooked', 'Grains', 130, 2.7, 28.2, 0.3, 0.4, 'usda', [['Small bowl', 100], ['Medium bowl', 150], ['Large bowl', 200]], 'chawal'],
  ['oats_dry', 'Oats, rolled, dry', 'Grains', 379, 13.2, 67.7, 6.5, 10.1, 'usda', [['Half cup', 40]], 'oatmeal'],
  ['oats_cooked', 'Oats, cooked in water', 'Grains', 71, 2.5, 12, 1.5, 1.7, 'usda', [['1 bowl', 230]], 'porridge oatmeal'],
  ['roti', 'Roti / chapati, plain', 'Grains', 297, 9.8, 46.4, 7.5, 4.9, 'usda', [['1 medium roti', 40]], 'phulka chapathi'],
  ['paratha', 'Paratha, plain (typical)', 'Grains', 300, 7, 43, 11, 4, 'recipe', [['1 paratha', 70]]],
  ['quinoa', 'Quinoa, cooked', 'Grains', 120, 4.4, 21.3, 1.9, 2.8, 'usda', [['Medium bowl', 150]]],
  ['bread_white', 'White bread', 'Grains', 265, 9, 49, 3.2, 2.7, 'usda', [['1 slice', 28]], 'toast'],
  ['idli', 'Idli (typical)', 'Grains', 135, 4, 27, 0.6, 1.5, 'recipe', [['1 idli', 40]]],
  ['dosa', 'Plain dosa (typical)', 'Grains', 180, 4, 29, 5, 1.5, 'recipe', [['1 dosa', 85]]],
  ['poha', 'Poha, cooked (typical)', 'Grains', 130, 2.5, 23, 3.5, 1.2, 'recipe', [['1 plate', 180]]],
  ['upma', 'Upma (typical)', 'Grains', 120, 3, 18, 4, 1.5, 'recipe', [['1 bowl', 180]]],
  ['khichdi', 'Dal khichdi (typical)', 'Grains', 110, 4, 18, 2.5, 2, 'recipe', [['1 bowl', 250]]],
  // Dairy
  ['milk_skim', 'Skimmed milk', 'Dairy', 34, 3.4, 5, 0.1, 0, 'usda', [['1 glass', 250], ['1 cup', 200]], 'skim', 'ml'],
  ['milk_toned', 'Toned milk, 3% fat (typical)', 'Dairy', 58, 3.1, 4.7, 3, 0, 'recipe', [['1 glass', 250]], 'doodh', 'ml'],
  ['greek_yogurt', 'Greek yogurt, plain, non-fat', 'Dairy', 59, 10.2, 3.6, 0.4, 0, 'usda', [['1 cup', 170]], 'yoghurt'],
  ['curd', 'Curd / plain yogurt, whole milk', 'Dairy', 61, 3.5, 4.7, 3.3, 0, 'usda', [['1 katori', 125]], 'dahi yoghurt'],
  ['butter', 'Butter', 'Fats', 717, 0.9, 0.1, 81, 0, 'usda', [['1 tsp', 5]], 'makhan'],
  // Pulses & Indian dishes
  ['lentils', 'Lentils, boiled, plain', 'Pulses', 116, 9, 20.1, 0.4, 7.9, 'usda', [['1 katori', 150]], 'masoor'],
  ['dal', 'Dal tadka, home-style (typical)', 'Pulses', 105, 5.5, 14, 3, 3, 'recipe', [['1 katori', 150]], 'toor arhar daal'],
  ['moong', 'Moong dal, boiled, plain', 'Pulses', 105, 7, 19.2, 0.4, 7.6, 'usda', [['1 katori', 150]], 'mung'],
  ['sprouts', 'Moong sprouts, raw', 'Pulses', 30, 3, 5.9, 0.2, 1.8, 'usda', [['1 cup', 100]]],
  ['chickpeas', 'Chickpeas, boiled', 'Pulses', 164, 8.9, 27.4, 2.6, 7.6, 'usda', [['1 katori', 150]], 'chana kabuli'],
  ['rajma_boiled', 'Kidney beans, boiled', 'Pulses', 127, 8.7, 22.8, 0.5, 6.4, 'usda', [['1 katori', 150]], 'rajma'],
  ['rajma_curry', 'Rajma curry (typical)', 'Indian dishes', 110, 5.5, 15, 3, 4.5, 'recipe', [['1 katori', 150]]],
  ['chole', 'Chole / chana masala (typical)', 'Indian dishes', 130, 6, 17, 4.5, 5, 'recipe', [['1 katori', 150]]],
  ['sambar', 'Sambar (typical)', 'Indian dishes', 55, 2.5, 8, 1.5, 2, 'recipe', [['1 katori', 150]]],
  ['chicken_curry', 'Chicken curry, home-style (typical)', 'Indian dishes', 140, 13, 4, 8, 0.8, 'recipe', [['1 katori', 150], ['Large bowl', 250]], 'murgh'],
  ['tandoori_chicken', 'Tandoori chicken (typical)', 'Indian dishes', 150, 24, 2, 5, 0.3, 'recipe', [['1 piece', 100]], 'tikka'],
  ['chicken_biryani', 'Chicken biryani (typical)', 'Indian dishes', 170, 8.5, 20, 6, 1, 'recipe', [['1 plate', 300]]],
  ['chicken_fried_rice', 'Chicken fried rice (typical)', 'Indian dishes', 165, 7, 22, 5, 1, 'recipe', [['1 plate', 300]]],
  ['egg_bhurji', 'Egg bhurji (typical)', 'Indian dishes', 170, 11, 3, 12.5, 0.5, 'recipe', [['2-egg portion', 130]], 'scrambled'],
  ['mixed_veg', 'Mixed vegetable sabzi (typical)', 'Indian dishes', 85, 2.5, 9, 4.5, 3, 'recipe', [['1 katori', 150]], 'sabji curry'],
  ['aloo_gobi', 'Aloo gobi (typical)', 'Indian dishes', 95, 2.2, 11, 5, 2.5, 'recipe', [['1 katori', 150]]],
  ['tea_milk', 'Tea with milk and sugar (typical)', 'Drinks', 37, 1, 5.5, 1.1, 0, 'recipe', [['1 cup', 150]], 'chai', 'ml'],
  ['coffee_black', 'Black coffee, no sugar', 'Drinks', 1, 0.1, 0, 0, 0, 'usda', [['1 cup', 240]], '', 'ml'],
  ['coconut_water', 'Coconut water', 'Drinks', 19, 0.7, 3.7, 0.2, 1.1, 'usda', [['1 glass', 250]], 'nariyal', 'ml'],
  // Fruit
  ['banana', 'Banana', 'Fruit', 89, 1.1, 22.8, 0.3, 2.6, 'usda', [['1 medium', 118]], 'kela'],
  ['apple', 'Apple', 'Fruit', 52, 0.3, 13.8, 0.2, 2.4, 'usda', [['1 medium', 180]], 'seb'],
  ['orange', 'Orange', 'Fruit', 47, 0.9, 11.8, 0.1, 2.4, 'usda', [['1 medium', 130]], 'santra'],
  ['papaya', 'Papaya', 'Fruit', 43, 0.5, 10.8, 0.3, 1.7, 'usda', [['1 cup', 145]]],
  ['watermelon', 'Watermelon', 'Fruit', 30, 0.6, 7.6, 0.2, 0.4, 'usda', [['1 cup', 150]], 'tarbooz'],
  ['mango', 'Mango', 'Fruit', 60, 0.8, 15, 0.4, 1.6, 'usda', [['1 cup', 165]], 'aam'],
  ['guava', 'Guava', 'Fruit', 68, 2.6, 14.3, 1, 5.4, 'usda', [['1 medium', 100]], 'amrood'],
  ['pomegranate', 'Pomegranate', 'Fruit', 83, 1.7, 18.7, 1.2, 4, 'usda', [['Half cup', 87]], 'anar'],
  ['grapes', 'Grapes', 'Fruit', 69, 0.7, 18.1, 0.2, 0.9, 'usda', [['1 cup', 150]], 'angoor'],
  ['pineapple', 'Pineapple', 'Fruit', 50, 0.5, 13.1, 0.1, 1.4, 'usda', [['1 cup', 165]]],
  ['dates', 'Dates', 'Fruit', 277, 1.8, 75, 0.2, 6.7, 'usda', [['1 date', 24]], 'khajoor'],
  // Vegetables
  ['cucumber', 'Cucumber', 'Vegetables', 15, 0.7, 3.6, 0.1, 0.5, 'usda', [['Half cucumber', 100]], 'kheera salad'],
  ['tomato', 'Tomato', 'Vegetables', 18, 0.9, 3.9, 0.2, 1.2, 'usda', [['1 medium', 120]], 'tamatar'],
  ['onion', 'Onion', 'Vegetables', 40, 1.1, 9.3, 0.1, 1.7, 'usda', [['Half onion', 55]], 'pyaz'],
  ['carrot', 'Carrot', 'Vegetables', 41, 0.9, 9.6, 0.2, 2.8, 'usda', [['1 medium', 60]], 'gajar'],
  ['spinach', 'Spinach, raw', 'Vegetables', 23, 2.9, 3.6, 0.4, 2.2, 'usda', [['1 cup', 30]], 'palak'],
  ['broccoli', 'Broccoli', 'Vegetables', 34, 2.8, 6.6, 0.4, 2.6, 'usda', [['1 cup', 90]]],
  ['cauliflower', 'Cauliflower', 'Vegetables', 25, 1.9, 5, 0.3, 2, 'usda', [['1 cup', 100]], 'gobi'],
  ['cabbage', 'Cabbage', 'Vegetables', 25, 1.3, 5.8, 0.1, 2.5, 'usda', [['1 cup', 90]], 'patta gobhi'],
  ['capsicum', 'Capsicum / bell pepper', 'Vegetables', 20, 0.9, 4.6, 0.2, 1.7, 'usda', [['1 medium', 120]], 'shimla mirch'],
  ['beans_green', 'Green beans', 'Vegetables', 31, 1.8, 7, 0.2, 2.7, 'usda', [['1 cup', 100]]],
  ['okra', 'Okra / bhindi, raw', 'Vegetables', 33, 1.9, 7.5, 0.2, 3.2, 'usda', [['1 cup', 100]], 'ladyfinger'],
  ['peas', 'Green peas, boiled', 'Vegetables', 84, 5.4, 15.6, 0.2, 5.5, 'usda', [['Half cup', 80]], 'matar'],
  ['mushroom', 'Mushrooms', 'Vegetables', 22, 3.1, 3.3, 0.3, 1, 'usda', [['1 cup', 70]]],
  ['potato', 'Potato, boiled', 'Vegetables', 87, 1.9, 20.1, 0.1, 1.8, 'usda', [['1 medium', 150]], 'aloo'],
  ['sweet_potato', 'Sweet potato, boiled', 'Vegetables', 76, 1.4, 17.7, 0.1, 2.5, 'usda', [['1 medium', 130]], 'shakarkandi'],
  ['corn', 'Sweet corn, boiled', 'Vegetables', 96, 3.4, 21, 1.5, 2.4, 'usda', [['Half cup', 80]], 'bhutta makka'],
  // Fats, nuts, extras
  ['oil', 'Cooking oil', 'Fats', 884, 0, 0, 100, 0, 'usda', [['1 tsp', 4.5], ['1 tbsp', 13.5]], 'sunflower mustard olive tel'],
  ['ghee', 'Ghee', 'Fats', 900, 0, 0, 99.5, 0, 'usda', [['1 tsp', 5]]],
  ['almonds', 'Almonds', 'Nuts', 579, 21.2, 21.6, 49.9, 12.5, 'usda', [['10 almonds', 12]], 'badam'],
  ['peanuts', 'Peanuts, roasted', 'Nuts', 587, 24.4, 21.3, 49.7, 8.4, 'usda', [['Small handful', 28]], 'moongphali'],
  ['walnuts', 'Walnuts', 'Nuts', 654, 15.2, 13.7, 65.2, 6.7, 'usda', [['4 halves', 12]], 'akhrot'],
  ['peanut_butter', 'Peanut butter', 'Nuts', 588, 25, 20, 50, 6, 'usda', [['1 tbsp', 16]]],
  ['sugar', 'Sugar', 'Extras', 387, 0, 100, 0, 0, 'usda', [['1 tsp', 4]], 'cheeni'],
  ['honey', 'Honey', 'Extras', 304, 0.3, 82.4, 0, 0.2, 'usda', [['1 tsp', 7]], 'shahad'],
  ['ketchup', 'Tomato ketchup', 'Extras', 101, 1, 27, 0.1, 0.3, 'usda', [['1 tbsp', 17]], 'sauce'],
  ['mayonnaise', 'Mayonnaise', 'Extras', 680, 1, 0.6, 75, 0, 'usda', [['1 tbsp', 14]], 'mayo dressing'],
  ['green_chutney', 'Green chutney (typical)', 'Extras', 45, 2, 7, 1, 2.5, 'recipe', [['1 tbsp', 15]], 'mint coriander'],
]

export const FOODS: RefFood[] = R.map(([id, name, cat, kcal, protein_g, carbs_g, fat_g, fibre_g, source, servings, keys, unit]) =>
  ({ id, name, cat, kcal, protein_g, carbs_g, fat_g, fibre_g, source, servings, keys, unit: unit ?? 'g' }))
export const FOOD_BY_ID: Record<string, RefFood> = Object.fromEntries(FOODS.map(f => [f.id, f]))

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
export function searchFoods<T extends { name: string; keys?: string }>(list: T[], q: string): T[] {
  const terms = norm(q).split(' ').filter(Boolean)
  if (!terms.length) return list
  return list
    .map(f => { const hay = norm(f.name + ' ' + (f.keys ?? '')); const name = norm(f.name)
      const score = terms.every(t => hay.includes(t)) ? (name.startsWith(terms[0]) ? 3 : name.includes(terms[0]) ? 2 : 1) : 0
      return { f, score } })
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.f)
}
/** True when a food name matches something on the user's avoid list. */
export function matchesAvoid(name: string, avoid: string[]): string | null {
  const n = norm(name)
  return avoid.find(a => a.trim() && n.includes(norm(a))) ?? null
}
export function draftFromFood(f: Macros & { id?: string; name: string; unit: Unit; source: Source; servings?: [string, number][] }, qty?: number): ItemDraft {
  const quantity = qty ?? f.servings?.[0]?.[1] ?? 100
  const per100: Macros = { kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fibre_g: f.fibre_g }
  return { name: f.name, quantity, unit: f.unit, per100, source: f.source, food_ref: f.id ?? null, cooking_method: null, confidence: null, ...scale(per100, quantity) }
}
export const SOURCE_LABEL: Record<Source, { label: string; cls: string; help: string }> = {
  usda: { label: 'Reference', cls: 'bg-leaf-100 text-leaf-800', help: 'Standard reference value (USDA FoodData Central)' },
  recipe: { label: 'Typical recipe', cls: 'bg-sky-100 text-sky-800', help: 'Typical value for a mixed dish; real recipes vary' },
  ai: { label: 'AI estimate', cls: 'bg-amber-100 text-amber-800', help: 'Estimated by AI from your photo' },
  custom: { label: 'Custom', cls: 'bg-violet-100 text-violet-800', help: 'Entered by you' },
  edited: { label: 'Edited by you', cls: 'bg-ink-100 text-ink-700', help: 'You corrected these numbers' },
}
