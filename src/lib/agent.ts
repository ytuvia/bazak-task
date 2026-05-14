import {
  Annotation,
  StateGraph,
  END,
  START,
  messagesStateReducer,
  interrupt,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  SystemMessage,
  RemoveMessage,
} from '@langchain/core/messages';
import { ALL_TOOLS, AGENT_TOOLS, PRODUCT_TOOLS } from './tools';
import { getPreferences } from './store';
import type { BaseCheckpointSaver } from '@langchain/langgraph';

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

const SYSTEM_PROMPT = `You are a helpful shopping assistant. Help users discover products through conversation.

Tool usage guidelines:
- Use search_products when the user describes a specific product name or attributes (e.g. "wireless headphones", "blue sneakers").
- Use browse_category when the user expresses general interest in a category (e.g. "show me beauty products", "what phones do you have?").
- Use list_categories when the user asks what's available (e.g. "what do you sell?", "what categories exist?").
- Use get_product when the user asks for details on a specific product mentioned earlier in the conversation.
- Use save_preference when the user reveals a stable preference like budget range, brand, or category interest.
- If the user's request is too vague (no product type, category, or attribute mentioned), use request_clarification with a short clarifying question instead of guessing.

After retrieving products, select and present the 3–5 most relevant based on the user's full intent, including any price constraints or stated preferences.
If a tool returns no results or an error, respond conversationally — suggest alternatives or ask the user to refine the query. Never present an empty product list.`;

function buildSystemPrompt(preferences: Record<string, string>, summary: string): string {
  const parts = [SYSTEM_PROMPT];
  if (Object.keys(preferences).length > 0) {
    parts.push(
      `\nUser preferences: ${Object.entries(preferences)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')}`
    );
  }
  if (summary) {
    parts.push(`\nConversation summary: ${summary}`);
  }
  return parts.join('');
}

async function agentNode(
  state: typeof StateAnnotation.State
): Promise<Partial<typeof StateAnnotation.State>> {
  const preferences = getPreferences();
  const systemPrompt = buildSystemPrompt(preferences, state.summary);

  const model = new ChatOpenAI({
    model: process.env.AGENT_MODEL ?? 'gpt-4o-mini',
    streaming: true,
  }).bindTools(AGENT_TOOLS);

  const messages = [new SystemMessage(systemPrompt), ...state.messages];
  const response = await model.invoke(messages);

  // Handle request_clarification tool call via interrupt
  const clarificationCall = (response as AIMessage).tool_calls?.find(
    tc => tc.name === 'request_clarification'
  );
  if (clarificationCall) {
    const question = clarificationCall.args.question as string;
    const userReply = interrupt({ question }) as string;
    // Resume: retry with the user's clarification appended
    const retryModel = new ChatOpenAI({
      model: process.env.AGENT_MODEL ?? 'gpt-4o-mini',
      streaming: true,
    }).bindTools(PRODUCT_TOOLS);
    const retryMessages = [
      new SystemMessage(systemPrompt),
      ...state.messages,
      new HumanMessage(userReply),
    ];
    const retryResponse = await retryModel.invoke(retryMessages);
    return { messages: [new HumanMessage(userReply), retryResponse] };
  }

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

  // Keep last 4 messages, remove the rest
  const toRemove = state.messages
    .slice(0, -4)
    .filter(m => m.id != null)
    .map(m => new RemoveMessage({ id: m.id! }));

  return { summary, messages: toRemove };
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
  if (last instanceof AIMessage || last instanceof AIMessageChunk) {
    const toolCalls = (last as any).tool_calls ?? [];
    const toolCallChunks = (last as any).tool_call_chunks ?? [];
    const hasTools =
      toolCalls.length > 0 ||
      toolCallChunks.some((tc: any) => !!tc.name);
    if (hasTools) return 'tools';
  }
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
