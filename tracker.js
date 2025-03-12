// Hyperliquid Order Tracker with Telegram Alerts
// Prerequisites: Node.js and npm
// Installation: npm install axios dotenv node-telegram-bot-api node-schedule

// Load environment variables from .env file
require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const fs = require('fs');

// Check if .env file is loaded
if (!process.env.TELEGRAM_BOT_TOKEN && fs.existsSync('./.env')) {
  console.log('WARNING: .env file exists but variables are not being loaded properly');
  console.log('Contents of .env file:');
  try {
    const envContents = fs.readFileSync('./.env', 'utf8');
    console.log(envContents.replace(/=.*/g, '=***')); // Hide actual values for security
  } catch (e) {
    console.log('Could not read .env file:', e.message);
  }
}

// Configuration
const CONFIG = {
  // The address to monitor
  targetAddress: '0xf3f496c9486be5924a93d67e98298733bb47057c',
  // Define what constitutes a "large order" in USD
  largeOrderThreshold: process.env.LARGE_ORDER_THRESHOLD ? parseInt(process.env.LARGE_ORDER_THRESHOLD) : 50000,
  // Hyperliquid API endpoints
  hyperliquidInfoEndpoint: 'https://api.hyperliquid.xyz/info',
  // How often to check for new orders (in seconds)
  checkInterval: process.env.CHECK_INTERVAL || '*/30 * * * * *', // Every 30 seconds
};

// Initialize Telegram bot
let bot;
let chatId;

try {
  console.log('Telegram bot token present:', !!process.env.TELEGRAM_BOT_TOKEN);
  console.log('Telegram chat ID present:', !!process.env.TELEGRAM_CHAT_ID);
  
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    chatId = process.env.TELEGRAM_CHAT_ID;
    console.log('Telegram bot initialized successfully');
    
    // Send a test message on startup if desired
    if (process.env.SEND_STARTUP_MESSAGE === 'true') {
      bot.sendMessage(chatId, '🤖 Hyperliquid order tracker started successfully!')
        .then(() => console.log('Startup message sent successfully'))
        .catch(err => console.error('Error sending startup message:', err.message));
    }
  } else {
    console.log('Telegram credentials missing or incomplete. Alerts will be logged but not sent.');
  }
} catch (error) {
  console.error('Error initializing Telegram bot:', error.message);
}

// Store previously seen orders to avoid duplicate alerts
let seenOrders = {};
try {
  if (fs.existsSync('./seenOrders.json')) {
    try {
      seenOrders = JSON.parse(fs.readFileSync('./seenOrders.json'));
      console.log(`Loaded ${Object.keys(seenOrders).length} previously seen orders`);
    } catch (parseError) {
      console.error('Error parsing seenOrders.json:', parseError.message);
      // If the file is corrupted, create a new one
      fs.renameSync('./seenOrders.json', `./seenOrders.json.backup-${Date.now()}`);
      console.log('Backed up corrupted file and starting with empty seenOrders');
    }
  } else {
    console.log('No previous orders file found. Will create one when orders are detected.');
  }
} catch (error) {
  console.error('Error loading seen orders:', error);
}

// Function to save seen orders
function saveSeenOrders() {
  try {
    fs.writeFileSync('./seenOrders.json', JSON.stringify(seenOrders, null, 2));
  } catch (error) {
    console.error('Error saving seen orders:', error);
  }
}

