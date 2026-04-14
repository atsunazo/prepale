export type Profile = {
  id: string;
  order: number;
  slug: string;
  name: string;
  xId: string;
  interests: string[];
  favorites: string[];
  food: string;
  place?: string;
  club?: string;
  recent?: string;
  recommendation?: string;
  topics?: string;
  message: string;
  searchText: string;

