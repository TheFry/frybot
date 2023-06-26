const ffmpeg = require('fluent-ffmpeg');
import { rmSync } from 'fs';
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ChatInputCommandInteraction, GuildMember, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, ButtonComponent, ButtonInteraction, ModalComponentData, messageLink } from 'discord.js';
import * as yt from '../helpers/youtube';
import { timeConverter, TimeConverterReturn } from '../helpers/common';
import { randomBytes } from 'crypto';

const YT_TOKEN = process.env['YT_TOKEN'] as string;
const DEBUG = process.env['DEBUG'] === "1" ? true : false;
const MODAL_TITLE_LENGTH = 45;

interface ModalData {
  link: string;
  startTime: TimeConverterReturn;
  duration: Number;
}

async function trimVideo(modalData: ModalData, outputFilePath: string, interaction: ChatInputCommandInteraction) {
  let ytStream = await yt.download(modalData.link);
  await ffmpeg(ytStream)
    .setStartTime(modalData.startTime.str)
    .setDuration(modalData.duration)
    .output(outputFilePath)
    .on('end', async () => {
      console.log('Trimming and limiting size complete');
      try {
        await interaction.editReply({ content: `Here's your file`, files: [outputFilePath] });
      } catch(err) {
        console.log(err);
        await interaction.editReply({ content: 'Error: Video size too large' });
      }
      rmSync(outputFilePath);
    })
    .on('error', (err : Error) => {
      console.error('Error trimming and limiting size of MP3:', err);
    })
    .run();
}


async function getModalData(interaction: ChatInputCommandInteraction | ButtonInteraction, videoData: yt.YTSearchResult): Promise<ModalData | null> {
  const startTimeId = 'startTime';
  const durationId = 'duration';
  const urlId = 'url';
  const modalId = await randomBytes(16).toString('hex');

  
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
  await interaction.showModal(modal);
  try {
    submission = await interaction.awaitModalSubmit({ time: 300_000, filter: modalFilter });
  } catch(err) {
    interaction.editReply({ content: 'Timeout waiting for input', components: [] });
    return null;
  }

  await submission.reply('Modal Data Received');
  await submission.deleteReply();  
  
  let startTime = timeConverter(submission.fields.getTextInputValue(startTimeId));
  let duration = Number(submission.fields.getTextInputValue(durationId));
  let link = submission.fields.getTextInputValue(urlId);
  
  if(isNaN(duration) || duration <= 0) return null;
  return { link, startTime, duration }
}


async function getSelection(interaction: ChatInputCommandInteraction, query: string): Promise<[yt.YTSearchResult, ButtonInteraction] | null> {
  const searchData: yt.YTSearchResult [] = await yt.search(query, 5, YT_TOKEN);
  if(searchData === null) {
    await interaction.editReply('Failed to query youtube');
    return null;
  }

  const rows: ActionRowBuilder<ButtonBuilder> [] = [];
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`next`)
      .setLabel(`Next`)
      .setStyle(ButtonStyle.Primary)
    )
  );
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`select`)
      .setLabel(`Select`)
      .setStyle(ButtonStyle.Primary)
    )
  );

  let selectedVideo = 0;
  let current_video = 0;
  let button = null;
  while (button == null && current_video < searchData.length) {
    const message = await interaction.editReply({ content: `https://www.youtube.com/watch?v=${searchData[current_video].id}`, components: rows });
    try {
      button = await message.awaitMessageComponent({ time: 120_000, componentType: ComponentType.Button });
      if(button && button.customId == "next"){
        button = null;
      }
    } catch(err) {
      interaction.editReply({ content: 'Timeout waiting for input', components: [] })
      return null;
    }
    selectedVideo = current_video;
    current_video++;
  } 
  if(button == null) {
    interaction.editReply({ content: 'No video selected', components: [] })
    return null;
  }
  return [searchData[selectedVideo], button];
}


async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const q = interaction.options.getString('query') as string;
  let selection: yt.YTSearchResult | null;
  let modalData: ModalData | null;
  let modalInteraction: ChatInputCommandInteraction | ButtonInteraction;

  try {
    let url = new URL(q);
    if(!url.searchParams.has('v')) {
      await interaction.editReply(`${q} is not a valid youtube video link`);
      return;
    }
    selection = {
      id: url.searchParams.get('v') as string,
      name: q
    }
    let row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`select`)
        .setLabel(`Select`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`cancel`)
        .setLabel(`Cancel`)
        .setStyle(ButtonStyle.Danger)
    )
    let message = await interaction.reply({content: `https://youtube.com/watch?v=${selection.id}`, components: [row]});
    modalInteraction = await message.awaitMessageComponent({ time: 120_000, componentType: ComponentType.Button });
    if(modalInteraction.customId === 'cancel') {
      await interaction.editReply({ content: '#cancelled', components: [] });
      return;
    }
  } catch(err: any) {
    await interaction.reply({ content: `Searcing youtube for ${q}` });
    if(err.code === 'ERR_INVALID_URL') {
      let res = await getSelection(interaction, q);
      if(!res) return;
      selection = res[0];
      modalInteraction = res[1];
    } else {
      throw err;
    }
  }

  await interaction.editReply({ content: `Editing ${selection?.name}`, components: [] })
  modalData = await getModalData(modalInteraction, selection);
  if(!modalData) return;
  await trimVideo(modalData, `${await randomBytes(16).toString('hex')}.mp3`, interaction);
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