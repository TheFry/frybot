import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { logConsole, LogType } from "./logger";

export class SecretsClientNotInitializedError extends Error {
  constructor(message = "Secrets client not initialized. Call newClient() first.") {
    super(message);
    this.name = "SecretsClientNotInitializedError";
    Object.setPrototypeOf(this, SecretsClientNotInitializedError.prototype);
  }
}

let secretsClient: SecretsManagerClient = new SecretsManagerClient();
export function newClient(sso_profile?: string) {
  const clientConfig = sso_profile !== undefined ? { profile: sso_profile } : {};
  return new SecretsManagerClient(clientConfig);
}

export async function getSecretString(secretId: string, secretVersion?: string, client = secretsClient): Promise<string> {
  try {
    const secret = await client.send(new GetSecretValueCommand({
      SecretId: secretId,
      VersionId: secretVersion
    }))
    return secret.SecretString !== undefined ? secret.SecretString : "";
  } catch(err) {
    logConsole({ msg: `Error getting secret ${secretId} - ${err}`, type: LogType.Error });
    throw err;
  }
}