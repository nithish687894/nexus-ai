export function extractLinks(html: string, baseUrl: string) {
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => new URL(match[1], baseUrl).toString());
  return [...new Set(links)];
}

export function extractSemesterLinks(html: string, baseUrl = "https://thehelpers.tech") {
  return extractLinks(html, baseUrl).filter((url) => /\/semesters\/[1-8]\/?$/.test(new URL(url).pathname));
}

export function extractSubjectLinks(html: string, baseUrl = "https://thehelpers.tech") {
  return extractLinks(html, baseUrl).filter((url) => /\/semesters\/\d+\/subjects\/[^/]+\/?$/.test(new URL(url).pathname));
}
