import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ChatInputCommandInteraction, GuildMember, ActionRow, TextInputComponent, InteractionEditReplyOptions, InteractionReplyOptions, AnyComponentBuilder } from 'discord.js';
import { memoryUsage } from 'process';
import { Guild, guildList } from '../helpers/guild';
import * as yt from '../helpers/youtube';

const YT_TOKEN = process.env['YT_TOKEN'] as string;
const MAX_BTN_TEXT = 80;
const DEBUG = process.env['DEBUG'] === "1" ? true : false

async function getSelection(interaction: ChatInputCommandInteraction): Promise<Array<string | null>> {
  const member = interaction.member as GuildMember;
  const guildId = member.guild.id;
  const q = interaction.options.getString('query');
  if(!q) return [null, null]
  const searchData: yt.YTSearchResult [] = await yt.search(q, 5, YT_TOKEN);
  if(searchData === null) {
    await interaction.editReply('Failed to query youtube');
    if(!guildList[`${guildId}`].audio.player.checkPlayable()) {
      guildList[`${guildId}`].setIdleTimeout();
    }
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
    if(!guildList[`${guildId}`].audio.player.checkPlayable()) {
      guildList[`${guildId}`].setIdleTimeout();
    }
    return [null, null];
  }
  if(!choice.component.label) return [null, null]
  return [choice.customId, choice.component.label]
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  const guildId = member.guild.id;
  if(!guildList[`${guildId}`]) {
    guildList[`${guildId}`] = new Guild(guildId);
  } else if(guildList[`${guildId}`].idleTimer !== null) {
    guildList[`${guildId}`].setIdleTimeout(0);
  }
  const q = interaction.options.getString('query');
  await interaction.reply({ content: `Searcing youtube for ${q}` });

  let [songId, songName] = await getSelection(interaction);
  if(!songId || !songName) return;
  if(!guildList[`${guildId}`].checkInitAudio()) {
    await guildList[`${guildId}`].initAudio(interaction);
  } 
  guildList[`${guildId}`].addSong(songName, songId);
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

module.exports = { data: command, execute };