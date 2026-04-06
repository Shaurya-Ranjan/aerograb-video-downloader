const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Helper to get common yt-dlp arguments
const getCommonArgs = () => {
    const args = {
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
            'referer:youtube.com',
            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        ],
        // ✨ BOT DETECTION BYPASS: Use Android player client which is less strictly challenged
        extractorArgs: 'youtube:player_client=android,web'
    };

    // ✨ COOKIE SUPPORT: If a cookies.txt exists in the root, use it for authentication
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        args.cookies = cookiesPath;
        console.log('Using cookies.txt for authentication');
    }

    return args;
};

// Endpoint to fetch metadata
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Please provide a valid video URL.' });
    }

    try {
        const info = await youtubedl(url, {
            ...getCommonArgs(),
            dumpSingleJson: true,
            preferFreeFormats: true
        });

        const formats = info.formats || [];
        
        const mappedFormats = formats
            .filter(f => f.vcodec !== 'none')
            .sort((a, b) => (b.height || 0) - (a.height || 0))
            .filter((value, index, self) => index === self.findIndex((t) => t.height === value.height))
            .slice(0, 15)
            .map(f => ({
                format_id: f.format_id,
                resolution: f.resolution,
                ext: f.ext,
                vcodec: f.vcodec,
                acodec: f.acodec,
                filesize: f.filesize
            }));

        res.json({
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration_string || info.duration,
            formats: mappedFormats,
            url: url
        });
    } catch (error) {
         console.error('Error fetching info:', error);
         res.status(500).json({ error: 'Failed to retrieve video metadata. Ensure the URL is public and valid.' });
    }
});

// Endpoint to stream download
app.get('/api/download', async (req, res) => {
    const { url, format, title } = req.query;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    let finalTitle = title ? title.trim() : "high_bitrate_video";
    finalTitle = finalTitle.replace(/[\r\n]+/g, ' ').replace(/[^\w\s\u0900-\u097F]/gi, '_');

    const tempId = crypto.randomBytes(8).toString('hex');
    const tempDir = '/tmp';
    
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `aerograb_${tempId}.mkv`);
    const formatReq = format && format !== 'best' ? `${format}+bestaudio/best` : 'bestvideo+bestaudio/best';

    try {
        console.log(`Starting download to temp file: ${tempFilePath}`);
        
        await youtubedl(url, {
            ...getCommonArgs(),
            format: formatReq,
            output: tempFilePath,
            mergeOutputFormat: 'mkv',
            ffmpegLocation: ffmpegPath
        });

        if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
            throw new Error("File creation failed or empty file.");
        }

        res.header('Content-Disposition', `attachment; filename="video.mkv"; filename*=UTF-8''${encodeURIComponent(finalTitle)}.mkv`);
        res.header('Content-Type', 'video/x-matroska');
        res.header('Content-Length', fs.statSync(tempFilePath).size);

        const readStream = fs.createReadStream(tempFilePath);
        readStream.pipe(res);

        res.on('finish', () => {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error(`Error deleting temp file: ${err}`);
                else console.log(`Cleaned up temp file: ${tempFilePath}`);
            });
        });

        res.on('close', () => {
             if (fs.existsSync(tempFilePath)) {
                 fs.unlink(tempFilePath, () => {});
             }
        });

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).send('Download failed during muxing or processing.');
        }
        if (fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, () => {});
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Video Downloader backend running on port ${PORT}`);
});
