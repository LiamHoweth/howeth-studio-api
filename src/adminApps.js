// Private console inventory. A listed app is not evidence of a live integration.
// Add adapters only when an app has its own authenticated, scoped data source.
export const adminApps = [
  { id: "football_era", name: "Football Era", category: "Game", adapter: "football", feedback: true },
  { id: "elevenward", name: "Elevenward", category: "Game", adapter: "elevenward", feedback: true },
  { id: "basketball_era", name: "Basketball Era", category: "Game" },
  { id: "baseball_era", name: "Baseball Era", category: "Game" },
  { id: "fight_era", name: "Fight Era", category: "Game" },
  { id: "math_wars", name: "Math Wars!", category: "Game" },
  { id: "superlife", name: "SuperLife", category: "Game" },
  { id: "overrun", name: "Overrun!", category: "Game" },
  { id: "sprout_to_stars", name: "Sprout to Stars", category: "Game" },
  { id: "bunny_bloom", name: "Bunny Bloom", category: "Game" },
  { id: "capybara", name: "Capybara", category: "Game" },
  { id: "world_conquer", name: "World Conquer", category: "Game" },
  { id: "noctara", name: "Noctara", category: "App" },
  { id: "carenote_cna", name: "CareNote CNA", category: "App" },
  { id: "still_here", name: "Still Here", category: "App" },
  { id: "liams_notes", name: "Liam’s Notes", category: "App" },
  { id: "petal_hours", name: "Petal Hours", category: "App" },
  { id: "studio", name: "Studio website", category: "Website", feedback: true }
].map(app => Object.freeze({ adapter: null, feedback: false, ...app }));
