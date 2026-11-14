# PDF Studio — Vercel-ready PDF editor

A client-side PDF editing starter built with React, Vite, PDF.js and pdf-lib.

## Run locally
1. Install Node.js 18+.
2. In this folder run `npm install`.
3. Run `npm run dev` and open the local URL.

## Deploy to Vercel
1. Upload this project to a GitHub repository.
2. In Vercel choose **Add New → Project** and import the repository.
3. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. No environment variables or backend are required.

## Editing and font fidelity
PDF Studio renders the original pages using PDF.js and creates edits in the browser with pdf-lib. Unedited PDF objects are retained when the document is saved. The editor overlays a white redaction rectangle over the selected text and draws replacement text in the same area.

PDFs do not reliably expose their original font files to browser editing libraries. Therefore exact font matching cannot be guaranteed for every PDF. For best results, upload a matching TTF/OTF font in the editor before applying the replacement. If no font is supplied, Helvetica is used. Complex scripts, outlined text, scanned PDFs and encrypted/restricted PDFs may need OCR or a dedicated desktop PDF editor. This starter does not perform OCR.

## Privacy
Files are processed locally in the browser; there is no upload endpoint or server-side storage.
