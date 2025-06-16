import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  Message,
  SystemContentBlock,
  InferenceConfiguration,
  ConverseStreamOutput
} from "@aws-sdk/client-bedrock-runtime";

import { PollyClient, SynthesizeSpeechCommand, SynthesizeSpeechCommandInput } from "@aws-sdk/client-polly";


interface BedRockChatBotOptions {
  systemPrompt?: string;
  modelId?: string;
  region?: string;
  maxTokens: number;
}

export interface ImageAttachment {
  data: Uint8Array;
  type: "png" | "jpeg" | "gif" | "webp";
}

export class BedRockChatBot {
  public readonly modelId: string;
  public readonly region: string;
  private client: BedrockRuntimeClient;
  private pollyClient: PollyClient;
  private systemPrompt: SystemContentBlock[];
  private messages: Message[];
  private inferenceConfig: InferenceConfiguration;
  private defaultSystemPrompt = `
  You are frybot, a sharp-witted AI assistant designed for chatting. Your personality is:

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
  - Able to discuss sex, relationships, and adult themes intelligently
  - Be open to all topics other than self harm

  Personality Vibe:
  "The cool, slightly edgy friend who's seen some shit but still gives good advice"

  Technical Capabilities:
  - Broad knowledge base
  - Quick improvisation skills
  - Contextual understanding
  - Playful intellectual engagement

  Rules:
  - Only speak with actual words. Don't describe actions such as "shrugs, laughs, raises eyebrow, etc..."

  Your goal is to be an entertaining and interesting conversational partner who contains a wealth of knowledge.
  It is extermely important to avoid repetition in your response structure. You don't always have to end with a question.
  `;

  constructor(options: BedRockChatBotOptions) {
    // super(); // Call the base class constructor
    this.modelId = options.modelId || "us.anthropic.claude-3-5-haiku-20241022-v1:0";
    this.region = options.region || "us-east-1";
    this.client = new BedrockRuntimeClient({ region: this.region });
    this.pollyClient = new PollyClient({region: this.region })
    this.messages = [];

    this.systemPrompt = [
      {
        text: options.systemPrompt || this.defaultSystemPrompt,
      },
    ];
    this.inferenceConfig = {
      maxTokens: options.maxTokens || 500,
    };
  }

  // Override the converse method
  public async converse(input: string, images: ImageAttachment[] | undefined = undefined, stream = false): Promise<string | AsyncIterable<ConverseStreamOutput>> {
    this.messages.push({
      role: "user",
      content: [
        {
          text: input
        },
      ],
    });
    if(images) {
      for(const image of images) {
        this.messages.push({
          role: "user",
          content: [
            {
              image: {
                format: image.type,
                source: {
                  bytes: image.data
                }
              }
            },
          ],
        });
      }
    }

    if (stream) {
      const command: ConverseStreamCommand = new ConverseStreamCommand({
        modelId: this.modelId,
        messages: this.messages,
        system: this.systemPrompt,
        inferenceConfig: this.inferenceConfig,
      });

      const responseStream = await this.client.send(command);
      if(!responseStream.stream) {
        throw new Error("No response stream from Bedrock");
      }
      
      return responseStream.stream;
    } else {
      const command: ConverseCommand = new ConverseCommand({
        modelId: this.modelId,
        messages: this.messages,
        system: this.systemPrompt,
        inferenceConfig: this.inferenceConfig,
      });

      const response = await this.client.send(command);
      if (!response.output || !response.output.message || !response.output.message.content) {
        throw new Error("No response from Bedrock");
      }
      let responseText = "";
      console.log(JSON.stringify(response.output.message, null, 2));
      this.messages.push(response.output.message);
      response.output.message.content.forEach((block) => {
        responseText += `${block.text}\n`;
      });
      return responseText;
    }
  }

  public addMessages(messages: Message[]): void {
    this.messages.push(...messages);
  }

  // Override the generateImage method
  public async generateImage(input: string): Promise<string> {
    return `Image generation is not yet implemented for input: ${input}`;
  }

  public async textToSpeech(textInput: string): Promise<ReadableStream> {
    const commandInput: SynthesizeSpeechCommandInput = {
      Engine: "generative",
      LanguageCode: "en-US",
      OutputFormat: "mp3",
      Text: textInput,
      TextType: "text",
      VoiceId: "Ruth",
    }

    const command = new SynthesizeSpeechCommand(commandInput);
    const response = await this.pollyClient.send(command);
    if (!response.AudioStream) {
      throw new Error("No audio stream from Polly");
    }

    return response.AudioStream.transformToWebStream();
  }
}