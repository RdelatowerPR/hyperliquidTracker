// Simple test script to verify Telegram bot functionality
// Save this as telegram-test.js in the same directory as your tracker.js file

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

console.log('--- TELEGRAM TEST SCRIPT ---');

// Check if .env file exists
if (fs.existsSync('./.env')) {
  console.log('.env file exists');
  try {
    const envContents = fs.readFileSync('./.env', 'utf8');
    // Print each line with values hidden
    const envLines = envContents.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    console.log('ENV variables found:');
    envLines.forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        console.log(`- ${parts[0]}: ${parts[0].includes('TOKEN') ? '******' : 'value present'}`);
      }
    });
  } catch (e) {
    console.log('Could not read .env file:', e.message);
  }
} else {
  console.log('ERROR: .env file does not exist in the current directory!');
  console.log('Current directory:', process.cwd());
}

// Check process.env variables
console.log('\nENV variables loaded:');
console.log('- TELEGRAM_BOT_TOKEN present:', !!process.env.TELEGRAM_BOT_TOKEN);
console.log('- TELEGRAM_CHAT_ID present:', !!process.env.TELEGRAM_CHAT_ID);

// Try to send a message
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  console.log('\nAttempting to send test message...');
  
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
  bot.sendMessage(process.env.TELEGRAM_CHAT_ID, '🧪 TELEGRAM TEST MESSAGE 🧪\n\nIf you see this, your Telegram bot is working correctly!')
    .then(result => {
      console.log('SUCCESS! Message sent. Message ID:', result.message_id);
      console.log('Your Telegram bot is working correctly.');
    })
    .catch(error => {
      console.log('ERROR! Failed to send message:', error.message);
      if (error.code === 'ETELEGRAM') {
        console.log('\nPossible reasons:');
        console.log('1. Bot token is invalid');
        console.log('2. Chat ID is incorrect');
        console.log('3. You have not started a chat with your bot');
        console.log('4. Bot has been blocked');
      }
    });
} else {
  console.log('\nCannot send test message: Missing bot token or chat ID');
}