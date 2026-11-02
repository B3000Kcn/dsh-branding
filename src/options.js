/** Banner zoom is persisted as a percentage in ten-point steps. */
export const SCALE_STEP = 10
export const MIN_SCALE = 10
export const MAX_SCALE = 300
export const DEFAULT_SCALE = 100

/** Horizontal offsets use screen pixels independently of banner zoom. */
export const OFFSET_STEP = 5
export const MIN_OFFSET = -200
export const MAX_OFFSET = 200
export const DEFAULT_OFFSET = 0

/** Check percentages read from the settings transport before using them in CSS. */
export function isBannerScale(value) {
  return Number.isInteger(value) && value >= MIN_SCALE && value <= MAX_SCALE && value % SCALE_STEP === 0
}

/** Check persisted offsets before assigning them to the banner's CSS translation. */
export function isBannerOffset(value) {
  return Number.isInteger(value) && value >= MIN_OFFSET && value <= MAX_OFFSET && value % OFFSET_STEP === 0
}
