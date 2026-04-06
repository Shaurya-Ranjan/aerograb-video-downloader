import React, { useState } from 'react';
import './index.css';

function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [error, setError] = useState('');

  const fetchVideoInfo = async (e) => {
    e.preventDefault();
    if (!url) return;
    setIsLoading(true);
    setError('');
    setVideoInfo(null);

    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const response = await fetch(`${apiBaseUrl}/api/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch video info');
      setVideoInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadVideo = (quality) => {
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      window.location.href = `${apiBaseUrl}/api/download?url=${encodeURIComponent(url)}&title=${encodeURIComponent(videoInfo?.title || 'video')}&quality=${quality}`;
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>AeroGrab</h1>
        <p>Premium media downloader. No limits.</p>
      </div>

      <div className="downloader-panel">
        <form onSubmit={fetchVideoInfo} className="input-group">
          <input 
            type="url" 
            placeholder="Paste your video link here (YouTube, Meta, etc.)" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoading}
            required
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Processing...' : 'Fetch Video'}
          </button>
        </form>
        {error && <div className="error-msg">{error}</div>}
      </div>

      {videoInfo && (
        <div className="preview-card visible">
          {videoInfo.thumbnail && (
            <img src={videoInfo.thumbnail} alt="Video Thumbnail" className="preview-img" />
          )}
          <div className="preview-info">
            <h2>{videoInfo.title}</h2>
            {videoInfo.author && <p className="author">by {videoInfo.author}</p>}
            <div className="download-options">
              {videoInfo.formats.map((fmt, idx) => (
                <button key={idx} onClick={() => downloadVideo(fmt.format_id)} className="format-btn">
                  Download {fmt.label} ({fmt.ext})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="watermark-footer">
        Developed by Shaurya Ranjan
      </div>
    </div>
  );
}

export default App;
