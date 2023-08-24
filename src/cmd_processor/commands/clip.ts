import { SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType, 
  ChatInputCommandInteraction, 
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  ButtonInteraction,
  ModalMessageModalSubmitInteraction } from 'discord.js';

import * as yt from '../../helpers/youtube';
import { enqueue } from '../../helpers/message_queue';
import { addInteraction } from '../../helpers/interactions';
import { CLIP_QUEUE_KEY, ClipJob, timeConverter, TimeConverterReturn } from '../../helpers/common';
import { randomBytes } from 'crypto';

const YT_TOKEN = process.env['YT_TOKEN'] as string;
const DEBUG = process.env['DEBUG'] === "1" ? true : false;
const MODAL_TITLE_LENGTH = 45;

interface ModalData {
  link: string;
  startTime: TimeConverterReturn;
  duration: number;
  interaction: ModalMessageModalSubmitInteraction;
}

async function getModalData(interaction: ButtonInteraction, videoData: yt.YTSearchResult): Promise<ModalData | null> {
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
  let submission: ModalMessageModalSubmitInteraction;
  await interaction.showModal(modal);
  try {
    submission = await interaction.awaitModalSubmit({ time: 600_000, filter: modalFilter }) as ModalMessageModalSubmitInteraction;
    addInteraction(submission);
  } catch(err) {
    interaction.editReply({ content: 'Timeout waiting for input', components: [] });
    return null;
  }
  
  await submission.update('Trimming Video...');
  let startTime = timeConverter(submission.fields.getTextInputValue(startTimeId));
  let duration = Number(submission.fields.getTextInputValue(durationId));
  let link = submission.fields.getTextInputValue(urlId);
  
  if(isNaN(duration) || duration <= 0) return null;
  return { link, startTime, duration, interaction: submission };
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
      .setCustomId(`select`)
      .setLabel(`Select Video`)
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId(`next`)
      .setLabel(`Next Video`)
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`cancel`)
      .setLabel(`Cancel`)
      .setStyle(ButtonStyle.Danger)
  ));
  
  let button: ButtonInteraction | null = null;
  let selectedVideo: yt.YTSearchResult | null = null;
  let message = await interaction.editReply({ content: `https://www.youtube.com/watch?v=${searchData[0].id}`, components: rows });
  for(let i = 0; i < searchData.length; i++) {
    try {
      button = await message.awaitMessageComponent({ time: 120_000, componentType: ComponentType.Button });
      if(button.customId == "next"){
        if(i + 1 < searchData.length) {
          await button.update({ content: `https://www.youtube.com/watch?v=${searchData[i + 1].id}`, components: rows });
        } else {
          await interaction.editReply({ content: 'No video selected. Try a differnt search or use a direct url', components: [] });
          return null;
        }
      } else if(button.customId == "select") {
        selectedVideo = searchData[i]; 
        break;
      } else {
        await interaction.editReply({ content: '#cancelled', components: [] });
        return null;
      }
    } catch(err) {
      await interaction.editReply({ content: 'Timeout waiting for input', components: [] })
      return null;
    }
  }

  if(selectedVideo && button) {
    return [selectedVideo, button];
  }
  return null;
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
  let job: ClipJob = {
    video: selection,
    startTime: modalData.startTime.str,
    duration: modalData.duration,
    interactionId: modalData.interaction.id
  }
  
  let res = (await enqueue(CLIP_QUEUE_KEY, [job]))[0]
  if(res) {
    if(res.error || res.status?.jsonSet !== 'OK') {
      console.log(`Error adding clip job - ${JSON.stringify(res)}}`);
      await modalData.interaction.editReply(`Failed adding clip job to the processing queue.`);
    }
  }
}


const command = new SlashCommandBuilder()
  .setName(DEBUG ? 'dev-clip' : 'clip')
  .setDescription('Clip a youtube video')
  .addStringOption(option => 
    option.setName('query')
      .setDescription('Youtube search query OR video url')
      .setRequired(true)
  )

module.exports = { data: command, execute };