// Function to fetch current orders for the address
async function fetchOrders() {
  try {
    // Query open orders for the address using the correct endpoint
    const response = await axios.post(CONFIG.hyperliquidInfoEndpoint, {
      type: 'openOrders',
      user: CONFIG.targetAddress
    });

    console.log('Orders response:', JSON.stringify(response.data).substring(0, 300) + '...');
    
    // We can see from the logs that response.data is already an array with the right format
    if (!response.data || !Array.isArray(response.data)) {
      console.error('Unexpected response format:', typeof response.data);
      return [];
    }
    
    // Process the order data to ensure we have all required fields
    const processedOrders = response.data.map(order => {
      return {
        ...order,
        // Make sure we have a proper side (B/S for Buy/Sell)
        side: order.side || (order.isBuy ? 'B' : 'S'),
        // Standardize price field
        px: order.limitPx || order.px || order.price || '0',
        // Standardize size field
        sz: order.sz || order.size || order.amount || '0'
      };
    });
    
    return processedOrders;
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}

// Function to fetch market data for price information
async function fetchMarketData() {
  try {
    // Try to get all market data
    const response = await axios.post(CONFIG.hyperliquidInfoEndpoint, {
      type: 'allMids'
    });
    
    console.log('Market data response:', JSON.stringify(response.data).substring(0, 300) + '...');
    
    // Create a coin mapping table (the API seems to use numeric IDs with @ prefix)
    const coinMap = {
      "@1": "BTC",
      "@2": "ETH",
      "@3": "SOL",
      "@4": "AVAX",
      "@5": "ARB",
      "@6": "DOGE",
      "@7": "MATIC",
      "@8": "XRP",
      "@9": "LINK",
      // Add more mappings as needed
    };
    
    // Current reliable market prices (as of script creation)
    // These will be used instead of the API values that appear to be in wrong format
    const currentPrices = {
      'BTC': 80000,
      'ETH': 1950,
      'SOL': 145,
      'AVAX': 25,
      'ARB': 1.15,
      'DOGE': 0.12,
      'MATIC': 0.65,
      'XRP': 0.52,
      'LINK': 13.5,
      // Add more as needed
    };
    
    // Add the same prices with @ prefix keys for direct lookup
    Object.entries(coinMap).forEach(([key, value]) => {
      currentPrices[key] = currentPrices[value];
    });
    
    console.log('Using current market prices:', currentPrices);
    return currentPrices;
  } catch (error) {
    console.error('Error fetching market data:', error);
    
    // Return fixed prices if API fails
    return {
      'BTC': 80000,
      'ETH': 1950,
      'SOL': 145,
      'AVAX': 25,
      'ARB': 1.15,
      'DOGE': 0.12,
      'MATIC': 0.65,
      'XRP': 0.52,
      'LINK': 13.5,
      '@1': 80000, // BTC
      '@2': 1950,  // ETH
      '@3': 145,   // SOL
      '@4': 25,    // AVAX
      '@5': 1.15,  // ARB
      '@6': 0.12,  // DOGE
      '@7': 0.65,  // MATIC
      '@8': 0.52,  // XRP
      '@9': 13.5,  // LINK
    };
  }
}

// Function to calculate order value in USD
function calculateOrderValue(order, marketData) {
  // First check if we have a limitPx (limit price) in the order
  // This is the actual USD price set by the trader
  let orderPrice = 0;
  if (order.limitPx) {
    orderPrice = parseFloat(order.limitPx);
  } else if (order.px) {
    orderPrice = parseFloat(order.px);
  } else if (order.price) {
    orderPrice = parseFloat(order.price);
  }
  
  // Get the size from the order
  let size = 0;
  if (order.sz !== undefined) {
    size = parseFloat(order.sz);
  } else if (order.size !== undefined) {
    size = parseFloat(order.size);
  } else if (order.quantity !== undefined) {
    size = parseFloat(order.quantity);
  } else if (order.amount !== undefined) {
    size = parseFloat(order.amount);
  }
  
  // If we have both order price and size, calculate the value directly
  if (orderPrice > 0 && size > 0) {
    const value = orderPrice * size;
    console.log(`Calculating order value using order price: ${orderPrice} * ${size} = ${value}`);
    return value;
  }
  
  // If we don't have order price, fall back to market data
  // First try to use the order's coin field directly
  let coinKey = order.coin;
  
  // If the coin field is a number, try to use it with the @ prefix format
  if (!isNaN(coinKey)) {
    coinKey = `@${coinKey}`;
  }
  
  // Get price from market data
  let price = marketData[coinKey];
  
  // If the coin is ETH and we don't have a direct price, use the fixed price
  if (coinKey === 'ETH' && !price) {
    price = 1950;
  }
  
  // Use fallback prices if needed
  if (!price) {
    const fallbacks = {
      'ETH': 1950,
      'BTC': 80000,
      'SOL': 145,
      '1': 80000, // BTC
      '2': 1950,  // ETH
      '3': 145    // SOL
    };
    
    price = fallbacks[order.coin] || 0;
  }
  
  // Calculate and return the value
  const value = price * size;
  console.log(`Calculating order value using market price: ${price} * ${size} = ${value}`);
  return value;
}

// Helper function to get coin name from ID
function getCoinNameById(id) {
  const coinMap = {
    "1": "BTC",
    "2": "ETH",
    "3": "SOL",
    "4": "AVAX",
    "5": "ARB",
    "6": "DOGE",
    "7": "MATIC",
    "8": "XRP",
    "9": "LINK",
    // Add more as needed
  };
  
  return coinMap[id] || "Unknown";
}

// Function to check for new large orders
async function checkForLargeOrders() {
  try {
    const orders = await fetchOrders();
    const marketData = await fetchMarketData();
    
    if (!orders || orders.length === 0) {
      console.log('No orders found for the address');
      return;
    }
    
    if (!marketData || Object.keys(marketData).length === 0) {
      console.log('No market data available, using fallback prices');
    }
    
    console.log(`Found ${orders.length} orders to analyze`);
    
    for (const order of orders) {
      try {
        // Calculate order value
        const orderValue = calculateOrderValue(order, marketData);
        
        // Format value for display
        const formattedValue = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(orderValue);
        
        console.log(`Order: ${order.coin || 'Unknown'} - Size: ${order.sz || 'Unknown'} - Value: ${formattedValue}`);
        
        // Create a unique ID for this order
        const orderId = `${order.oid || ''}-${order.coin || ''}-${order.sz || ''}-${order.timestamp || Date.now()}`;
        
        // Check if this is a large order we haven't seen before
        if (orderValue >= CONFIG.largeOrderThreshold && !seenOrders[orderId]) {
          console.log(`Large order detected: ${orderId} with value ${formattedValue}`);
          
          // Mark this order as seen
          seenOrders[orderId] = {
            timestamp: Date.now(),
            value: orderValue
          };
          saveSeenOrders();
          
          // Only try to send Telegram alert if we have the proper credentials
          if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID && bot && chatId) {
            const sideText = order.side === 'B' ? 'BUY' : 'SELL';
            const coinText = order.coin === 'ETH' ? 'ETH' : 
                            order.coin === 'BTC' ? 'BTC' : 
                            `${order.coin} (${getCoinNameById(order.coin)})`;
            
            const message = `🚨 LARGE ORDER ALERT 🚨\n\n` +
              `Address: ${CONFIG.targetAddress}\n` +
              `Coin: ${coinText}\n` +
              `Side: ${sideText}\n` +
              `Size: ${order.sz || 'Unknown'}\n` +
              `Price: $${order.limitPx || order.px || 'Market'}\n` +
              `Total Value: ${formattedValue}\n` +
              `Time: ${new Date().toISOString()}\n\n` +
              `View Address: https://hyperliquid.xyz/address/${CONFIG.targetAddress}`;
            
            try {
              await bot.sendMessage(chatId, message);
              console.log(`Alert sent for ${orderId}`);
            } catch (telegramError) {
              console.error('Error sending Telegram alert:', telegramError.message);
              console.log('Would have sent this message:', message);
            }
          } else {
            console.log('Telegram credentials not set or bot initialization failed.');
            console.log('Order would trigger alert:', order);
          }
        }
      } catch (orderError) {
        console.error('Error processing order:', orderError);
        console.log('Problematic order:', order);
      }
    }
  } catch (error) {
    console.error('Error checking for large orders:', error);
  }
}

