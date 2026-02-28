#!/bin/bash
set -e

echo "🚀 [1/4] Copying eck-telemetry source to server..."
# Using configured ssh alias 'antigravity'
scp -r eck-telemetry antigravity:/var/www/

echo "🔨 [2/4] Compiling on remote server..."
ssh antigravity << 'ENDSSH'
set -e

cd /var/www/eck-telemetry
echo "   Running cargo build --release..."
cargo build --release

echo "⚙️  [3/4] Configuring systemd service..."
cat << 'SVC' > /etc/systemd/system/eck-telemetry.service
[Unit]
Description=Eck Telemetry Hub
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/eck-telemetry
ExecStart=/var/www/eck-telemetry/target/release/eck-telemetry
Restart=on-failure
Environment="DATABASE_URL=postgres://openpg:openpgpwd@localhost:5432/eckwms"
Environment="PORT=3203"

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
systemctl enable eck-telemetry
systemctl restart eck-telemetry

echo "🌐 [4/4] Configuring Nginx..."
NGINX_CONF="/etc/nginx/sites-available/xelth.com"

# Check if /T/ location already exists to avoid duplicates
if grep -q "location /T/" "$NGINX_CONF"; then
    echo "   Nginx location /T/ already exists. Skipping injection."
else
    echo "   Injecting location /T/ into $NGINX_CONF..."
    # Injecting location block right before last closing brace of server block
    sed -i '/^}$/i \
    location /T/ {\n\
        proxy_pass [http://127.0.0.1:3203](http://127.0.0.1:3203);\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n' "$NGINX_CONF"
fi

nginx -t && systemctl reload nginx

echo "✅ Deployment successful! Service is running on port 3203."
ENDSSH
