const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── Cobalt API Configuration ──────────────────────────────────────────
// Community Cobalt instances ranked by reliability (from instances.cobalt.best)
const COBALT_INSTANCES = [
    'https://cobalt-api.meowing.de',       // 96% uptime
    'https://cobalt-backend.canine.tools', // 84% uptime
    'https://capi.3kh0.net'                // 80% uptime
];

// Quality presets for the format selection UI
const QUALITY_PRESETS = [
    { id: '4320', label: '8K', resolution: '7680x4320' },
    { id: '2160', label: '4K', resolution: '3840x2160' },
    { id: '1440', label: '2K', resolution: '2560x1440' },
    { id: '1080', label: '1080p', resolution: '1920x1080' },
    { id: '720',  label: '720p',  resolution: '1280x720' },
    { id: '480',  label: '480p',  resolution: '854x480' },
    { id: '360',  label: '360p',  resolution: '640x360' },
];

// ── Helper: Call Cobalt API with automatic fallback ───────────────────
async function callCobalt(body) {
    let lastError = null;

    for (const instance of COBALT_INSTANCES) {
        try {
            console.log(`Trying Cobalt instance: ${instance}`);
            const response = await fetch(`${instance}/`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(30000) // 30s timeout
            });

            const data = await response.json();

            if (data.status === 'error') {
                console.log(`Cobalt instance ${instance} returned error:`, data.error);
                lastError = data.error;
                continue; // try next instance
            }

            console.log(`Success from ${instance}, status: ${data.status}`);
            return data;

        } catch (err) {
            console.log(`Cobalt instance ${instance} failed:`, err.message);
            lastError = err.message;
            continue;
        }
    }

    throw new Error(lastError || 'All Cobalt instances failed');
}

// ── Endpoint: Fetch video metadata ───────────────────────────────────
app.post('/api/info', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Please provide a valid video URL.' });
    }

    try {
        // Use noembed.com for universal metadata (YouTube, Vimeo, Dailymotion, etc.)
        const metaResponse = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
        const meta = await metaResponse.json();

        // Also do a quick Cobalt check to verify the URL is supported
        const cobaltCheck = await callCobalt({
            url: url,
            videoQuality: '720',
            youtubeVideoCodec: 'h264'
        });

        // Build the response with quality presets
        res.json({
            title: meta.title || 'Unknown Video',
            thumbnail: meta.thumbnail_url || '',
            duration: meta.duration || 'N/A',
            author: meta.author_name || '',
            formats: QUALITY_PRESETS.map(q => ({
                format_id: q.id,
                resolution: q.resolution,
                ext: 'mp4',
                label: q.label,
                vcodec: 'h264',
                acodec: 'aac',
                filesize: null
            })),
            url: url,
            cobaltStatus: cobaltCheck.status // 'tunnel' or 'redirect'
        });

    } catch (error) {
        console.error('Error fetching info:', error.message);
        res.status(500).json({ 
            error: 'Failed to retrieve video metadata. Ensure the URL is public and supported.' 
        });
    }
});

// ── Endpoint: Download via Cobalt ────────────────────────────────────
app.get('/api/download', async (req, res) => {
    const { url, quality, title } = req.query;
    if (!url) {
        return res.status(400).send('URL is required');
    }

    try {
        const cobaltResult = await callCobalt({
            url: url,
            videoQuality: quality || '1080',
            youtubeVideoCodec: 'h264',
            filenameStyle: 'pretty'
        });

        if (cobaltResult.status === 'redirect' || cobaltResult.status === 'tunnel') {
            // Cobalt gives us a direct URL — redirect the user's browser to it
            const downloadUrl = cobaltResult.url;

            // Stream the file through our server to set proper filename headers
            let finalTitle = title ? title.trim() : 'aerograb_video';
            finalTitle = finalTitle.replace(/[\r\n]+/g, ' ');
            const filename = cobaltResult.filename || `${finalTitle}.mp4`;

            // Proxy the download through our server for proper headers
            const fileResponse = await fetch(downloadUrl);

            if (!fileResponse.ok) {
                throw new Error(`Failed to fetch file: ${fileResponse.status}`);
            }

            res.header('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
            res.header('Content-Type', fileResponse.headers.get('content-type') || 'video/mp4');

            const contentLength = fileResponse.headers.get('content-length') || 
                                  fileResponse.headers.get('estimated-content-length');
            if (contentLength) {
                res.header('Content-Length', contentLength);
            }

            // Pipe the stream directly to the user
            const { Readable } = require('stream');
            const nodeStream = Readable.fromWeb(fileResponse.body);
            nodeStream.pipe(res);

            nodeStream.on('error', () => {
                if (!res.headersSent) res.status(500).send('Download stream error');
            });

        } else if (cobaltResult.status === 'picker') {
            // Multiple items (e.g., gallery) — redirect to first video
            const firstVideo = cobaltResult.picker.find(p => p.type === 'video') || cobaltResult.picker[0];
            if (firstVideo) {
                return res.redirect(firstVideo.url);
            }
            throw new Error('No downloadable items found');

        } else {
            throw new Error(`Unexpected Cobalt status: ${cobaltResult.status}`);
        }

    } catch (error) {
        console.error('Download error:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Download failed. Please try a different quality or URL.');
        }
    }
});

// ── Health check ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', engine: 'cobalt', version: '2.0.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`AeroGrab backend (Cobalt) running on port ${PORT}`);
});
