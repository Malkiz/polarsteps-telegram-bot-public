import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import * as ai from './ai.js';
import * as search from './search.js';
import { Step, TripConfig, TripData, BotConfig } from './types.js';
import * as polarsteps from './polarsteps.js';
import * as telegram from './telegram.js';
import * as files from './files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(__dirname, '..');
const CONFIG_PATH = path.join(CONFIG_DIR, 'bot-config.json');
let config: BotConfig;

async function loadConfig() {
  try {
    const configJson = await fs.promises.readFile(CONFIG_PATH, 'utf-8');
    const configData = JSON.parse(configJson);
    config = configData;
  } catch (error) {
    console.error('[CONFIG] Error reading bot config:', error);
    throw error;
  }
}

function getRandomItems<T>(arr: T[], count: number): T[] {
  return [...arr]
    .sort(() => Math.random() - 0.5) // shuffle
    .slice(0, count);
}

async function bot(trip: TripConfig, data: TripData, dryRun = false) {
  const all_steps: Step[] = data.steps;
  
  const first_step = all_steps[0];
  const currentIndex = Math.floor(Math.random() * all_steps.length);
  const random_step = all_steps[currentIndex];

  const message = polarsteps.formatStepMessage(trip, data, random_step, first_step);
  console.log('[BOT]', message);
  if (!dryRun) {
    await telegram.sendMessage(config.telegram_bot, message);
    await telegram.sendMediaGroup(config.telegram_bot, getRandomItems(random_step.media, 5));
  }

  const nearbySteps = polarsteps.getNearbySteps(all_steps, currentIndex);
  const contextText = polarsteps.formatStepsForContext(nearbySteps);
  const searchEngine = search.createSearchEngine(config.google_search.api_key, config.google_search.custom_search_engine_id);
  const gemini = await ai.createGeminiModel(config.gemini.api_key, searchEngine, config.bot?.language);
  const aiMessages = await gemini.runAllPrompts(message, contextText);
  aiMessages.forEach(m => console.log('[BOT]', m));
  if (!dryRun) {
    for (const aiMessage of aiMessages) {
      await telegram.sendMessage(config.telegram_bot, aiMessage);
    }
  }

  console.log('[BOT] done!');
}

async function main() {
  await loadConfig();
  const tripIndex = process.argv[3];
  const { trip, data } = await files.getTripData(config.polarsteps, tripIndex);

  const command = process.argv[2];
  switch (command) {
    case 'bot':
      await bot(trip, data);
      break;

    case 'bot-dry':
      await bot(trip, data, true);
      break;

    default:
      console.log('Usage: npm start -- [bot | bot-dry] [trip_index]');
  }
}

main();
