import axios from 'axios';
import puppeteer from 'puppeteer';

export type SearchEngine = ReturnType<typeof createSearchEngine>;
export type SearchResults = Awaited<ReturnType<SearchEngine["fetchSearchResults"]>>;
export type SearchResult = SearchResults[number];

// We get the search queries from the AI.
// Sometimes it gives us a query surrounded in quotes like: '"the seach query"'
// This usually yeilds no search results
function removeQuotes(query: string) {
  try {
    return query.replace(/["']/g, '');
  } catch(err) {
    return query;
  }
}

export function createSearchEngine(key: string, cx: string) {
  const searchEngine = {
    fetchSearchResults: async (query: string) => {
      const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key,
          cx,
          q: query,
          num: 5,
        },
      });

      return data.items?.map((item: any) => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
      })) ?? [];
    },
    fetchSearchResultsQuotes: async (query: string) => {
      let res = await searchEngine.fetchSearchResults(query);
      if (!res.length) {
        console.log('[SEARCH] Got 0 results - try removing quotes', { query });
        res = await searchEngine.fetchSearchResults(removeQuotes(query));
      }
      if (!res.length) {
        console.log('[SEARCH] Could not get any results, returning empty array', { query });
        return [];
      }
      return res;
    },
    fetchMultiSearchResults: async (queries: string[]) => {
      let results: SearchResults = [];
      for (const query of queries) {
        const res = await searchEngine.fetchSearchResultsQuotes(query);
        results = [...results, ...res];
      }
      return results;
    },
    fetchRenderedContent: async (url: string) => {
      try {
        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        const text = await page.evaluate(() => document.body.innerText);

        await browser.close();
        return text;
      } catch(ex) {
        return 'Could not fetch content';
      }
    },
  };
  return searchEngine;
};
