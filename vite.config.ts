import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readdirSync } from 'fs';

// Automatically detect all HTML files in root and tools directory
const getHtmlEntries = () => {
  const entries: Record<string, string> = {
    main: resolve(__dirname, 'index.html'),
    tools: resolve(__dirname, 'tools.html'),
    pdfTools: resolve(__dirname, 'pdf-tools.html'),
    imageTools: resolve(__dirname, 'image-tools.html'),
    documentTools: resolve(__dirname, 'document-tools.html'),
    about: resolve(__dirname, 'about.html'),
    contact: resolve(__dirname, 'contact.html'),
    privacy: resolve(__dirname, 'privacy.html'),
    terms: resolve(__dirname, 'terms.html'),
  };

  try {
    const toolFiles = readdirSync(resolve(__dirname, 'tools'));
    toolFiles.forEach(file => {
      if (file.endsWith('.html')) {
        const name = file.replace('.html', '');
        entries[`tools_${name}`] = resolve(__dirname, 'tools', file);
      }
    });
  } catch (e) {
    // ignore
  }

  return entries;
};

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  build: {
    rollupOptions: {
      input: getHtmlEntries(),
    },
  },
});
