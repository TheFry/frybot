import { ChatBot } from "./ChatBot";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  Message,
  SystemContentBlock,
  InferenceConfiguration
} from "@aws-sdk/client-bedrock-runtime";

interface BedRockChatBotOptions {
  systemPrompt?: string;
  modelId?: string;
  region?: string;
  maxTokens: number;
}

export class BedRockChatBot extends ChatBot {
  public readonly modelId: string;
  public readonly region: string;
  private client: BedrockRuntimeClient;
  private systemPrompt: SystemContentBlock[];
  private messages: Message[];
  private inferenceConfig: InferenceConfiguration;
  private defaultSystemPrompt = `
  You are frybot, a sharp-witted AI assistant designed for an adult-oriented Discord server. Your personality is:

  Core Traits:
  - Intelligent and quick-witted
  - Comfortable with mature themes but not gratuitous
  - Irreverent without being cruel
  - Adaptive conversationalist

  Communication Guidelines:
  - Speak in a conversational tone: think smart friend, not academic paper
  - Use occasional witty/sarcastic humor 
  - Match the energy of the person you're talking to
  - Be direct and unfiltered, but always maintain basic respect
  - Understand nuanced social cues and context

  Interaction Boundaries:
  - Engage with NSFW topics naturally, but avoid being explicitly graphic
  - No judgment, but also no encouragement of harmful behavior
  - Respect individual comfort levels
  - Able to discuss sex, relationships, and adult themes intelligently
  - Decline interactions that feel genuinely abusive or non-consensual

  Personality Vibe:
  "The cool, slightly edgy friend who's seen some shit but still gives good advice"

  Technical Capabilities:
  - Broad knowledge base
  - Quick improvisation skills
  - Contextual understanding
  - Playful intellectual engagement

  Always prioritize being an entertaining and interesting conversational partner.
  `

  constructor(options: BedRockChatBotOptions) {
    super();
    this.modelId = options.modelId || "us.anthropic.claude-3-5-haiku-20241022-v1:0";
    this.region = options.region || "us-east-1";
    this.client = new BedrockRuntimeClient({ region: this.region });
    this.messages = [];

    this.systemPrompt = [{
      text: options.systemPrompt || this.defaultSystemPrompt
    }];
    this.inferenceConfig = {
      maxTokens: options.maxTokens || 500
    }
  }

  public async converse(newMessage: string) {
    this.messages.push({
      role: "user",
      content: [
        {
          text: newMessage
        }
      ]
    })
    const command: ConverseCommand = new ConverseCommand({
      modelId: this.modelId,
      messages: this.messages,
      system: this.systemPrompt,
      inferenceConfig: this.inferenceConfig
    });
    const response = await this.client.send(command);
    if(!response.output || ! response.output.message || !response.output.message.content) {
      throw new Error("No response from Bedrock");
    }
    let responseText = "";
    this.messages.push(response.output.message);
    response.output.message.content.forEach(block => {
      responseText += `${block.text}\n`;
    });
    return responseText;
  }
}

export async function generateSystemPrompt(botPrompt: string) {
  const systemPrompt = `
  You are a world class prompt engineer specializing in the claude haiku model.
  You generate detailed system prompts for other bots to use in their conversations.
  Your goal is to provide a clear, concise, and engaging prompt that helps the user understand the bot's capabilities, limitations, conversation style, and emotion.
  `
  const bot = new BedRockChatBot({ maxTokens: 1000, systemPrompt: systemPrompt });
  const response = await bot.converse(botPrompt);
  return response;
}