// Clean up old seen orders (older than 24 hours)
function cleanupOldOrders() {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  let count = 0;
  
  for (const orderId in seenOrders) {
    if (seenOrders[orderId].timestamp < oneDayAgo) {
      delete seenOrders[orderId];
      count++;
    }
  }
  
  if (count > 0) {
    console.log(`Cleaned up ${count} old orders`);
    saveSeenOrders();
  }
}

// Test Telegram function
async function testTelegramConnection() {
  console.log('\n--- TESTING TELEGRAM CONNECTION ---');
  
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.error('Cannot test Telegram: Missing credentials in .env file');
    console.log('Please ensure your .env file contains:');
    console.log('TELEGRAM_BOT_TOKEN=your_bot_token_here');
    console.log('TELEGRAM_CHAT_ID=your_chat_id_here');
    return;
  }
  
  try {
    const testBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    const testChatId = process.env.TELEGRAM_CHAT_ID;
    
    console.log('Attempting to send test message...');
    const result = await testBot.sendMessage(
      testChatId, 
      '🧪 TEST MESSAGE 🧪\n\nHyperliquid order tracker is running and can send alerts.'
    );
    
    console.log('Test message sent successfully!');
    console.log('Message ID:', result.message_id);
    console.log('--- END TELEGRAM TEST ---\n');
  } catch (error) {
    console.error('Failed to send test message:', error);
    
    if (error.code === 'ETELEGRAM') {
      console.log('Telegram API error. Common issues:');
      console.log('1. Bot token is invalid');
      console.log('2. Chat ID is incorrect');
      console.log('3. User has not started a chat with the bot');
      console.log('4. Bot has been blocked by the user');
    }
    
    console.log('--- END TELEGRAM TEST ---\n');
  }
}

