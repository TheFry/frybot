import { load, SecretTypes, CommandProcessorSecretOptions, VoiceBotSecretOptions, loadFromSecretString } from '../../src/helpers/secrets-loader';
import { getSecretString, newClient } from '../../src/helpers/aws-secrets';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';

describe('secrets-loader', () => {
  const originalEnv = process.env;
  let voiceBotData = {
    DC_TOKEN: '',
    YT_TOKEN: '',
  }
  let cmdProcData = {
    DC_TOKEN: '',
    DC_CLIENT: '',
    YT_TOKEN: '',
    G_ID: '',
  };
  newClient(); // Initialize AWS Secrets Manager client 

  beforeAll(async () => {
    cmdProcData = {
      DC_TOKEN: JSON.parse(await getSecretString('discord/command-processor'))['DC_TOKEN'],
      DC_CLIENT: JSON.parse(await getSecretString('discord/command-processor'))['DC_CLIENT'],
      YT_TOKEN: JSON.parse(await getSecretString('discord/command-processor'))['YT_TOKEN'],
      G_ID: JSON.parse(await getSecretString('discord/command-processor'))['G_ID'],
    };
    voiceBotData = {
      DC_TOKEN: JSON.parse(await getSecretString('discord/voicebot1'))['DC_TOKEN'],
      YT_TOKEN: JSON.parse(await getSecretString('discord/voicebot1'))['YT_TOKEN'],
    };
  })
  beforeEach(() => {
    process.env = { ...originalEnv }; // Reset environment variables before each test
  });

  afterAll(() => {
    process.env = originalEnv; // Restore original environment variables after all tests
  });

  it('should load CommandProcessorSecretOptions from environment variables', async () => {
    process.env.DC_TOKEN = 'test-dc-token';
    process.env.DC_CLIENT = 'test-dc-client';
    process.env.YT_TOKEN = 'test-yt-token';
    process.env.G_ID = 'test-g-id';

    const config = await load<CommandProcessorSecretOptions>(SecretTypes.CommandProcessor);

    expect(config).toEqual({
      DC_TOKEN: 'test-dc-token',
      DC_CLIENT: 'test-dc-client',
      YT_TOKEN: 'test-yt-token',
      G_ID: 'test-g-id',
    });
  });

  it('should throw an error if an environment variable is missing', async () => {
    delete process.env.DC_TOKEN;

    await expect(load<CommandProcessorSecretOptions>(SecretTypes.CommandProcessor)).rejects.toThrow(
      'Environment variable "DC_TOKEN" is not set.'
    );
  });

  it('should load CommandProcessorSecretOptions from AWS Secrets Manager', async () => {
    const config = await load<CommandProcessorSecretOptions>(SecretTypes.CommandProcessor, {
      DC_TOKEN: {
        secretId: 'discord/command-processor',
        secretField: 'DC_TOKEN',
      },
      DC_CLIENT: {
        secretId: 'discord/command-processor',
        secretField: 'DC_CLIENT',
      },
      YT_TOKEN: {
        secretId: 'discord/command-processor',
        secretField: 'YT_TOKEN',
      },
      G_ID: {
        secretId: 'discord/command-processor',
        secretField: 'G_ID',
      }
    })

    expect(config).toEqual(cmdProcData);
  });

  it('should load VoiceBotSecretOptions from AWS Secrets Manager', async () => {
    const config = await load<VoiceBotSecretOptions>(SecretTypes.VoiceBot, {
      DC_TOKEN: {
        secretId: 'discord/voicebot1',
        secretField: 'DC_TOKEN',
      },
      YT_TOKEN: {
        secretId: 'discord/voicebot1',
        secretField: 'YT_TOKEN',
      },
    });

    expect(config).toEqual(voiceBotData);
  });

  it('should load a secret config from a secret string', async () => {
    process.env.DC_TOKEN = 'test-dc-token';
    process.env.DC_CLIENT = 'test-dc-client';
    process.env.YT_TOKEN = 'test-yt-token';
    process.env.G_ID = 'test-g-id';
    const configString = "configOption=DC_TOKEN;secretId=discord/command-processor;secretField=DC_TOKEN";
    const config = await loadFromSecretString<CommandProcessorSecretOptions>(SecretTypes.CommandProcessor, configString);
    console.log(config)
    expect(config).toEqual({
      DC_TOKEN: cmdProcData['DC_TOKEN'] ,
      DC_CLIENT: 'test-dc-client',
      YT_TOKEN: 'test-yt-token',
      G_ID: 'test-g-id',
    });
  })
});