# hyperliquidTracker

# Hyperliquid Order Tracker

A Node.js application that monitors specific Ethereum addresses on the Hyperliquid exchange and sends Telegram alerts when large orders are detected.

## Features

- Real-time monitoring of open orders for specific addresses on Hyperliquid
- Configurable threshold for large order detection
- Telegram alerts for instant notifications
- Reliable price calculation using limit prices from orders
- Duplicate alert prevention
- Auto-cleanup of old order history

- * need to update auto price fetching. I have it with some default values for the coins.

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm
- A Telegram account and bot token

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/hyperliquid-tracker.git
   cd hyperliquid-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following content:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   TELEGRAM_CHAT_ID=your_telegram_chat_id_here
   LARGE_ORDER_THRESHOLD=50000
   SEND_STARTUP_MESSAGE=true
   TEST_TELEGRAM=true
   ```

### Creating a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Start a chat with BotFather and send the command `/newbot`
3. Follow the prompts to create your bot
4. BotFather will provide a token - copy this into your `.env` file

### Getting Your Telegram Chat ID

1. Send a message to your newly created bot
2. Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` in your browser
   (replace `<YOUR_BOT_TOKEN>` with your actual bot token)
3. Look for `"chat":{"id":123456789,` in the response - this number is your chat ID
4. Add this chat ID to your `.env` file

## Usage

Start the tracker:

```bash
node tracker.js
```

The application will:
- Verify your Telegram configuration on startup 
- Begin monitoring the configured address for orders
- Send alerts when orders exceed your threshold
- Automatically clean up old data

## Configuration

Edit the following parameters in your `.env` file:

- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `TELEGRAM_CHAT_ID`: Your Telegram chat ID
- `LARGE_ORDER_THRESHOLD`: Minimum USD value to trigger alerts (default: 50000)
- `SEND_STARTUP_MESSAGE`: Send a message when the tracker starts (true/false)
- `TEST_TELEGRAM`: Test Telegram connectivity on startup (true/false)
- `DEBUG_MODE`: Enable detailed API debugging logs (true/false)

To monitor a different address, modify the `targetAddress` in the configuration section of `tracker.js`.

## Running as a Service

### Using PM2 (Linux/macOS):

```bash
# Install PM2
npm install -g pm2

# Start the tracker
pm2 start tracker.js --name "hyperliquid-tracker"

# Configure PM2 to start on system boot
pm2 startup
pm2 save
```

### Using PM2 (Windows):

```bash
# Install PM2 and startup script
npm install -g pm2 pm2-windows-startup
pm2-startup install

# Start the tracker
pm2 start tracker.js --name "hyperliquid-tracker"
pm2 save
```

## Troubleshooting

If you encounter issues:

1. Make sure your `.env` file is properly formatted
2. Verify that you've started a conversation with your Telegram bot
3. Check that your bot token and chat ID are correct
4. Run with `DEBUG_MODE=true` to see detailed API responses
5. Run with `TEST_TELEGRAM=true` to verify Telegram connectivity

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. I did this with a lot of help from Claude. 

## License

This project is licensed under the MIT License - see the LICENSE file for details.
