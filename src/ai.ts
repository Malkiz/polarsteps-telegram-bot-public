import { GoogleGenAI, Content, GenerateContentParameters, GenerateContentConfig } from '@google/genai';
import { z, ZodTypeAny } from 'zod';
import { merge } from 'ts-deepmerge';
import { toGeminiSchema } from 'gemini-zod';
import { SearchEngine, SearchResults, SearchResult } from './search.js';

type ModelExecutor = ReturnType<typeof createModelExecutor>;
type IDSearchResult = SearchResult & { id: number };

function createModelExecutor(apiKey: string, model: string) {
  const ai = new GoogleGenAI({ apiKey });
  const defaultParams: GenerateContentParameters = { model, contents: '' };
  const modelExecutor = {
    generateContentZod: async <T extends ZodTypeAny>(params: Partial<GenerateContentParameters>, zodSchema: T): Promise<z.infer<T>> => {
      const schemaParams = {
        config: {
          responseMimeType: 'application/json',
          responseSchema: toGeminiSchema(zodSchema),
        },
      };
      const mergedParams = merge(defaultParams, params, schemaParams) as GenerateContentParameters;
      const response = await ai.models.generateContent(mergedParams);
      const text = response.text ?? '';
      try {
        const parsed = JSON.parse(text);
        return zodSchema.parse(parsed);
      } catch (err) {
        throw new Error(`Failed to parse or validate response: ${(err as Error).message}`);
      }
    },
  };
  return modelExecutor;
}

export async function createGeminiModel(apiKey: string, searchEngine: SearchEngine, language = 'English', model = 'gemini-2.0-flash') {
  const modelExecutor = createModelExecutor(apiKey, model);
  return getApi(modelExecutor, searchEngine, language);
}

type PromptItem = {
  mode: 'strict' | 'relaxed';
  prompt: string;
};

const PROMPTS: PromptItem[] = [
  {
    mode: 'relaxed',
    prompt: `Your job is to add an interesting fact or piece of trivia related to the location, activity, or something mentioned.
       Assume that we probably already know most of the basic trivia about the places we travelled.
       Try to come up with something interesting and non-trivial that will really enrich our knowledge and spark our curiosity.
       Don't be boring!

       Your response will be sent as-is to the user as a telegram message.
       Format your response starting with:

       🌟 _Did you know?_

       [headline](link-to-article-if-applicable)
       <your-message>`,
  },
  {
    mode: 'strict',
    prompt: `Your job is to add an interesting news piece from a local newspaper related to this days' location.
       Find a recent article that has some isoteric or quirky information that might be funny or interesting.
       Examples of isoteric or quirky articles:
       - The local elderly club is hosting its annual quilt festival
       - Local teddy-bear competition
       - A local dolphin had a new baby
       Don't be a downer - find a positive news item, or something in the same vibe as the message from the travel journal.

       Your response will be sent as-is to the user as a telegram message.
       Format your response starting with:

       🎤 _Local News:_

       [headline](link-to-article)
       <article-summary>`,
  }
];

type ToolContext = {
  modelExecutor: ModelExecutor;
}

