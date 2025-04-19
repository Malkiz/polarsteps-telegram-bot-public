import { TripConfig, Step, MediaType, TripData } from "./types.js";

export function formatStepMessage(trip: TripConfig, data: TripData, step: Step, first_step: Step) {
  const album_link = `https://www.polarsteps.com/${data.user.username}/${data.id}-${data.slug}/`;
  const description = step.description.trim();

  const startDate = new Date(step.start_time);
  const firstDate = new Date(first_step.start_time);

  const dayNumber = Math.floor((startDate.getTime() - firstDate.getTime()) / 86400000) + 1;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: step.timezone_id,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const day = `🗓 Day ${dayNumber} — ${formatter.format(startDate)}`;

  const location = `🌍 ${step.location.locality}, ${step.location.full_detail}`;

  const weather = step.weather_condition && step.weather_temperature !== undefined
    ? `🌤 ${step.weather_condition.replace(/-/g, ' ')} | ${step.weather_temperature}°C`
    : null;

  const videoCount = step.media.filter(f => f.type === MediaType.video).length;
  const photoCount = step.media.filter(f => f.type === MediaType.photo).length;

  const mediaSummary = `🖼 ${photoCount} photo${photoCount !== 1 ? 's' : ''} | 🎥 ${videoCount} video${videoCount !== 1 ? 's' : ''}`;

  const linkToStep = `${album_link}${step.id}-${step.slug}${trip.album_secret}`;
  const tripTitle = `🗺️ ${data.name}`;
  const title = `📍 [${step.name}](${linkToStep})`;

  return [
    tripTitle,
    title,
    ' ',
    day,
    location,
    weather,
    mediaSummary,
    ' ',
    description,
  ]
    .filter(Boolean)
    .join('\n');
}

export function getNearbySteps(all_steps: Step[], currentIndex: number, windowSize = 3): Step[] {
  const start = Math.max(0, currentIndex - windowSize);
  const end = Math.min(all_steps.length, currentIndex + windowSize);
  return all_steps.slice(start, end);
}

export function formatStepsForContext(steps: Step[]): string {
  return steps
    .map((s, idx) => `Step ${idx + 1}: ${s.name} (${s.start_time})\n${s.description}`)
    .join("\n\n");
}
