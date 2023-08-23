import { BaseInteraction, Snowflake } from "discord.js"

export interface DiscordResponse {
  interactionId: Snowflake
  content?: string;
  files?: string [];
}

interface Interactions {
  [interaction: Snowflake]: BaseInteraction;
}


const INTERACTION_TIMEOUT = 1000 * 825; // Discord interactions expire after 900 seconds. This gives us 25s of padding
export const interactions: Interactions = {  }

// Add interaction to the list. Set a timeout for removal of the interaction from list when it is no longer available in discord
export async function addInteraction(interaction: BaseInteraction) {
  interactions[interaction.id] = interaction;
  let timeout = interaction.createdTimestamp + INTERACTION_TIMEOUT - Date.now();
  setTimeout((interactionId: Snowflake) => { delete interactions[interactionId] }, timeout, interaction.id);
}
