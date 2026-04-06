const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const ffmpegPath = require('ffmpeg-static');

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint to fetch metadata
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Please provide a valid video URL.' });
    }

    try {
        const info = await youtubedl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            ]
        });

        const formats = info.formats || [];
        
        // Ensure we offer 4K and 8K videos without strictly filtering for MP4. 
        // We will mux them properly using our internal ffmpeg automatically.
        const mappedFormats = formats
            .filter(f => f.vcodec !== 'none')
            .sort((a, b) => (b.height || 0) - (a.height || 0))
            // Remove exact duplicate height records so the menu is clean
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
app.get('/api/download', (req, res) => {
    const { url, format, title } = req.query;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    let finalTitle = title ? title.trim() : "high_bitrate_video";
    // Strip only line-breaks to prevent HTTP header splitting. Let the browser handle standard OS forbidden characters.
    finalTitle = finalTitle.replace(/[\r\n]+/g, ' ');

    // Set correct headers so browser downloads the file (streaming natively as MKV)
    // We use RFC 5987 (filename*=UTF-8'') to natively allow exact unicode titles, hashtags, and special characters
    res.header('Content-Disposition', `attachment; filename="video.mkv"; filename*=UTF-8''${encodeURIComponent(finalTitle)}.mkv`);
    res.header('Content-Type', 'video/x-matroska');

    // Muxing: Specifically instruct yt-dlp to merge the absolute best video track requested with the absolute best audio track available
    const formatReq = format && format !== 'best' ? `${format}+bestaudio/best` : 'bestvideo+bestaudio/best';

    const subprocess = youtubedl.exec(url, {
        format: formatReq,
        output: '-', // output to stdout
        mergeOutputFormat: 'mkv', // MKV container is the only format streamable to stdout reliably
        ffmpegLocation: ffmpegPath,
        noCheckCertificates: true
    });

    // Pipe directly to the client
    subprocess.stdout.pipe(res);

    subprocess.stderr.on('data', (data) => {
         // console.log(data.toString());
    });
    
    subprocess.on('close', () => {
        res.end();
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Video Downloader backend running on port ${PORT}`);
});
