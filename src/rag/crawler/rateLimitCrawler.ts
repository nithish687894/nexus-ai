export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withCrawlerDelay(delayMs = 500) {
  await sleep(delayMs);
}