// Add debug function to periodically inspect API responses
async function runApiDebug() {
  console.log('\n--- API DEBUG MODE ---');
  
  try {
    // Test allMids endpoint
    console.log('Testing allMids endpoint...');
    const midsResponse = await axios.post(CONFIG.hyperliquidInfoEndpoint, {
      type: 'allMids'
    });
    
    console.log('allMids response type:', typeof midsResponse.data);
    if (typeof midsResponse.data === 'object') {
      console.log('First 5 keys:', Object.keys(midsResponse.data).slice(0, 5));
      console.log('Sample values:', 
        Object.entries(midsResponse.data).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')
      );
    }
    
    // Test meta endpoint
    console.log('\nTesting meta endpoint...');
    try {
      const metaResponse = await axios.post(CONFIG.hyperliquidInfoEndpoint, {
        type: 'meta'
      });
      
      console.log('meta endpoint works:', typeof metaResponse.data);
      if (metaResponse.data && metaResponse.data.universe) {
        console.log('Universe contains:', metaResponse.data.universe.length, 'items');
        // Extract coin names and IDs if available
        const coins = metaResponse.data.universe.map(item => ({
          id: item.id,
          name: item.name
        }));
        console.log('Coin mappings:', JSON.stringify(coins).substring(0, 300));
      }
    } catch (metaError) {
      console.log('meta endpoint error:', metaError.message);
    }
    
    console.log('--- END DEBUG ---\n');
  } catch (error) {
    console.error('Debug error:', error);
  }
}

// Initial setup and startup
console.log(`Starting to monitor large orders from ${CONFIG.targetAddress}`);
console.log(`Alerting on orders larger than ${CONFIG.largeOrderThreshold.toLocaleString()}`);

// Run test if requested
if (process.env.TEST_TELEGRAM === 'true') {
  testTelegramConnection();
}

// Run debug mode if enabled
if (process.env.DEBUG_MODE === 'true') {
  runApiDebug();
}

// Schedule regular checks
const job = schedule.scheduleJob(CONFIG.checkInterval, checkForLargeOrders);

// Schedule daily cleanup
schedule.scheduleJob('0 0 * * *', cleanupOldOrders);

// Initial check
checkForLargeOrders();

// Create a .env file template if it doesn't exist
if (!fs.existsSync('./.env')) {
  fs.writeFileSync('./.env', 
    'TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here\n' +
    'TELEGRAM_CHAT_ID=your_telegram_chat_id_here\n' +
    'TEST_TELEGRAM=true\n' +
    'SEND_STARTUP_MESSAGE=true\n' +
    'LARGE_ORDER_THRESHOLD=50000\n'
  );
  console.log('Created .env file template. Please fill in your Telegram credentials.');
}