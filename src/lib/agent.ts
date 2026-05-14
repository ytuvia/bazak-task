import {
  Annotation,
  StateGraph,
  END,
  START,
  messagesStateReducer,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  SystemMessage,
} from '@langchain/core/messages';
import { ALL_TOOLS } from './tools';
import { getPreferences } from './store';
import { fetchCategories } from './dummyjson';
import type { BaseCheckpointSaver } from '@langchain/langgraph';

let _categoryNames: string[] | null = null;

async function getCategoryNames(): Promise<string[]> {
  if (!_categoryNames) {
    try {
      const cats = await fetchCategories();
      _categoryNames = cats.map(c => c.name);
    } catch (err) {
      console.error('[agent] failed to fetch categories for prompt:', err);
      _categoryNames = [];
    }
  }
  return _categoryNames;
}

export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (_, next: string) => next,
    default: () => '',
  }),
});

export type AgentState = typeof StateAnnotation.State;

const SYSTEM_PROMPT = `You are a helpful shopping assistant. Help users discover products through conversation.

Tool usage guidelines:
- Use search_products when the user describes a specific product name or attributes (e.g. "wireless headphones", "blue sneakers").
- Use browse_category when the user expresses general interest in a category (e.g. "show me beauty products", "what phones do you have?").
- Use list_categories when the user asks what's available (e.g. "what do you sell?", "what categories exist?").
- Use get_product when the user asks for details on a specific product mentioned earlier in the conversation.
- Use save_preference when the user reveals a stable preference like budget range, brand, or category interest.
- If the user's request is too vague, respond conversationally asking them to clarify — e.g. suggest a category from those listed at the end of this prompt.

After retrieving products, select and present the 3–5 most relevant based on the user's full intent, including any price constraints or stated preferences.
If a tool returns no results or an error, respond conversationally — suggest alternatives or ask the user to refine the query. Never present an empty product list.`;

function buildSystemPrompt(preferences: Record<string, string>, summary: string, categories: string[]): string {
  const parts = [SYSTEM_PROMPT];
  if (categories.length > 0) {
    parts.push(`\nAvailable categories: ${categories.join(', ')}`);
  }
  if (Object.keys(preferences).length > 0) {
    parts.push(
      `\nUser preferences: ${Object.entries(preferences)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')}`
    );
  }
  if (summary) {
    parts.push(`\n[Internal context — do not mention or reproduce this in your response]: ${summary}`);
  }
  return parts.join('');
}

async function agentNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  const preferences = getPreferences();
  const categories = await getCategoryNames();
  const systemPrompt = buildSystemPrompt(preferences, state.summary, categories);

  const model = new ChatOpenAI({
    model: process.env.AGENT_MODEL ?? 'gpt-4o-mini',
    streaming: true,
  }).bindTools(ALL_TOOLS);

  const window = parseInt(process.env.AGENT_MESSAGE_WINDOW ?? '20', 10);
  const windowed = state.messages.slice(-window);
  const messages = [new SystemMessage(systemPrompt), ...windowed];
  const response = await model.invoke(messages);

  return { messages: [response] };
}

async function summarizeNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  const summaryModel = new ChatOpenAI({
    model: process.env.SUMMARY_MODEL ?? 'gpt-4o-mini',
  });

  const conversationText = state.messages
    .map(m => `${m._getType()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n');

  const res = await summaryModel.invoke([
    new HumanMessage(
      `Summarize this conversation concisely, preserving product preferences, items discussed, and context:\n\n${conversationText}`
    ),
  ]);

  const summary = typeof res.content === 'string' ? res.content : '';

  return { summary };
}

export function shouldSummarize(
  state: { messages: BaseMessage[]; summary: string }
): string {
  const threshold = parseInt(
    process.env.SUMMARY_MESSAGE_THRESHOLD ?? '10',
    10
  );
  return state.messages.length > threshold ? 'summarize' : END;
}

function shouldContinue(state: typeof StateAnnotation.State): string {
  const last = state.messages[state.messages.length - 1];
  if (last instanceof AIMessage && (last.tool_calls?.length ?? 0) > 0) return 'tools';
  if (last instanceof AIMessageChunk && (last.tool_call_chunks ?? []).some(tc => !!tc.name)) return 'tools';
  return shouldSummarize(state);
}

const toolsNode = new ToolNode(ALL_TOOLS);

export function createGraph(checkpointer?: BaseCheckpointSaver) {
  const graph = new StateGraph(StateAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('summarize', summarizeNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      summarize: 'summarize',
      [END]: END,
    })
    .addEdge('tools', 'agent')
    .addEdge('summarize', END);

  return graph.compile({ checkpointer });
}
