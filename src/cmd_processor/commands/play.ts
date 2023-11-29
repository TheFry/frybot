import { SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ChatInputCommandInteraction,
  GuildMember } from 'discord.js';
  
import * as yt from '../../helpers/youtube';
import { redisClient } from '../../helpers/redis';
import { addSong, PlaylistEntry } from '../../helpers/playlist';
import { FREE_CHANNELS_KEY, WATCHED_CHANNELS_KEY } from '../../helpers/common';

const YT_TOKEN = process.env['YT_TOKEN'] as string;
const MAX_BTN_TEXT = 80;
const DEBUG = process.env['DEBUG'] === "1" ? true : false

async function getSelection(interaction: ChatInputCommandInteraction): Promise<Array<string | null>> {
  const q = interaction.options.getString('query');
  if(!q) return [null, null]
  const searchData: yt.YTSearchResult [] = await yt.search(q, 5, 'video', YT_TOKEN);
  if(searchData === null) {
    await interaction.editReply('Failed to query youtube');
    return [null, null];
  }

  const rows: ActionRowBuilder<ButtonBuilder> [] = [];
  searchData.forEach((result: yt.YTSearchResult) => {
    let label = result.name.length > MAX_BTN_TEXT ? `${result.name.slice(0, MAX_BTN_TEXT - 4)} ...` : result.name;
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      [ new ButtonBuilder()
        .setCustomId(`${result.id}`)
        .setLabel(`${label}`)
        .setStyle(ButtonStyle.Primary)
      ]
    ))
  })

  const message = await interaction.editReply({content: 'Pick a song', components: rows });
  let choice = null;
  try {
    choice = await message.awaitMessageComponent({ time: 30_000, componentType: ComponentType.Button });
  } catch(err) {
    interaction.editReply({ content: 'Timeout waiting for input', components: [] })
    return [null, null];
  }
  if(!choice.component.label) return [null, null]
  return [choice.customId, choice.component.label]
}


async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const q = interaction.options.getString('query');
  const next = interaction.options.getBoolean('next') || false;
  const member = interaction.member as GuildMember;
  const channelId = member.voice.channelId;
  await interaction.reply({ content: `Searcing youtube for ${q}` });
  
  if(!channelId) {
    await interaction.editReply('You must be in a voice channel to play music!');
    return;
  }
  
  let [songId, songName] = await getSelection(interaction);
  if(!songId || !songName) return;
  
  // Throw the guildId in redis with the channel id as a key
  // Voicebots use this rather than querying discord for it
  await redisClient?.setnx(`discord:channel:${channelId}:guild-id`, member.guild.id);

  // Add channel to free-channels if it isn't already in watched-channels
  await redisClient?.checkIfWatched(WATCHED_CHANNELS_KEY, FREE_CHANNELS_KEY, channelId);

  const entry: PlaylistEntry = {
    youtubeVideoId: songId,
    youtubeVideoTitle: songName,
    interactionId: interaction.id
  }

  let res = await addSong(channelId, [entry], next);

  interaction.editReply({content: `Added ${songName} to queue`, components: []})
}

const command = new SlashCommandBuilder()
  .setName(`${DEBUG ? 'dev-play' : 'play'}`)
  .setDescription('Play a song')
  .addStringOption(option => 
    option.setName('query')
      .setDescription('The song to search for')
      .setRequired(true)
  )
  .addBooleanOption(option => 
    option.setName('next')
      .setDescription('Play the song next')
      .setRequired(false)
  )

module.exports = { data: command, execute };