#!/usr/bin/env bash
# Solo hace falta si cambia clases de diseño (Tailwind) en public/index.html o public/js/app.js. Requiere Node.
cd "$(dirname "$0")"
npx --yes -p tailwindcss@4 -p @tailwindcss/cli@4 -p tw-animate-css tailwindcss -i input.css -o ../public/css/styles.css --minify
