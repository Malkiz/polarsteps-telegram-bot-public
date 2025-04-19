import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { BotConfig, MediaType, Step, TripConfig, TripData } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA = path.join(__dirname, '..', 'user_data');
const TRIPS_DATA = path.join(DATA, 'trip');

async function listSubdirectories(dir: string): Promise<string[]> {
  const names = await fs.promises.readdir(dir);
  const result: string[] = [];

  for (const name of names) {
    const fullPath = path.join(dir, name);
    const info = await fs.promises.stat(fullPath);
    if (info.isDirectory()) {
      result.push(fullPath);
    }
  }
  return result;
}

async function listFilesRecursive(dir: string, fileList: string[] = []): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await listFilesRecursive(full, fileList);
    } else {
      fileList.push(full);
    }
  }
  return fileList;
}

async function getAllTripsData(config: BotConfig["polarsteps"]) {
  const allTrips = await listSubdirectories(TRIPS_DATA);
  const trips = config.trips.map(t => allTrips.find(dir => dir.includes(t.trip_id))).filter(Boolean);
  return await Promise.all(trips.map(async t => {
    const tripPath = path.join(t!, 'trip.json');
    const tripJson = await fs.promises.readFile(tripPath, 'utf-8');
    const tripData = JSON.parse(tripJson);
    return tripData;
  }));
}


function weightedRandom(weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const threshold = Math.random() * total;

  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (threshold < cumulative) {
      return i;
    }
  }

  return weights.length - 1;
}

async function getStepMedia(step: any, trip: TripConfig): Promise<Step["media"]> {
  const allTrips = await listSubdirectories(TRIPS_DATA);
  const tripDir = allTrips.find(dir => dir.includes(trip.trip_id));
  const allSteps = await listSubdirectories(tripDir!);
  const stepDir = allSteps.find(dir => dir.includes(step.id));
  const mediaFiles = await listFilesRecursive(stepDir!);
  return mediaFiles.map(m => {
    return {
      path: m,
      type: m.endsWith('.jpg') ? MediaType.photo : MediaType.video,
      order: 0,
    };
  });
}

async function convertStepData(step: any, trip: TripConfig): Promise<Step> {
  const media = await getStepMedia(step, trip);
  return {
    id: step.id,
    slug: step.slug,
    start_time: new Date(step.start_time * 1000).toISOString(),
    location: {
      locality: step.location.name,
      full_detail: step.location.full_detail,
    },
    timezone_id: step.timezone_id,
    name: step.name,
    description: step.description,
    weather_condition: step.weather_condition,
    weather_temperature: step.weather_temperature,
    media,
  };
}

async function getUserData() {
  const userPath = path.join(DATA, 'user', 'user.json');
  const userJson = await fs.promises.readFile(userPath, 'utf-8');
  const userData = JSON.parse(userJson);
  return userData;
}

async function convertToTripData(tripFile: any, trip: TripConfig): Promise<TripData> {
  const user = await getUserData();

  return {
    id: tripFile.id,
    name: tripFile.name,
    slug: tripFile.slug,
    user: {
      username: user.username,
    },
    steps: await Promise.all(tripFile.all_steps.map((s: any) => convertStepData(s, trip))),
  };
}

export async function getTripData(config: BotConfig["polarsteps"], tripIndex: string) {
  let trips = config.trips;
  if (tripIndex !== undefined && tripIndex !== "") {
    trips = [trips[Number(tripIndex)]];
  }

  const allTripsData = await getAllTripsData(config);

  const tripsWeights = allTripsData.map(d => d.all_steps.length);
  const randomIndex = weightedRandom(tripsWeights);

  const trip = trips[randomIndex];

  return { trip, data: await convertToTripData(allTripsData[randomIndex], trip) };
}

export async function getMediaBuffer(type: 'video' | 'photo', media: Step["media"][number]) {
  const buffer = await fs.promises.readFile(media.path);
  return buffer;
}
