# 🛰️ Polarsteps Telegram Bot

A daily nostalgia bot that selects a random day from your Polarsteps trip and sends you a memory from that day - text and photos included!

This is a bot that sends you a random entry from your [Polarsteps](https://www.polarsteps.com/) trip once a day via Telegram.
Each message includes the original text and a few random photos from that day.

Perfect for reliving your travel memories or sharing daily throwbacks with others!

The bot also uses AI (Gemini) to add an interesting, related fact or piece of trivia about the place or activity from that day.
It also uses Google Search to enrich the context with relevant information from the web.
There are 2 AI messages:
- "Did you know?" - a message that focuses on general information related to the step.
- "Local news" - a message that focuses on more recent news related to the step.

And the best part is - it is **completely free** to run it! All the APIs used in this project are free:
Gemini (free tier), Google search API, Telegram bot API, Github Actions.

This project is written in TypeScript and runs locally or on a GitHub Actions schedule.

---

## ✨ Features

- Randomly selects a day from your Polarsteps trip  
- Fetches photos and text from that day  
- Sends a Telegram message with a curated memory  
- Generates a related fun fact using AI, and sends it as well
- Supports both images and videos (requires `ffmpeg`)
- Runs once per day using GitHub Actions

---

## 🛠️ Requirements

- Node.js ≥ 22
- `ffmpeg` (for video/media processing)
- [Telegram Bot](https://core.telegram.org/bots)
- Gemini api key
- Google Custom Search api key

---

## ⚙️ Setup

1. **Install dependencies:**

```bash
npm install
```

2. **Install `ffmpeg`:**

The bot uses `ffmpeg` to handle video conversion. Make sure it's installed and accessible in your system path.

3. **Create `bot-config.json`:**
    - For running locally, create `bot-config.json` in the project root.
    - For running in Github Actions, create `BOT_CONFIG_JSON` as a secret, with the same contents of the `bot-config.json`.
    - See [⚙️ `bot-config.json` Format](#️-bot-configjson-format) below for more details.

4. **Download your Polarsteps trips data:**
    - Go to Polarsteps > Account Settings > Download my data.
    - After the download is finished, extract the zip into the root of this repo, under `user_data` directory.

---

## 🚀 Usage

Run the bot using one of the following CLI options:

```bash
npm start -- bot            # Send a Telegram memory from a random day
npm start -- bot-dry        # Dry run - does not send results to telegram
```

---

## ⚙️ `bot-config.json` Format

Create a file named `bot-config.json` in the root of your project (this file is **not committed** to Git).
It contains your secret tokens and trip configuration:

```json
{
  "bot": {
    "language": "English"
  },
  "polarsteps": {
    "trips": [
      {
        "trip_id": "your_trip_id_here",
        "album_secret": "?s=your_album_secret_here"
      },
      {
        // another trip
      }
    ]
  },
  "telegram_bot": {
    "token": "your_telegram_bot_token",
    "chat_id": "your_telegram_chat_id"
  },
  "gemini": {
    "api_key": "YOUR_API_KEY"
  },
  "google_search": {
    "api_key": "YOUR_API_KEY",
    "custom_search_engine_id": "CX"
  }
}
```

### Description of fields:

- `bot.language`: The language the bot will use when sending you Telegram messages.
- `polarsteps.trips[].trip_id`: Your Polarsteps trip identifier (from the trip URL).
- `polarsteps.trips[].album_secret`: Found in the public sharing link. allows access to the trip data.
- `telegram_bot.token`: Your Telegram bot's token (from [BotFather](https://t.me/BotFather)).
- `telegram_bot.chat_id`: The chat ID where the bot should send messages (use `@yourusername` or a numeric ID).
- `gemini.api_key`: Your API key for accessing Google Gemini services, such as AI-powered content generation or analysis.
- `google_search.api_key`: The API key used to authenticate requests to the Google Custom Search API.
- `google_search.custom_search_engine_id`: Your unique identifier for the custom search engine (CSE) configured via the Google Programmable Search Engine dashboard.

### Gemini

You’ll need a **free Gemini API key**:

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey) and create a key.
2. Add it to your `bot-config.json`

### Google Search

You’ll need a **Custom Search API key** and **CSE ID**:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/library/customsearch.googleapis.com) and enable the Custom Search API.
2. Create a key under "Credentials".
3. Set up a Custom Search Engine at [programmablesearchengine.google.com](https://programmablesearchengine.google.com/) and get its ID.
4. Add both to your `bot-config.json`

---

## 📦 Deployment (Free Hosting with GitHub Actions)

You can schedule the bot to run once a day using GitHub Actions.

### Step 1: Add `BOT_CONFIG_JSON` as a secret

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New secret**
3. **Name**: `BOT_CONFIG_JSON`
4. **Value**: Paste the contents of your `bot-config.json` file

### Step 2: GitHub Actions Workflow

This project includes `.github/workflows/bot.yml` which runs the bot once a day

---

## 📷 Sample Output

```
📍 Queenstown

🗓 Day 70 - December 8, 2024
🌍 Hillgrove, New Zealand
🌤 clear day | 25°C
🖼 29 photos | 🎥 3 videos

We spent the day hiking around Ben Lomond. The views from the saddle were insane, and we even spotted a few kea! 🦜

[photo1.jpg]
[video2.jpg]
[photo3.jpg]

🌟 _Did you know?_ Some fun fact...
🎤 _Local News:_ Some recent news...
```

---

## ❤️ Credits

Created by Malkiz. Inspired by long adventures and the joy of reliving them, one day at a time.

Read the [blog post](https://malkiz.github.io/2025/07/12/polarsteps-telegram-bot/).
