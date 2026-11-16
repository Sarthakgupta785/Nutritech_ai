import type { Prefs } from './types'

export type Units = 'metric' | 'imperial'
const LB_PER_KG = 2.2046226218
const ML_PER_FLOZ = 29.5735296   // US fluid ounce

/**
 * Weight and volume are always stored metric (kg, ml); this converts only at the edges, so a
 * change of preference never rewrites stored data and never loses precision.
 */
export const kgToDisplay = (kg: number, u: Units) => (u === 'imperial' ? kg * LB_PER_KG : kg)
export const displayToKg = (v: number, u: Units) => (u === 'imperial' ? v / LB_PER_KG : v)
export const mlToDisplay = (ml: number, u: Units) => (u === 'imperial' ? ml / ML_PER_FLOZ : ml)
export const displayToMl = (v: number, u: Units) => (u === 'imperial' ? v * ML_PER_FLOZ : v)

export const weightUnit = (u: Units) => (u === 'imperial' ? 'lb' : 'kg')
export const volumeUnit = (u: Units) => (u === 'imperial' ? 'fl oz' : 'ml')
export const bigVolumeUnit = (u: Units) => (u === 'imperial' ? 'fl oz' : 'L')

const r = (n: number, d: number) => Number(n.toFixed(d))
export const fmtWeight = (kg: number, u: Units, d = 1) => `${r(kgToDisplay(kg, u), d)} ${weightUnit(u)}`
/** Litres read better than thousands of millilitres; fluid ounces do not, so imperial stays whole. */
export const fmtBigVolume = (ml: number, u: Units, d = 2) =>
  u === 'imperial' ? `${Math.round(mlToDisplay(ml, u))} fl oz` : `${r(ml / 1000, d)} L`
export const bigVolumeValue = (ml: number, u: Units) => (u === 'imperial' ? mlToDisplay(ml, u) : ml / 1000)

/** Quick-add buttons, sized naturally for each system. */
export const waterPresets = (u: Units): { label: string; ml: number }[] =>
  u === 'imperial'
    ? [{ label: '+8 oz', ml: Math.round(8 * ML_PER_FLOZ) }, { label: '+16 oz', ml: Math.round(16 * ML_PER_FLOZ) }]
    : [{ label: '+250', ml: 250 }, { label: '+500', ml: 500 }]

export const unitsOf = (p: Pick<Prefs, 'units'> | undefined): Units => (p?.units === 'imperial' ? 'imperial' : 'metric')
