# Use a standard Node.js image
FROM node:18-slim

# Install system dependencies (Python3 is required for yt-dlp)
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create work directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Use the dynamic PORT from environment
ENV PORT 3000
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
