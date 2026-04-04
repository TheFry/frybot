import { jest } from '@jest/globals';
import type {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalMessageModalSubmitInteraction,
  ButtonComponent
} from 'discord.js';

export interface MockInteractionOptions {
  id?: string;
  queryString?: string | null;
  booleanNext?: boolean | null;
  channelId?: string | null;
  guildId?: string;
  replied?: boolean;
}

export interface MockMessage {
  awaitMessageComponent: ReturnType<typeof jest.fn>;
}

export function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function createMockMessage(): MockMessage {
  return {
    awaitMessageComponent: jest.fn<() => Promise<unknown>>(),
  };
}

export function createMockInteraction(options: MockInteractionOptions = {}): ChatInputCommandInteraction {
  const {
    id = '999999999',
    queryString = 'test query',
    booleanNext = false,
    channelId = '123456789',
    guildId = '987654321',
    replied = false,
  } = options;

  const mockMessage = createMockMessage();

  const interaction = {
    id,
    replied,
    commandName: '',
    isChatInputCommand: jest.fn<() => boolean>().mockReturnValue(true),
    isModalSubmit: jest.fn<() => boolean>().mockReturnValue(false),
    reply: jest.fn<() => Promise<MockMessage>>().mockResolvedValue(mockMessage),
    editReply: jest.fn<() => Promise<MockMessage>>().mockResolvedValue(mockMessage),
    showModal: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    awaitModalSubmit: jest.fn<() => Promise<unknown>>(),
    options: {
      getString: jest.fn<(name: string) => string | null>().mockImplementation((name: string) => {
        if (name === 'query') return queryString;
        return null;
      }),
      getBoolean: jest.fn<(name: string) => boolean | null>().mockImplementation((name: string) => {
        if (name === 'next') return booleanNext;
        return null;
      }),
    },
    member: {
      voice: { channelId },
      guild: { id: guildId },
    },
    client: {
      commands: new Map(),
    },
    createdTimestamp: Date.now(),
  } as unknown as ChatInputCommandInteraction;

  return interaction;
}

export function createMockButtonInteraction(customId: string, label?: string): ButtonInteraction {
  const mockMessage = createMockMessage();
  return {
    customId,
    component: { label: label || customId } as ButtonComponent,
    update: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    editReply: jest.fn<() => Promise<MockMessage>>().mockResolvedValue(mockMessage),
    reply: jest.fn<() => Promise<MockMessage>>().mockResolvedValue(mockMessage),
    showModal: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    awaitModalSubmit: jest.fn<() => Promise<unknown>>(),
    id: 'btn-interaction-id',
    replied: false,
    createdTimestamp: Date.now(),
  } as unknown as ButtonInteraction;
}

export function createMockModalSubmission(fields: Record<string, string>): ModalMessageModalSubmitInteraction {
  return {
    id: 'modal-submission-id',
    customId: 'modal-id',
    replied: false,
    createdTimestamp: Date.now(),
    isChatInputCommand: jest.fn<() => boolean>().mockReturnValue(false),
    isModalSubmit: jest.fn<() => boolean>().mockReturnValue(true),
    update: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    reply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    editReply: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    fields: {
      getTextInputValue: jest.fn<(id: string) => string>().mockImplementation((id: string) => {
        return fields[id] || '';
      }),
    },
  } as unknown as ModalMessageModalSubmitInteraction;
}