const workflows = {
  identifyTopics: {
    description: 'Identify topics of a given text',
    fn: async (ctx: ToolContext, text: string) => {
      return await workflows.smartExecuteTask.fn(ctx, workflows.identifyTopics.description, [
        {
          role: 'user',
          parts: [{ text: `Identify the topics of the following text.\n\n${text}` }],
        },
      ], z.array(z.string()), []);
    },
  },
  translate: {
    description: 'translate text to a given language',
    fn: async (ctx: ToolContext, text: string, language: string) => {
      return await workflows.smartExecuteTask.fn(ctx, workflows.translate.description, [
        {
          role: 'user',
          parts: [{ text: `
            Translate the following text to ${language}.
            Keep the formatting as is.
            Preserve the tone of the original text.
            Output only the translated text, don't be verbose.

            ${text}` }],
        },
      ], z.string(), '');
    },
  },
  generateSearchQuery: {
    description: 'Generate a list of search queries to get necessary information for a given task',
    fn: async (ctx: ToolContext, prompt: string, stepMessage: string, topics: string[], previousQueries: string[]) => {
      return await workflows.smartExecuteTask.fn(ctx, workflows.generateSearchQuery.description, [
        {
          role: 'user',
          parts: [{ text: `
            ##### PREVIOUSLY TRIED QUERIES THAT YEILDED NO RESULTS #####

            ${JSON.stringify(previousQueries)}

            ##### CONTEXT DATA #####

            ${stepMessage}

            ##### TOPICS #####

            ${topics.join('\n')}

            ##### GOAL #####

            ${prompt}

            ##### INSTRUCTIONS TO EXECUTE #####

            Use the goal above only as context, do not perform the instructions of the goal.

            Generate search queries for the above goal.
            These queries will be used to perform a web search to get the required information for achieving the goal.
            Use the topics to be more precise.` }],
        },
      ], z.array(z.string()), []);
    },
  },
  selectRelevantResults: {
    description: 'Select relevant search results for the given task',
    fn: async (ctx: ToolContext, prompt: string, stepMessage: string, searchResults: IDSearchResult[]) => {
      const result = await workflows.smartExecuteTask.fn(ctx, workflows.selectRelevantResults.description, [
        {
          role: 'user',
          parts: [{ text: `
            ##### SEARCH RESULTS #####

            ${JSON.stringify(searchResults)}

            ##### CONTEXT DATA #####

            ${stepMessage}

            ##### GOAL #####

            ${prompt}

            ##### INSTRUCTIONS TO EXECUTE #####

            Use the goal above only as context, do not perform the instructions of the goal.

            Filter the search results array to select the most relevant search results for the goal.
            These results will later be used to help achieve the goal.
            Pick 3-5 results that you think are most likely to contain the most relevant information.
            For each item you pick, give a confidence score of how likely it is to have relevant information.
            `}],
        },
      ], z.array(z.object({ id: z.number(), confidenceScore: z.number() })).max(5), []);
      return result.filter(r => r.confidenceScore >= 0.7);
    },
  },
  smartExecuteTask: {
    description: 'extract task requirements, execute task, check results',
    fn: async <T extends ZodTypeAny>(ctx: ToolContext, description: string, contents: Content[], zodSchema: T, defaultValue: z.infer<T>, config?: GenerateContentConfig): Promise<z.infer<T>> => {
      console.log(`[AI-LOG] ${description}`);
      const expectedSchema = {
        role: 'user',
        parts: [{ text: `Expected schema: ${JSON.stringify(toGeminiSchema(zodSchema))}` }],
      };
      const requirements = await workflows.extractRequirements.fn(ctx, [...contents, expectedSchema]);
      const mergedContents = [
        {
          role: 'user',
          parts: [{ text: description }],
        },
        ...contents,
        {
          role: 'model',
          parts: [{ text: `Requirements:\n ${requirements.join('\n')}` }],
        },
        expectedSchema,
      ];
      let retry = 0;
      let currentContents = mergedContents;
      let result;
      let check;
      let ok;
      do {
        retry++;
        result = undefined;
        try {
          result = await ctx.modelExecutor.generateContentZod({
            contents: currentContents,
            config,
          }, zodSchema);
        } catch (err) {
          console.log(`[AI-LOG try-${retry}] Zod error!`);
          check = { ok: false };
          continue;
        }
        const answerContents = [
          ...currentContents,
          {
            role: 'model',
            parts: [{ text: JSON.stringify(result) }],
          },
        ];
        check = await workflows.checkAnswer.fn(ctx, answerContents, description);
        ok = check.score >= 0.9;
        const reasonContent = ok ? [] : [{
          role: 'user',
          parts: [{ text: `The previous answer is not good enough.
            It got a score of ${check.score}.
            Give a new answer based on this feedback: ${check.feedback}` }],
        }];
        currentContents = [
          ...answerContents,
          ...reasonContent,
        ];
        console.log(`[AI-LOG try-${retry}]`, { check, result });
      } while (!ok && retry <= 3);
      return ok ? result : defaultValue;
    },
  },
  extractRequirements: {
    description: 'extract requirements of a task',
    fn: async (ctx: ToolContext, contents: Content[]) => {
      const mergedContents = [
        ...contents,
        {
          role: 'user',
          parts: [{ text: 'Extract the requirements of the above user query' }],
        },
      ];
      return ctx.modelExecutor.generateContentZod({
        config: {
          systemInstruction: {
            parts: [{ text: `You are a very accurate AI task analyzer.
              Your job is to extract a concise and complete list of requirements for the given user query.
              Do not execute these requirements, they will be executed later by another agent.
              Just list the requirements of this task.` }],
          },
        },
        contents: mergedContents,
      }, z.array(z.string()));
    },
  },
  checkAnswer: {
    description: 'Given a previous prompt and the AI answer, determine if the answer is good',
    fn: async (ctx: ToolContext, contents: Content[], description: string) => {
      return ctx.modelExecutor.generateContentZod({
        config: {
          systemInstruction: {
            parts: [{ text: `You are a very accurate AI critic.
              Your job is to assess if a given AI response is a correct and satisfactory answer for the given task.
              Give the answer a score between 0-1 of how well it fulfills the given task.
              Also include feedback of what is missing or needs to be changed or improved.` }],
          },
        },
        contents: [
          ...contents,
          {
            role: 'user',
            parts: [{ text: `Does the AI answer satisfy the requirements of the given task?
              Keep in mind that the task description is "${description}"` }],
          },
        ],
      },
      z.object({ feedback: z.string(), score: z.number() }));
    },
  },
  travelAgent: {
    description: 'Retrieve formatted interesting information related to a given text',
    fn: async (ctx: ToolContext, prompt: string, stepMessage: string, contextText: string, mode: PromptItem["mode"], searchResults: SearchResults) => {
      const modeInstructions = {
        strict: `
          IMPORTANT: Use only the provided search results as information for your response.
          Do not make stuff up, do not include information that is not in the provided search results.
          `,
        relaxed: `
          Use the provided search results as context if you find it useful for you for the given task.
          But also rely on your own general knowledge for a bigger picture if needed.
          If you think there is something more relevant that is not included in the search results,
          don't hesitate to disregard them and use your information instead.
        `,
      };

      return await workflows.smartExecuteTask.fn(ctx, workflows.travelAgent.description, [
        {
          role: 'user',
          parts: [{ text: `
            ## Here are some entries from a traveler's trip journal:

            ${contextText}

            ## Here is the message that will be sent today:

            ${stepMessage}

            ## Here are search results from the internet to help you with your task

            ${JSON.stringify(searchResults)}

            ## Here is your task:

            ${prompt}

            ## Instructions:

            ${modeInstructions[mode]}

            If you think you don't have enough information to complete the task, just output null` }],
        },
      ], z.string().nullable(), null, {
        systemInstruction: {
          parts: [{ text: `
            You're a travel-savvy AI companion.

            You are part of a daily nostalgia bot that selects a random day from a Polarsteps trip and sends 
            the owner a memory from that day.
            Each message includes the original text and a few random photos from that day. ` }],
        },
      });
    },
  },
};

