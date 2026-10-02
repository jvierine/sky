#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
remote=${SKY_DEPLOY_REMOTE:-j@juha.no}
target=/var/www/html/stars
ssh -o BatchMode=yes "$remote" "sudo -n install -d -o j -g j -m 755 '$target'"
# Asset filenames are content hashed. Upload them before switching index.html;
# retain old assets so an already open tab remains usable after a deployment.
rsync -az --exclude=index.html dist/ "$remote:$target/"
rsync -az dist/index.html "$remote:$target/index.html"
curl --fail --silent --show-error --output /dev/null https://juha.no/stars/
