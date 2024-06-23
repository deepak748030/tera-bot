const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // For file system operations
const axios = require('axios');
const { Telegraf } = require('telegraf');
const dotenv = require('dotenv');
dotenv.config();

// Express setup
const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads'); // Directory to store uploads

// Middleware
app.use(express.json());

// Ensure upload directory exists
fs.mkdir(uploadDir, { recursive: true }).catch(err => {
    console.error('Error creating upload directory:', err);
    process.exit(1); // Exit the process if directory creation fails
});

// Multer storage configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// POST endpoint to handle file uploads or TeraBox links
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        let filename;

        // Check if file was uploaded
        if (req.file) {
            filename = req.file.filename;
        } else if (req.body && req.body.url) { // Ensure req.body exists and contains 'url'
            const videoBuffer = await downloadVideo(req.body.url);
            if (videoBuffer) {
                filename = await saveVideoLocally(videoBuffer);
            } else {
                throw new Error('Failed to download the video');
            }
        } else {
            throw new Error('No file or URL provided');
        }

        res.status(200).json({ filename });
    } catch (error) {
        console.error('Error uploading file or processing TeraBox link:', error);
        res.status(400).json({ error: error.message }); // Adjust the status code and error handling
    }
});

// Function to download video from TeraBox link using RapidAPI
async function downloadVideo(url) {
    const options = {
        method: 'POST',
        url: 'https://terabox-downloader-direct-download-link-generator.p.rapidapi.com/fetch',
        headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'terabox-downloader-direct-download-link-generator.p.rapidapi.com',
            'Content-Type': 'application/json'
        },
        data: { url },
        responseType: 'arraybuffer'
    };

    try {
        const response = await axios.request(options);
        return response.data; // This will be a Buffer
    } catch (error) {
        console.error('Error downloading video:', error);
        throw new Error('Error downloading video. Please try again later.');
    }
}

// Function to save video buffer locally
async function saveVideoLocally(buffer) {
    const filename = Date.now() + '-downloaded_video.mp4';
    const filePath = path.join(uploadDir, filename);

    try {
        await fs.writeFile(filePath, buffer);
        console.log('Video saved locally:', filename);
        return filename;
    } catch (error) {
        console.error('Error saving video locally:', error);
        throw new Error('Error saving video locally.');
    }
}

// Initialize bot webhook
const bot = new Telegraf(process.env.BOT_TOKEN);
const webhookPath = '/api/telegram-bot';

app.post(webhookPath, (req, res) => {
    bot.handleUpdate(req.body, res);
});

// Start command handler
bot.start((ctx) => ctx.reply('Welcome! Send me a TeraBox video link to get the video.'));

// Text message handler
bot.on('text', async (ctx) => {
    const messageText = ctx.message.text;

    if (isValidTeraBoxLink(messageText)) {
        try {
            // Upload the TeraBox link to the server
            const response = await axios.post(`http://localhost:${PORT}/upload`, { url: messageText });
            const { filename } = response.data;

            // Send the video file to Telegram user
            const videoPath = path.join(uploadDir, filename);
            await ctx.replyWithVideo({ source: videoPath });

        } catch (error) {
            console.error('Error:', error.message);
            ctx.reply('Error fetching or sending the video. Please try again later.');
        }
    } else {
        ctx.reply('Please send a valid TeraBox video link.');
    }
});

// Function to validate TeraBox link
function isValidTeraBoxLink(url) {
    return url.includes('terabox.app') || url.includes('freeterabox.com');
}

// Start the bot
bot.launch().then(() => {
    console.log('Telegraf bot started');
}).catch((err) => {
    console.error('Error starting Telegraf bot', err);
});

// Middleware to handle errors
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// Start Express server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
