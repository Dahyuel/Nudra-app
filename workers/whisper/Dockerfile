FROM python:3.11-slim

WORKDIR /app

# Install a small static ffmpeg build instead of the full Debian package to keep the image size down
RUN apt-get update && apt-get install -y --no-install-recommends wget xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && wget -q https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
    && tar -xf ffmpeg-release-amd64-static.tar.xz -C /usr/local/bin --strip-components=1 --wildcards '*/ffmpeg' '*/ffprobe' \
    && rm ffmpeg-release-amd64-static.tar.xz \
    && apt-get purge -y wget xz-utils \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .

EXPOSE 5001

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001"]