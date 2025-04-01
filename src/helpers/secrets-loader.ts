import { usage } from './common'
import { newClient as newSecretClient, getSecretString } from './aws-secrets';

export enum SecretTypes {
  CommandProcessor = 0,
  VoiceBot = 1,
}

export interface CommandProcessorSecretOptions {
  DC_TOKEN: string;
  DC_CLIENT: string;
  YT_TOKEN: string;
  G_ID: string;
}

export interface VoiceBotSecretOptions {
  YT_TOKEN: string;
  DC_TOKEN: string;
}

export interface AWSSecretOverride {
  secretId: string;
  secretVersion?: string;
  secretField?: string;
}

type SecretOptions =
  | CommandProcessorSecretOptions
  | VoiceBotSecretOptions

export type AWSSecretOverrides<T extends SecretOptions> = {
  [K in keyof T]?: AWSSecretOverride;
};

const SecretMap: Record<SecretTypes, SecretOptions> = {
  [SecretTypes.CommandProcessor]: {
    DC_TOKEN: "",
    DC_CLIENT: "",
    YT_TOKEN: "",
    G_ID: "",
  },
  [SecretTypes.VoiceBot]: {
    YT_TOKEN: "",
    DC_TOKEN: "",
  },
};


// Function to load environment variables dynamically based on the enum
export async function load<T extends SecretOptions>(
  type: SecretTypes,
  awsOverride?: AWSSecretOverrides<T>
): Promise<T> {
  const config = { ...SecretMap[type] } as T; // Clone the selected config to avoid mutating the original
  if(awsOverride) await newSecretClient();
  for (const key of Object.keys(config) as Array<keyof T>) {
    if (awsOverride && awsOverride[key]) {
      const override = awsOverride[key];
      const secretString = await getSecretString(override.secretId, override.secretVersion);
      if (override.secretField !== undefined) {
        const parsedSecret = JSON.parse(secretString)[override.secretField];
        if (typeof parsedSecret !== typeof config[key]) {
          throw new Error(
            `Type mismatch for secret field "${override.secretField}". Expected ${typeof config[key]} but got ${typeof parsedSecret[override.secretField]}.`
          );
        }
        config[key] = parsedSecret as T[keyof T];
      } else {
        if (typeof secretString !== typeof config[key]) {
          throw new Error(
            `Type mismatch for secret "${key as string}". Expected ${typeof config[key]} but got ${typeof secretString}.`
          );
        }        
        config[key] = secretString as T[keyof T];
      }
    } else {
      const envValue = process.env[key as string];
      if (envValue === undefined) {
        usage(key as string);
        throw new Error(`Environment variable "${key as string}" is not set.`);
      }
      if (typeof envValue !== typeof config[key]) {
        throw new Error(
          `Type mismatch for environment variable "${key as string}". Expected ${typeof config[key]} but got ${typeof envValue}.`
        );
      }
      config[key] = envValue as T[keyof T];
    }
  }
  return config;
}

export async function loadFromSecretString<T extends SecretOptions>(
  secretType: SecretTypes,
  awsOverridesString: string
): Promise<T> {
  // Parse the AWS overrides string into a structured object
  const awsOverrides: AWSSecretOverrides<T> = {};

  // Split the string by spaces to separate groups of options
  const groups = awsOverridesString.split(' ');

  // Get the valid keys for the specific secret type
  const validKeys = Object.keys(SecretMap[secretType]) as Array<keyof T>;

  for (const group of groups) {
    // Split each group by semicolons to process key-value pairs
    const pairs = group.split(';');
    let currentKey: keyof T | null = null;

    for (const pair of pairs) {
      const [option, value] = pair.split('=');
      if (!option || !value) {
        throw new Error(`Invalid format in AWS overrides string: "${pair}"`);
      }

      if (option === 'configOption') {
        // Validate that the configOptionName exists as a key in the specific secret type
        if (!validKeys.includes(value as keyof T)) {
          throw new Error(`Invalid configOptionName "${value}" for secret type "${SecretTypes[secretType]}"`);
        }
        // Start a new ConfigOptionName group
        currentKey = value as keyof T;
        if (!awsOverrides[currentKey]) {
          awsOverrides[currentKey] = { secretId: '' };
        } else {
          throw new Error(`Duplicate configOptionName "${currentKey as string}" in AWS overrides string`);
        }
      } else if (currentKey) {
        // Add properties to the current ConfigOptionName
        if (option === 'secretId') {
          awsOverrides[currentKey]!.secretId = value;
        } else if (option === 'secretField') {
          awsOverrides[currentKey]!.secretField = value;
        } else if (option === 'secretVersion') {
          awsOverrides[currentKey]!.secretVersion = value;
        } else {
          throw new Error(`Unknown option "${option}" in AWS overrides string`);
        }
      } else {
        throw new Error(`Option "${option}" encountered before a valid configOption`);
      }
    }

    if(!currentKey || awsOverrides[currentKey]?.secretId == '') {
      throw new Error(`No ConfigOptionName found in AWS overrides string`);
    }
  }
  // Load the configuration using the parsed AWS overrides
  return await load<T>(secretType, awsOverrides);
}