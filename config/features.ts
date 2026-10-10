/** Switches for parts of the app that a city may not want. */
export const features = {
  /** Shows a banner on the dashboard saying its figures include generated history. */
  syntheticHistory: false,
  /** The map on the public works list. The list itself always shows. */
  publicMap: true,
  /** The Dashboard screen and its link in the header. */
  dashboard: true,
} as const;

export type FeatureFlag = keyof typeof features;
