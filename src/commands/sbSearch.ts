const ffmpeg = require('fluent-ffmpeg');
import { rmSync } from 'fs';
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ChatInputCommandInteraction, GuildMember, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ButtonComponent, ButtonInteraction, ModalComponentData } from 'discord.js';
import { Guild, guildList } from '../helpers/guild';
import * as yt from '../helpers/youtube';
import { timeConverter, TimeConverterReturn } from '../helpers/common';

const YT_TOKEN = process.env['YT_TOKEN'] as string;
const DEBUG = process.env['DEBUG'] === "1" ? true : false;
const MODAL_TITLE_LENGTH = 45;

interface modalData {
  link: string;
  startTime: TimeConverterReturn;
  duration: Number;
}


async function trimVideo(modalData: modalData, outputFilePath: string, interaction: ChatInputCommandInteraction) {
  let ytStream = await yt.download(modalData.link);
  console.log(modalData);
  await ffmpeg(ytStream)
    .setStartTime(modalData.startTime.str)
    .setDuration(modalData.duration)
    .output(outputFilePath)
    .on('end', async () => {
      console.log('Trimming and limiting size complete');
      try {
        await interaction.editReply({ content: `Here's your file`, files: [outputFilePath] });
      } catch(err) {
        await interaction.editReply({ content: 'Error: Video size too large' });
      }
      rmSync(outputFilePath);
    })
    .on('error', (err : Error) => {
      console.error('Error trimming and limiting size of MP3:', err);
    })
    .run();
}


async function getModalData(guild: Guild, interaction: ChatInputCommandInteraction, videoData: yt.YTSearchResult): Promise<modalData | null> {
  const readyButtonId = 'ready';
  const startTimeId = 'startTime';
  const durationId = 'duration';
  const urlId = 'url';
  const modalId = 'trimSelection';

  // Wait for user to be ready
  const message = await interaction.editReply({ content: `https://www.youtube.com/watch?v=${videoData.id}\n Follow this link to determine your trim start time and duration`, components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder()
      .setCustomId(readyButtonId)
      .setLabel(`I'm Ready`)
      .setStyle(ButtonStyle.Primary))
  ]});

  let buttonFilter = (interaction: ButtonInteraction) => interaction.customId === readyButtonId; 
  let readyButton: ButtonInteraction;
  try {
    readyButton = await message.awaitMessageComponent({ componentType: ComponentType.Button, filter: buttonFilter, time: 300_000 });
  } catch(err) {
    interaction.editReply({ content: 'Timeout waiting for input', components: [] });
    return null;
  }
  
  // Show trim modal
  let videoName = videoData.name;

  let modal = new ModalBuilder()
    .setTitle(videoName.length <= MODAL_TITLE_LENGTH ? videoName : `${videoName.slice(0, MODAL_TITLE_LENGTH - 4 )} ...`)
    .setCustomId(modalId);
  
  let linkInput = new TextInputBuilder()
    .setCustomId(urlId)
    .setLabel('Video Link (Defaults to selection)')
    .setValue(`https://www.youtube.com/watch?v=${videoData.id}`)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)

  let startTimeInput = new TextInputBuilder()
    .setCustomId(startTimeId)
    .setLabel('Enter trim start time with format HH:MM:SS')
    .setValue('00:00:00')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  let durationInput = new TextInputBuilder()
    .setCustomId(durationId)
    .setLabel('Enter clip duration in seconds')
    .setValue('5')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(linkInput), 
    new ActionRowBuilder<TextInputBuilder>().addComponents(startTimeInput), 
    new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput)
  )

  let modalFilter = (interaction: ModalSubmitInteraction) => interaction.customId === modalId; 
  let submission: ModalSubmitInteraction;
  await readyButton.showModal(modal);
  try {
    submission = await readyButton.awaitModalSubmit({ time: 300_000, filter: modalFilter });
  } catch(err) {
    interaction.editReply({ content: 'Timeout waiting for input', components: [] });
    return null;
  }

  await submission.reply('Modal Data Received');
  await submission.deleteReply();  
  await interaction.editReply({content: 'Trimming Video...', components: [] });
  
  let startTime = timeConverter(submission.fields.getTextInputValue(startTimeId));
  let duration = Number(submission.fields.getTextInputValue(durationId));
  let link = submission.fields.getTextInputValue(urlId);
  
  if(isNaN(duration) || duration <= 0) return null;
  return { link, startTime, duration }
}

async function getSelection(interaction: ChatInputCommandInteraction, query: string): Promise<yt.YTSearchResult | null> {
  const member = interaction.member as GuildMember;
  let guild = guildList[member.guild.id];
  if(!guild) return null;
  const searchData: yt.YTSearchResult [] = await yt.search(query, 5, YT_TOKEN);
  if(searchData === null) {
    await interaction.editReply('Failed to query youtube');
    return null;
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
      return null;
    }
    selectedVideo = current_video;
    current_video++;
  } 
  if(choice == null) return null;
  return searchData[selectedVideo];
}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  const q = interaction.options.getString('query') as string;

  await interaction.reply({ content: `Searcing youtube for ${q}` });
  if(!guildList[member.guild.id]) {
    guildList[member.guild.id] = new Guild(member.guild.id);
  }
  let selection = await getSelection(interaction, q);
  if(!selection) return;
  let modalData = await getModalData(guildList[member.guild.id] as Guild, interaction, selection);
  if(!modalData) return;
  await trimVideo(modalData, './testlol.mp3', interaction);
}

const command = new SlashCommandBuilder()
  .setName(DEBUG ? 'dev-sbsearch' : 'sbsearch')
  .setDescription('Search youtube for a video and extract a sound bite from it')
  .addStringOption(option => 
    option.setName('query')
      .setDescription('The sound to search youtube for')
      .setRequired(true)
  )

module.exports = { data: command, execute };