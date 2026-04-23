import type { Profile } from "@/types/profile";

export function buildSearchText(
  profile: Pick<
	Profile,
	| "name"
	| "xId"
	| "team"
	| "interests"
	| "favorites"
	| "foodTokens"
	| "placeTokens"
	| "clubTokens"
	| "recentTokens"
	| "recommendation"
	| "topics"
	| "message"
  >
) {
  return [
	profile.name,
	profile.xId,
	profile.team,
	...profile.interests,
	...profile.favorites,
	...profile.foodTokens,
	...profile.placeTokens,
	...profile.clubTokens,
	...profile.recentTokens,
	profile.recommendation,
	profile.topics,
	profile.message,
  ]
	.filter(Boolean)
	.join(" ");
}

export function normalizeList(items: string[]) {
  const seen = new Set<string>();

  return items
	.map((item) => item.trim())
	.filter(Boolean)
	.filter((item) => {
  	const key = item.toLowerCase();
  	if (seen.has(key)) return false;
  	seen.add(key);
  	return true;
	});
}