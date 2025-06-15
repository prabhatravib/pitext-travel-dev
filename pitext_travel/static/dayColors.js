// static/dayColors.js

// 1) Static palette for Days 1–7 (soft, warm, distinct)
export const DAY_COLOR_MAP = {
1: "#FFADAD", // pastel-red (Day 1)
2: "#FFD6A5", // pastel-apricot (Day 2)
3: "#FFCC99", // pastel-peach (Day 3)
4: "#FFC4E1", // pastel-pink (Day 4)
5: "#FDFFB6", // pastel-butter (Day 5)
6: "#FFB3AB", // pastel-coral (Day 6)
7: "#FFECB3", // pastel-gold (Day 7)
};

// 2) Helper to return a colour for any given day index.
//    If the day is not in the static map, fall back to an HSL-based pastel.
export function getColourForDay(dayIndex) {
  // If a static entry exists, return it
  if (DAY_COLOR_MAP.hasOwnProperty(dayIndex)) {
    return DAY_COLOR_MAP[dayIndex];
  }
  
  // Otherwise, generate a gentle pastel by spacing hues around the colour wheel.
  // This ensures undefined days (e.g., Day 8, Day 9, …) still get a soft, distinct hue.
  const hue = (dayIndex * 45) % 360;      // 45° increments around the circle
  const saturation = 70;                  // 70% saturation (pastel feel)
  const lightness = 85;                   // 85% lightness (very soft)
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
