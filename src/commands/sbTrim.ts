import { SlashCommandBuilder, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { Guild, guildList } from '../helpers/guild';
import { setTimeout } from 'timers/promises';
import { existsSync } from 'fs';

const DEBUG = process.env['DEBUG'] === "1" ? true : false
interface TimeConverterReturn {
  str: string;
  num: number;
}
async function getSelection(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember;
  let guild = guildList[member.guild.id];
  if(!guild) return;
  let start:string|TimeConverterReturn|null = interaction.options.getString('starttime');
  let end:string|TimeConverterReturn|null = interaction.options.getString('endtime');
  if( !start || !end) return;

  function TimeConverter(time : string): TimeConverterReturn{
    let hours = "00";
    let minutes = "00";
    let seconds = "00";
    let str,num;
    
    if(time.length <= 3){
        seconds = time.length == 1? `0`+time : time.substring(0,2);
    }
    else if(time.length<=6){
        minutes = time.length == 4? `0`+time[3]: time.substring(3,2);
        seconds = time.substring(0,2);
    }else if(time.length <= 8){
        hours = time.length == 7? `0`+time[6]: time.substring(6,2);
        minutes = time.substring(3,2);
        seconds = time.substring(0,2);
    }
    str = `${hours}:${minutes}:${seconds}`;
    num = parseInt(seconds)+ parseInt(minutes)*60 + parseInt(hours)*60*60;
    return { str:str, num:num };
     
    }
    const ffmpeg = require('fluent-ffmpeg');


async function trimMP3(inputFilePath : string, startTime : TimeConverterReturn, endTime : TimeConverterReturn, outputFilePath : string) {
    const ffmpeg = require('fluent-ffmpeg');

  await ffmpeg(inputFilePath)
    .setStartTime(startTime.str)
    .setDuration(endTime.num - startTime.num)
    .output(outputFilePath)
  //  .audioBitrate(`4096k`)
    .on('end', async () => {
      console.log('Trimming and limiting size complete');
      await interaction.editReply({ content: `Here's your file`, files: [outputFile] });
    })
    .on('error', (err : Error) => {
      console.error('Error trimming and limiting size of MP3:', err);
    })
    .run();
}
    start = TimeConverter(start);
    end = TimeConverter(end);
    const inputFile = "./"+await guild.getSoundBite();
    const outputFile = inputFile+"o.mp3";
    await trimMP3(inputFile,start,end,outputFile);
    

}

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: `Loading`});
  const member = interaction.member as GuildMember;
  let guild = guildList[member.guild.id];
  if(!guild) {
    guild = new Guild(member.guild.id);
    guildList[member.guild.id] = guild;
  } else if(guild.checkTimeout()) {
    guild.setIdleTimeout(0);
  }
  await getSelection(interaction);
  
}

const command = new SlashCommandBuilder()
  .setName(`sbtrim`)
  .setDescription('Search youtube for a video and extract a sound bite from it')
  .addStringOption(option => 
    option.setName('starttime')
      .setDescription('The sound to search youtube for')
      .setRequired(true)
  )
  .addStringOption(option => 
    option.setName('endtime')
      .setDescription('The sound to search youtube for')
      .setRequired(true)
  )

module.exports = { data: command, execute };