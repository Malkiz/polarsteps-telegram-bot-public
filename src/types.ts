export enum MediaType {
  photo = 0,
  video = 1,
}

export type TripConfig = {
  trip_id: string;
  album_secret: string;
};

export type Step = {
  id: number;
  slug: string;
  start_time: string;
  location: {
    locality: string;
    full_detail: string;
  };
  timezone_id: string;
  name: string;
  description: string;
  weather_condition?: string;
  weather_temperature?: number;
  media: Array<{
    path: string;
    type: MediaType;
    order: number;
  }>;
  // other properties omitted for brevity
};

export type TripData = {
  id: string;
  name: string;
  slug: string;
  user: {
    username: string;
  };
  steps: Step[];
};

export type BotConfig = {
  bot: {
    language: string;
  };
  polarsteps: {
    trips: TripConfig[];
  };
  telegram_bot: {
    token: string;
    chat_id: string;
  };
  gemini: {
    api_key: string;
  };
  google_search: {
    api_key: string;
    custom_search_engine_id: string;
  };
};