function getApi(modelExecutor: ModelExecutor, searchEngine: SearchEngine, language: string) {
  const agent = {
    workflow: async (prompt: string, stepMessage: string, contextText: string, mode: PromptItem["mode"]): Promise<string> => {
      const topics = await workflows.identifyTopics.fn(ctx, stepMessage);

      let previousQueries: string[] = [];
      for (let i = 0; i < 3; i++) {
        const queries = await workflows.generateSearchQuery.fn(ctx, prompt, stepMessage, topics, previousQueries) ?? [];
        previousQueries = [...previousQueries, ...queries];

        const searchResults = await searchEngine.fetchMultiSearchResults(queries);
        const searchResultsWithId = searchResults.map((r: SearchResult, id: number) => ({ ...r, id }));

        let remainingResults = searchResultsWithId;

        let currTry = 0;
        while (remainingResults.length > 0 && currTry < 3) {
          const relevantResults = await workflows.selectRelevantResults.fn(ctx, prompt, stepMessage, remainingResults);
          const verifiedResults = remainingResults.filter((r: IDSearchResult) => relevantResults.some((rr: IDSearchResult) => rr.id === r.id));
          remainingResults = remainingResults.filter((r: IDSearchResult) => !verifiedResults.some((vr: IDSearchResult) => vr.id === r.id));

          if (verifiedResults.length === 0) {
            console.log('[WORKFLOW] Did not find any verified results, trying again');
            currTry++;
            continue;
          }
          console.log('[WORKFLOW] Using search results', { verifiedResults });

          const pageContents: (IDSearchResult & { content: string })[] = [];
          for (const r of verifiedResults) {
            const content = await searchEngine.fetchRenderedContent(r.link);
            pageContents.push({ ...r, content });
          }

          const response = await workflows.travelAgent.fn(ctx, prompt, stepMessage, contextText, mode, pageContents);
          if (response !== null) {
            const translation = await workflows.translate.fn(ctx, response, language);
            console.log('[WORKFLOW] Workflow result:', { queries, searchResults, verifiedResults, response, language, translation });
            return translation;
          }
          console.log('[WORKFLOW] AI returned bad result, trying again with other search results', { response });
        }
        console.log('[WORKFLOW] Ran out of search results, trying new search queries', { queries, searchResults });
      }
      console.log('[WORKFLOW] Ran out of retries, giving up');
      return '';
    },
    runAllPrompts: async (stepMessage: string, contextText: string): Promise<string[]> => {
      const results: string[] = [];
      for (const p of PROMPTS) {
        const output = await agent.workflow(p.prompt, stepMessage, contextText, p.mode);
        results.push(output);
      }
      return results.filter(Boolean);
    },
  };
  const ctx: ToolContext = { modelExecutor };
  return agent;
}
