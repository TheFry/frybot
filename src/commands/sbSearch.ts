import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Guild, guildList } from '../helpers/guild';
import * as yt from '../helpers/youtube';

const YT_TOKEN = process.env['YT_TOKEN'] as string;
const DEBUG = process.env['DEBUG'] === "1" ? true : false

async function getSelection(interaction: ChatInputCommandInteraction, query: string): Promise<void> {
  const member = interaction.member as GuildMember;
  let guild = guildList[member.guild.id];
  if(!guild) return;
  const searchData: yt.YTSearchResult [] = await yt.search(query, 5, YT_TOKEN);
  if(searchData === null) {
    await interaction.editReply('Failed to query youtube');
    return;
  }
  const rows: ActionRowBuilder<ButtonBuilder> [] = [];
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    [ new ButtonBuilder()
      .setCustomId(`next`)
      .setLabel(`Next`)
      .setStyle(ButtonStyle.Primary)
    ]
    ));
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      [ new ButtonBuilder()
        .setCustomId(`select`)
        .setLabel(`Select`)
        .setStyle(ButtonStyle.Primary)
      ]
      ));
  let selectedVideo = 0;
  let current_video = 0;
  let choice = null;
  while (choice == null && current_video < searchData.length) {
    const message = await interaction.editReply({ content: `https://www.youtube.com/watch?v=${searchData[current_video].id}`, components: rows });
    try {
      choice = await message.awaitMessageComponent({ time: 30_000, componentType: ComponentType.Button });
      if(choice && choice.customId == "next"){
          choice = null;
      }
    } catch(err) {
      interaction.editReply({ content: 'Timeout waiting for input', components: [] })
      return;
    }
    selectedVideo = current_video;
    current_video++;
  } 
  if(choice == null) return;
  const fileName = guild.guildId+"sb";
  await yt.download(searchData[selectedVideo].id, fileName);
  await guild.setSoundBite(fileName);
  await interaction.editReply({ content: `https://www.youtube.com/watch?v=${searchData[selectedVideo].id} \n Enter video trim \n /sbTrim 00:00:00 00:00:00 #h/m/s`, components: [] })
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  const q = interaction.options.getString('query') as string;

  await interaction.reply({ content: `Searcing youtube for ${q}` });
  if(!guildList[member.guild.id]) {
    guildList[member.guild.id] = new Guild(member.guild.id);
  }
  await getSelection(interaction, q);
}

const command = new SlashCommandBuilder()
  .setName(`sbsearch`)
  .setDescription('Search youtube for a video and extract a sound bite from it')
  .addStringOption(option => 
    option.setName('query')
      .setDescription('The sound to search youtube for')
      .setRequired(true)
  )

module.exports = { data: command, execute };